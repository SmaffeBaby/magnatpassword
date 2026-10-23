#!/usr/bin/env python3
"""Render a frozen payment snapshot to a PDF on stdout, without network access."""
import colorsys
import io
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Flowable

INK = colors.HexColor('#263449')
MUTED = colors.HexColor('#64748b')
BORDER = colors.HexColor('#e2e8f0')
PAPER = colors.HexColor('#f8fafc')
ACCENT = colors.HexColor('#4f46e5')
PAGE_W, PAGE_H = landscape(A4)
WIDTH = PAGE_W - 40 * mm


def register_fonts():
    roots = [Path(os.environ.get('REPORT_FONT_DIR', '/usr/share/fonts'))]
    for root in roots:
        matches = list(root.rglob('DejaVuSans.ttf')) if root.exists() else []
        if not matches:
            continue
        regular = matches[0]
        bold = regular.with_name('DejaVuSans-Bold.ttf')
        pdfmetrics.registerFont(TTFont('Report', str(regular)))
        pdfmetrics.registerFont(TTFont('ReportBold', str(bold if bold.exists() else regular)))
        pdfmetrics.registerFontFamily('Report', normal='Report', bold='ReportBold', italic='Report', boldItalic='ReportBold')
        return
    raise RuntimeError('DejaVu Sans is required for Cyrillic PDF reports')


def text(value):
    return escape(re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', str(value)))


def date_label(value):
    return datetime.strptime(value, '%Y-%m-%d').strftime('%d.%m.%Y')


def money(cents, currency=''):
    sign = '-' if cents < 0 else ''
    value = abs(int(cents))
    number = f'{value // 100:,}'.replace(',', ' ') + f',{value % 100:02d}'
    return sign + number + (' ' + currency if currency else '')


def percent(value, total):
    return f'{value / total * 100:.1f}%'.replace('.', ',') if total else '0%'


def service_color(key):
    number = 0
    for character in key:
        number = (number * 31 + ord(character)) & 0xffffffff
    return colors.Color(*colorsys.hls_to_rgb((number % 360) / 360, .45, .62))


MONTHS = ['янв.', 'фев.', 'март', 'апр.', 'май', 'июнь', 'июль', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.']


def month_keys(first, last):
    year, month = map(int, first[:7].split('-'))
    while f'{year:04d}-{month:02d}' <= last[:7]:
        yield f'{year:04d}-{month:02d}'
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)


class MonthlyChart(Flowable):
    def __init__(self, keys, payments, currency):
        Flowable.__init__(self)
        self.width, self.height = WIDTH, 245
        self.keys, self.currency = keys, currency
        self.amounts = {key: defaultdict(int) for key in keys}
        for payment in payments:
            key = payment['paidOn'][:7]
            if key in self.amounts:
                self.amounts[key][payment['serviceKey']] += payment['amountCents']

    def draw(self):
        canvas = self.canv
        left, right, bottom, top = 76, WIDTH - 12, 30, self.height - 28
        totals = {key: sum(items.values()) for key, items in self.amounts.items()}
        ceiling = max(totals.values(), default=0) or 100
        ceiling *= 1.15
        plot_h = top - bottom
        canvas.setFont('Report', 8)
        for tick in range(5):
            value = ceiling * tick / 4
            y = bottom + plot_h * tick / 4
            canvas.setStrokeColor(BORDER)
            canvas.setLineWidth(.5)
            canvas.line(left, y, right, y)
            canvas.setFillColor(MUTED)
            canvas.drawRightString(left - 9, y - 3, money(round(value)))
        step = (right - left) / max(1, len(self.keys))
        bar_w = min(42, step * .64)
        for index, key in enumerate(self.keys):
            x = left + step * (index + .5) - bar_w / 2
            running = 0
            for service, amount in sorted(self.amounts[key].items()):
                if amount <= 0:
                    continue
                height = amount / ceiling * plot_h
                canvas.setFillColor(service_color(service))
                canvas.rect(x, bottom + running / ceiling * plot_h, bar_w, height, fill=1, stroke=0)
                running += amount
            canvas.setFillColor(INK)
            canvas.setFont('Report', 7)
            if totals[key]:
                canvas.drawCentredString(x + bar_w / 2, bottom + totals[key] / ceiling * plot_h + 5, money(totals[key]))
            year, month = map(int, key.split('-'))
            canvas.setFillColor(MUTED)
            canvas.drawCentredString(x + bar_w / 2, 14, f'{MONTHS[month - 1]} {year}')


class DistributionChart(Flowable):
    def __init__(self, services, total, currency):
        Flowable.__init__(self)
        self.services, self.total, self.currency = services, total, currency
        self.width, self.height = WIDTH, 28 * len(services) + 12

    def draw(self):
        canvas = self.canv
        max_value = max((service['cents'] for service in self.services), default=0) or 1
        left, right = 285, WIDTH - 185
        for index, service in enumerate(self.services):
            y = self.height - 20 - index * 28
            label = service['name']
            while pdfmetrics.stringWidth(label, 'Report', 8) > left - 24:
                label = label[:-2] + '…'
            canvas.setFont('Report', 8)
            canvas.setFillColor(INK)
            canvas.drawString(0, y, label)
            canvas.setFillColor(PAPER)
            canvas.roundRect(left, y - 1, right - left, 10, 3, fill=1, stroke=0)
            canvas.setFillColor(service_color(service['key']))
            canvas.rect(left, y - 1, max(0, service['cents'] / max_value * (right - left)), 10, fill=1, stroke=0)
            canvas.setFillColor(INK)
            canvas.drawRightString(WIDTH, y, f"{money(service['cents'], self.currency)}  /  {percent(service['cents'], self.total)}")


def render(snapshot):
    register_fonts()
    summary, payments = snapshot['summary'], snapshot['payments']
    styles = {
        'title': ParagraphStyle('Title', fontName='ReportBold', fontSize=23, leading=30, textColor=INK, spaceAfter=12),
        'h': ParagraphStyle('Heading', fontName='ReportBold', fontSize=15, leading=21, textColor=INK, spaceAfter=10),
        'body': ParagraphStyle('Body', fontName='Report', fontSize=10, leading=16, textColor=INK, spaceAfter=9),
        'note': ParagraphStyle('Note', fontName='Report', fontSize=8, leading=12, textColor=MUTED, spaceAfter=8),
        'cell': ParagraphStyle('Cell', fontName='Report', fontSize=8, leading=11, textColor=INK, splitLongWords=1),
        'head': ParagraphStyle('Head', fontName='ReportBold', fontSize=8, leading=11, textColor=INK),
        'right': ParagraphStyle('Right', fontName='Report', fontSize=8, leading=11, textColor=INK, alignment=TA_RIGHT),
    }
    p = lambda value, style='cell': Paragraph(text(value), styles[style])
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=20*mm, rightMargin=20*mm, topMargin=18*mm, bottomMargin=18*mm, title=summary['title'], author='Magnat Password', pageCompression=1)
    story = []
    period = f"{date_label(summary['from'])} - {date_label(summary['to'])}"
    created = datetime.fromisoformat(summary['createdAt'].replace('Z', '+00:00')).astimezone(timezone(timedelta(hours=3))).strftime('%d.%m.%Y %H:%M')

    def table(rows, widths, right_columns=(), small=False):
        result = Table(rows, colWidths=widths, repeatRows=1, hAlign='LEFT')
        result.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), PAPER),
            ('VALIGN', (0,0), (-1,-1), 'TOP'),
            ('LINEBELOW', (0,0), (-1,0), .7, BORDER),
            ('LINEBELOW', (0,1), (-1,-1), .35, BORDER),
            ('LEFTPADDING', (0,0), (-1,-1), 9), ('RIGHTPADDING', (0,0), (-1,-1), 9),
            ('TOPPADDING', (0,0), (-1,-1), 7), ('BOTTOMPADDING', (0,0), (-1,-1), 7),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#fcfdff')]),
        ]))
        return result

    story += [p('ФИНАНСОВЫЙ ОТЧЁТ', 'note'), p(summary['title'], 'title'), p('Оплаченные услуги за период ' + period, 'h')]
    story += [p(f"Сформирован: {created} (МСК) · Отчёт № {summary['id'][:8]}", 'note')]
    story += [p('Хранилища: ' + ', '.join(summary['vaultNames']), 'body')]
    if summary['search']:
        story += [p('Поиск: ' + summary['search'], 'body')]
    story += [p('Валюта: ' + ('Все валюты' if summary['currency'] == 'all' else summary['currency']), 'body'), Spacer(1,8)]
    story += [p(f"Оплат: {summary['paymentCount']}   /   Услуг: {summary['serviceCount']}", 'h')]
    totals = [[p('Валюта', 'head'), p('Оплат', 'head'), p('Фактически оплачено', 'head')]]
    for item in summary['totals']:
        currency = item['currency']
        cents = sum(payment['amountCents'] for payment in payments if payment['currency'] == currency)
        totals.append([p(currency), p(sum(payment['currency'] == currency for payment in payments)), p(money(cents, currency), 'right')])
    if len(totals) == 1:
        totals.append([p('Нет оплат'), p('0'), p('0,00', 'right')])
    story += [table(totals, [WIDTH*.25, WIDTH*.2, WIDTH*.55]), Spacer(1,16)]
    story += [p('В отчёт включены фактические записи об оплате по дате списания, включая оплаты, внесённые вручную. Плановые продления не включены. Даты указаны по московскому времени, валюты не конвертируются. Одна общая подписка учитывается один раз.', 'note')]
    story += [p('Документ фиксирует данные на момент формирования. Последующие изменения истории оплат не меняют этот PDF. Отчёт предназначен для учёта расходов и не заменяет чеки и закрывающие документы.', 'note')]

    keys = list(month_keys(summary['from'], summary['to']))
    for item in summary['totals']:
        currency = item['currency']
        currency_payments = [payment for payment in payments if payment['currency'] == currency]
        services = {}
        for payment in currency_payments:
            service = services.setdefault(payment['serviceKey'], {'key':payment['serviceKey'], 'name':payment['service'] + ' · ' + payment['label'], 'cents':0, 'count':0})
            service['cents'] += payment['amountCents']
            service['count'] += 1
        services = sorted(services.values(), key=lambda service: (-service['cents'], service['name']))
        total = sum(service['cents'] for service in services)
        for start in range(0, len(keys), 12):
            chart_keys = keys[start:start+12]
            story += [PageBreak(), p('Оплаты по месяцам · ' + currency, 'h'), p('Период: ' + period + '. Суммы над столбцами - итог месяца.', 'note'), MonthlyChart(chart_keys, currency_payments, currency)]
            story += [p('Цветные части столбца пропорциональны расходам на услуги. Полная расшифровка цветов, сумм и долей приведена в таблице услуг ниже.', 'note')]
            legend = []
            for service in services[:12]:
                hex_color = service_color(service['key']).hexval().replace('0x', '#')
                label = service['name'][:110]
                legend.append(Paragraph(f'<font color="{hex_color}">■</font> ' + text(label), styles['note']))
            if legend:
                legend_rows = [legend[index:index+2] + ['']*(2-len(legend[index:index+2])) for index in range(0,len(legend),2)]
                legend_table = Table(legend_rows, colWidths=[WIDTH/2]*2)
                legend_table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),2),('BOTTOMPADDING',(0,0),(-1,-1),2)]))
                story.append(legend_table)
            if len(services)>12:
                story += [p('Остальные услуги также входят в столбцы; см. полную таблицу услуг.', 'note')]
        story += [PageBreak(), p('Распределение расходов по услугам · ' + currency, 'h'), p('Сумма за выбранный период: ' + money(total, currency), 'body')]
        chart_services = services[:10]
        if len(services)>10:
            chart_services = chart_services + [{'key':'other', 'name':f'Другие услуги ({len(services)-10})', 'cents':sum(service['cents'] for service in services[10:])}]
        story += [DistributionChart(chart_services, total, currency), Spacer(1,10), p('Доля услуги рассчитывается от расходов в этой валюте. Все услуги, включая сгруппированные на графике, перечислены в следующей таблице.', 'note')]
        story += [PageBreak(), p('Расшифровка услуг · ' + currency, 'h')]
        rows = [[p('Услуга / подписка', 'head'),p('Оплат','head'),p('Сумма','head'),p('Доля','head')]]
        for service in services:
            hex_color=service_color(service['key']).hexval().replace('0x','#')
            label=Paragraph(f'<font color="{hex_color}">■</font> '+text(service['name']), styles['cell'])
            rows.append([label,p(service['count']),p(money(service['cents'],currency),'right'),p(percent(service['cents'],total),'right')])
        rows.append([p('ИТОГО','head'),p(len(currency_payments)),p(money(total,currency),'right'),p('100%' if total else '0%','right')])
        story += [table(rows,[WIDTH*.57,WIDTH*.1,WIDTH*.23,WIDTH*.1])]

    story += [PageBreak(),p('Реестр оплаченных услуг','h'),p('Период: '+period+'. Сортировка по дате фактической оплаты.','note')]
    if not payments:
        story += [p('За выбранный период с указанными фильтрами нет записей об оплате.','body')]
    else:
        rows = [[p(value,'head') for value in ['Дата оплаты','Услуга / подписка','Хранилища','Сумма','Оплаченный период']]]
        for payment in payments:
            vaults=', '.join(payment['vaultNames'][:4])
            if len(payment['vaultNames'])>4:
                vaults+=f"; ещё {len(payment['vaultNames'])-4}"
            rows.append([p(date_label(payment['paidOn'])),p(payment['service']+' · '+payment['label']),p(vaults),p(money(payment['amountCents'],payment['currency']),'right'),p(date_label(payment['periodFrom'])+' - '+date_label(payment['periodUntil']))])
        story += [table(rows,[WIDTH*.12,WIDTH*.32,WIDTH*.22,WIDTH*.15,WIDTH*.19])]
        story += [Spacer(1,14),p('Итоги реестра по валютам','h')]
        for item in summary['totals']:
            story += [p(money(sum(payment['amountCents'] for payment in payments if payment['currency']==item['currency']),item['currency']),'body')]

    def decorate(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(.5)
        canvas.line(20*mm, PAGE_H-12*mm, PAGE_W-20*mm, PAGE_H-12*mm)
        canvas.setFont('Report',7)
        canvas.setFillColor(MUTED)
        canvas.drawString(20*mm,PAGE_H-10*mm,'MAGNAT PASSWORD / Отчёт об оплаченных услугах')
        canvas.drawString(20*mm,10*mm,period+' · Сформирован '+created+' МСК')
        canvas.drawRightString(PAGE_W-20*mm,10*mm,'Страница '+str(document.page))
        canvas.restoreState()
    doc.build(story,onFirstPage=decorate,onLaterPages=decorate)
    return buffer.getvalue()


if __name__ == '__main__':
    sys.stdout.buffer.write(render(json.load(sys.stdin)))
