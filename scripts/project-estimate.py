"""Render estimate OR counterparties, using the supplied workbook's fields and styles."""
import copy
import io
import json
import math
import os
import sys
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime
from html import escape
from pathlib import Path

data = json.load(sys.stdin)
root = Path(__file__).parent / 'templates'
layouts = json.loads((root / 'estimate-layout.json').read_text())
ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
relns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
ET.register_namespace('', ns)
ET.register_namespace('r', relns)


def tag(name):
    return '{'+ns+'}'+name


def clean(value):
    return ''.join(c for c in str(value) if ord(c) >= 32 or c in '\t\n\r')


def col(index):
    result = ''
    while index:
        index, part = divmod(index - 1, 26)
        result = chr(65 + part) + result
    return result


def local_date(value):
    return '.'.join(value.split('-')[::-1]) if value else ''


def build_sheet():
    details = data['details']
    party_names = {p['id']: p['company'] for p in data['counterparties']}
    entries = []
    merges = []
    is_parties = data.get('target') == 'counterparties'
    layout = layouts['counterparties' if is_parties else 'estimate']
    width = len(layout['headers'])
    def row(number, values, styles=None, height=23, formulas=None):
        entries.append({'number': number, 'values': values, 'styles': styles or [0]*len(values), 'height': height, 'formulas': formulas or {}})
    if is_parties:
        title = 'КОНТРАГЕНТЫ · ТЕСТОВЫЕ РЕКВИЗИТЫ' if details['notice'] else 'КОНТРАГЕНТЫ'
        row(1, [title]+['']*5, [52]*6, 36)
        merges.append('A1:F1')
        row(3, layout['headers'], [54]*6, 28)
        for index, party in enumerate(data['counterparties']):
            values = [party[key] for key in ['company','inn','kpp','director','address','bankAccount']]
            height = max(25, 15 * max(math.ceil(len(str(value)) / max(8, layout['widths'][i]-2)) for i, value in enumerate(values)) + 9)
            row(index+4, values, [0,61,61,0,0,61], height=height)
        if details['counterpartyNote']:
            number = len(data['counterparties'])+5
            row(number, [details['counterpartyNote']]+['']*5, [35]*6, 35)
            merges.append(f'A{number}:F{number}')
        return {'name':'Контрагенты','entries':entries,'merges':merges,'layout':layout,'header':3,'title':title}
    title = 'СМЕТА ПРОЕКТА'
    name = details['title'] or data['projectName']
    if name:
        title += '  ·  '+name
    if details['code']:
        title += ' / '+details['code']
    row(1, [title]+['']*8, [4]*9, 36)
    row(2, [details['notice']]+['']*8, [9]*9, 26)
    merges.extend(['A1:I1','A2:I2','C4:E4'])
    for number, label, value in [(4,'Проект',details['description']), (5,'Тираж, компл.',details['batchQuantity']), (6,'Цена набора для клиента, ₽',details['clientUnitPrice']), (7,'Финишная дата',local_date(details['finishDate']))]:
        row(number, ['',label,value], [12,58,14], 25 if number==4 else 20)
    row(9, layout['headers'], [19]*9, 36)
    items = data['items']
    for index, (item, amounts) in enumerate(zip(items, data['amounts'])):
        n = index+10
        rate = item['vatRate']
        vat_formula = f'ROUND(G{n}*{rate}/{100+rate},2)' if rate else '0'
        group = [i for i, candidate in enumerate(items) if item['vatGroup'] and candidate['counterpartyId'] == item['counterpartyId'] and candidate['vatGroup'] == item['vatGroup'] and candidate['vatRate'] == rate]
        if len(group)>1 and index == group[-1]:
            totals = ','.join('G'+str(i+10) for i in group)
            taxes = ','.join('H'+str(i+10) for i in group[:-1])
            vat_formula = f'ROUND(SUM({totals})*{rate}/{100+rate},2)-SUM({taxes})'
        values = [index+1,item['name'],'Внутренние затраты' if item['internalCost'] else party_names.get(item['counterpartyId'],''),item['unit'],item['quantity'],item['price'],amounts['total'],amounts['vat'],amounts['net']]
        height = max(23, max(math.ceil(len(str(values[i])) / max(8, layout['widths'][i]-2)) for i in [1,2,3])*15+8)
        quantity_style = 47 if item['quantity'] == int(item['quantity']) else 60
        row(n, values, [46,46,46,46,quantity_style,48,48,48,48], height, {6:f'ROUND(E{n}*F{n},2)',7:vat_formula,8:f'G{n}-H{n}'})
    end = max(10, len(items)+9)
    total, revenue = end+2, end+5
    f = data['financials']
    row(total, ['', 'ИТОГО ЗАТРАТЫ','','','','',f['cost'],f['inputVat'],f['netCost']], [25]*6+[39]*3, 25, {i:f'SUM({col(i+1)}10:{col(i+1)}{end})' for i in [6,7,8]})
    rate = details['revenueVatRate']
    row(revenue, ['', 'ВЫРУЧКА ПО ДОГОВОРУ','','','','',f['revenue'],f['outputVat'],f['netRevenue']], [29]*6+[40]*3, 27, {6:'ROUND(C5*C6,2)',7:f'ROUND(G{revenue}*{rate}/{100+rate},2)',8:f'G{revenue}-H{revenue}'})
    row(revenue+2, ['', 'Разница выручка − расходы (с НДС)','','','','',f['difference']], [0]*6+[38], 23, {6:f'G{revenue}-G{total}'})
    row(revenue+3, ['', 'Результат без НДС, после прямых затрат','','','','','','',f['profit']], [0]*8+[38], 23, {8:f'I{revenue}-I{total}'})
    row(revenue+4, ['', 'Рентабельность по выручке без НДС','','','','','','',f['profitability']], [0]*8+[32], 23, {8:f'IF(I{revenue}=0,"",I{revenue+3}/I{revenue})'})
    for index, note in enumerate(details['notes']):
        n = revenue+6+index
        row(n, ['',note]+['']*7, [0]+[35]*8, max(35,math.ceil(len(note)/150)*14+8))
        merges.append(f'B{n}:I{n}')
    return {'name':'Смета','entries':entries,'merges':merges,'layout':layout,'header':9,'title':title}


def xlsx(sheet):
    worksheet = ET.Element(tag('worksheet'))
    sheet_properties = ET.SubElement(worksheet,tag('sheetPr'))
    ET.SubElement(sheet_properties,tag('pageSetUpPr'),fitToPage='1')
    views = ET.SubElement(worksheet, tag('sheetViews'))
    view = ET.SubElement(views, tag('sheetView'), workbookViewId='0', showGridLines='0')
    ET.SubElement(view, tag('pane'), ySplit=str(sheet['header']), topLeftCell=f'A{sheet["header"]+1}', activePane='bottomLeft', state='frozen')
    ET.SubElement(worksheet, tag('sheetFormatPr'), defaultRowHeight='15')
    columns = ET.SubElement(worksheet, tag('cols'))
    for i, width in enumerate(sheet['layout']['widths']):
        ET.SubElement(columns,tag('col'),min=str(i+1),max=str(i+1),width=str(width),customWidth='1')
    body = ET.SubElement(worksheet, tag('sheetData'))
    for entry in sheet['entries']:
        n = entry['number']
        row = ET.SubElement(body, tag('row'), r=str(n), ht=str(entry['height']), customHeight='1')
        for i, (value, style) in enumerate(zip(entry['values'], entry['styles'])):
            cell = ET.SubElement(row, tag('c'), r=f'{col(i+1)}{n}', s=str(style))
            if i in entry['formulas']:
                ET.SubElement(cell,tag('f')).text = entry['formulas'][i]
                if value is not None:
                    ET.SubElement(cell,tag('v')).text = str(value)
                else:
                    cell.set('t','str')
                    ET.SubElement(cell,tag('v')).text = ''
            elif isinstance(value,(int,float)):
                cell.set('t','n'); ET.SubElement(cell,tag('v')).text = str(value)
            elif value is not None and str(value):
                cell.set('t','inlineStr')
                text = ET.SubElement(ET.SubElement(cell,tag('is')),tag('t'),{'{http://www.w3.org/XML/1998/namespace}space':'preserve'})
                text.text = clean(value)
    merges = ET.SubElement(worksheet,tag('mergeCells'), count=str(len(sheet['merges'])))
    for ref in sheet['merges']:
        ET.SubElement(merges,tag('mergeCell'),ref=ref)
    ET.SubElement(worksheet,tag('pageMargins'),left='0.25',right='0.25',top='0.4',bottom='0.4',header='0.2',footer='0.2')
    ET.SubElement(worksheet,tag('pageSetup'),orientation='landscape',paperSize='9',fitToWidth='1',fitToHeight='0')
    styles = ET.parse(root / 'estimate-styles.xml').getroot()
    formats = styles.find(tag('numFmts'))
    ET.SubElement(formats,tag('numFmt'),numFmtId='203',formatCode='0.######'); formats.set('count',str(len(formats)))
    xfs = styles.find(tag('cellXfs')); quantity = copy.deepcopy(xfs[47]);quantity.set('numFmtId','203');xfs.append(quantity);xfs.set('count',str(len(xfs)))
    text_style = copy.deepcopy(xfs[0]); text_style.set('numFmtId','49');text_style.set('applyNumberFormat','1');xfs.append(text_style);xfs.set('count',str(len(xfs)))
    out = io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>')
        archive.writestr('_rels/.rels',f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{relns}/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr('xl/workbook.xml',f'<workbook xmlns="{ns}" xmlns:r="{relns}"><sheets><sheet name="{sheet["name"]}" sheetId="1" r:id="rId1"/></sheets><calcPr fullCalcOnLoad="1"/></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels',f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{relns}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{relns}/styles" Target="styles.xml"/></Relationships>')
        archive.writestr('xl/styles.xml',ET.tostring(styles,encoding='utf-8',xml_declaration=True))
        archive.writestr('xl/worksheets/sheet1.xml',ET.tostring(worksheet,encoding='utf-8',xml_declaration=True))
    return out.getvalue()


def pdf(sheet):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether
    roots = [Path('/usr/share/fonts'),Path(os.path.expanduser('~/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/fonts'))]
    font = next((path for base in roots if base.exists() for path in base.rglob('DejaVuSans.ttf')),None)
    if not font:
        raise RuntimeError('DejaVu Sans is required')
    bold = font.with_name('DejaVuSans-Bold.ttf')
    pdfmetrics.registerFont(TTFont('Estimate',str(font)))
    pdfmetrics.registerFont(TTFont('EstimateBold',str(bold if bold.exists() else font)))
    normal = ParagraphStyle('body',fontName='Estimate',fontSize=8,leading=11,textColor=colors.HexColor('#16344c'),wordWrap='CJK')
    heading = ParagraphStyle('title',parent=normal,fontName='EstimateBold',fontSize=15,leading=21,textColor=colors.white)
    strong = ParagraphStyle('strong',parent=normal,fontName='EstimateBold')
    column_header = ParagraphStyle('column-header',parent=strong,fontSize=7.5,leading=10)
    note = ParagraphStyle('note',parent=normal,fontSize=8,leading=12,textColor=colors.HexColor('#945a29'))
    def para(value,style=normal):
        return Paragraph(escape(clean(value)).replace('\n','<br/>'),style)
    out = io.BytesIO()
    doc = SimpleDocTemplate(out,pagesize=landscape(A4),leftMargin=24,rightMargin=24,topMargin=26,bottomMargin=30,title=sheet['title'],author='Проекты')
    content = []
    title = Table([[para(sheet['title'],heading)]],colWidths=[doc.width])
    title.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#16344c')),('LEFTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]))
    content.extend([title,Spacer(1,12)])
    is_parties = data.get('target') == 'counterparties'
    if not is_parties:
        details = data['details']
        if details['notice']:
            content.extend([para(details['notice'],note),Spacer(1,8)])
        for label,value in [('Проект',details['description']),('Тираж, компл.',details['batchQuantity']),('Цена набора для клиента, ₽',f'{details["clientUnitPrice"]:,.2f}'.replace(',',' ').replace('.',',')),('Финишная дата',local_date(details['finishDate']))]:
            meta = Table([[para(label,strong),para(value)]],colWidths=[160,doc.width-160]);meta.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('BOTTOMPADDING',(0,0),(-1,-1),3)]));content.append(meta)
        content.append(Spacer(1,8))
    rows = [[para(header,column_header) for header in sheet['layout']['headers']]]
    for entry in sheet['entries']:
        if entry['number'] <= sheet['header']:
            continue
        if not is_parties and (len(entry['values'])<9 or entry['values'][0]==''):
            continue
        if is_parties and len(entry['values']) and not entry['number'] < len(data['counterparties'])+4:
            continue
        values = []
        for i,value in enumerate(entry['values']):
            if isinstance(value,(int,float)):
                value = (f'{value:,.2f}' if not is_parties and i>=5 else f'{value:,g}').replace(',',' ').replace('.',',')
            values.append(para(value))
        rows.append(values)
    total_width = sum(sheet['layout']['widths'])
    widths = [doc.width*w/total_width for w in sheet['layout']['widths']]
    table = Table(rows,colWidths=widths,repeatRows=1,hAlign='LEFT',splitByRow=1,splitInRow=1)
    padding = 8 if is_parties else 5
    table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#dde9f1')),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),.35,colors.HexColor('#d5dfe7')),('TOPPADDING',(0,0),(-1,-1),padding),('BOTTOMPADDING',(0,0),(-1,-1),padding),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5)]))
    content.append(table)
    if not is_parties:
        f = data['financials']
        money = lambda value: f'{value:,.2f}'.replace(',',' ').replace('.',',')+' ₽'
        summary_rows = [
            ['ИТОГО ЗАТРАТЫ',money(f['cost']),money(f['inputVat']),money(f['netCost'])],
            ['ВЫРУЧКА ПО ДОГОВОРУ',money(f['revenue']),money(f['outputVat']),money(f['netRevenue'])],
            ['Разница выручка − расходы (с НДС)',money(f['difference']),'',''],
            ['Результат без НДС, после прямых затрат','','',money(f['profit'])],
            ['Рентабельность по выручке без НДС','','','—' if f['profitability'] is None else f'{f["profitability"]*100:.1f}%'.replace('.',',')]]
        summary = Table([[para(value,strong if i<2 else normal) for value in row] for i,row in enumerate(summary_rows)],colWidths=[sum(widths[:6]),*widths[6:]],splitByRow=1)
        summary.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e1e9ef')),('BACKGROUND',(0,1),(-1,1),colors.HexColor('#e8f4e8')),('VALIGN',(0,0),(-1,-1),'TOP'),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
        content.extend([Spacer(1,12),KeepTogether([summary])])
        for text in data['details']['notes']:
            content.extend([Spacer(1,10),para(text,note)])
    elif data['details']['counterpartyNote']:
        content.extend([Spacer(1,16),para(data['details']['counterpartyNote'],note)])
    def footer(canvas,document):
        canvas.setFont('Estimate',8);canvas.setFillColor(colors.HexColor('#64727e'));canvas.drawRightString(doc.pagesize[0]-24,14,f'Страница {document.page}')
    doc.build(content,onFirstPage=footer,onLaterPages=footer)
    return out.getvalue()


sheet = build_sheet()
sys.stdout.buffer.write(pdf(sheet) if sys.argv[1] == 'pdf' else xlsx(sheet))
