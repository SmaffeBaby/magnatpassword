"""Project estimate exports. Input/output stay on pipes; no temporary user files."""
import base64
import io
import json
import os
import sys
import zipfile
from datetime import datetime
from html import escape
from xml.sax.saxutils import escape as xml_escape

data = json.load(sys.stdin)
columns, rows, cells = data['columns'], data['rows'], data['cells']


def image_bytes(value):
    if not value:
        return None
    raw = base64.b64decode(value.split(',', 1)[1], validate=True)
    from reportlab.lib.utils import ImageReader
    width, height = ImageReader(io.BytesIO(raw)).getSize()
    if width * height > 16000000:
        raise ValueError('Image dimensions exceed limit')
    return raw, width, height, 'png' if value.startswith('data:image/png;') else 'jpeg'


def xlsx():
    # Native OOXML supports portable inline strings, formulas and embedded images without a new runtime dependency.
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    relns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    def col(index):
        result = ''
        while index:
            index, part = divmod(index - 1, 26)
            result = chr(65 + part) + result
        return result
    def string(ref, value, style=0):
        # XML 1.0 control characters cannot be represented in a workbook.
        value = ''.join(c for c in str(value) if ord(c) >= 32 or c in '\t\n\r')
        return f'<c r="{ref}" t="inlineStr" s="{style}"><is><t xml:space="preserve">{xml_escape(value)}</t></is></c>'
    def numeric(ref, value, formula=None, style=3):
        return f'<c r="{ref}" s="{style}">' + (f'<f>{xml_escape(formula)}</f>' if formula else '') + f'<v>{value}</v></c>'
    sheet_rows = [f'<row r="1" ht="28" customHeight="1">{string("A1", "Смета · " + data["title"], 1)}</row>',
                  f'<row r="2">{string("A2", "Сформировано: " + data["createdAt"][:10])}</row>',
                  '<row r="4" ht="32" customHeight="1">' + ''.join(string(f'{col(i+1)}4', c['label'], 2) for i, c in enumerate(columns)) + '</row>']
    keys = [c['key'] for c in columns]
    links, drawings, media = [], [], []
    for index, (item, values) in enumerate(zip(rows, cells)):
        rownum = index + 5
        output = []
        has_image = 'image' in keys and bool(item['image'])
        for j, (column, value) in enumerate(zip(columns, values)):
            key, ref = column['key'], f'{col(j+1)}{rownum}'
            if key == 'image':
                output.append(string(ref, ''))
                image = image_bytes(item['image'])
                if image:
                    raw, w, h, ext = image
                    media.append((f'image{len(media)+1}.{ext}', raw))
                    factor = min(76/w, 68/h)
                    n = len(media)
                    drawings.append(f'''<xdr:oneCellAnchor><xdr:from><xdr:col>{j}</xdr:col><xdr:colOff>38100</xdr:colOff><xdr:row>{rownum-1}</xdr:row><xdr:rowOff>38100</xdr:rowOff></xdr:from><xdr:ext cx="{int(w*factor*9525)}" cy="{int(h*factor*9525)}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="{n}" name="Изображение {n}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId{n}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>''')
            elif value and (key == 'deadline' or key.startswith('custom:date:')):
                serial = (datetime.strptime(value, '%Y-%m-%d') - datetime(1899, 12, 30)).days
                output.append(numeric(ref, serial, style=5))
            elif key.startswith('custom:money:') and value:
                field = next(f for f in item['fields'] if f['type'] == 'money' and 'custom:money:'+f['label'].strip().lower() == key)
                output.append(numeric(ref, float(field['value']), style=6+['RUB'].index(field['currency'])))
            elif isinstance(value, (int, float)):
                formula = None
                if key == 'total' and 'quantity' in keys and 'price' in keys:
                    formula = f'ROUND({col(keys.index("quantity")+1)}{rownum}*{col(keys.index("price")+1)}{rownum},2)'
                output.append(numeric(ref, value, formula, style=7 if key == 'quantity' or key.startswith('custom:number:') else 3))
            else:
                output.append(string(ref, value, 4 if key == 'link' and value else 0))
                if (key == 'link' or key.startswith('custom:link:')) and value:
                    links.append((ref, value))
        sheet_rows.append(f'<row r="{rownum}" ht="{58 if has_image else 40}" customHeight="1">' + ''.join(output) + '</row>')
    for index, total in enumerate(data['totals']):
        rownum = len(rows) + 7 + index
        output = string(f'A{rownum}', 'Итого, ₽', 2)
        formula = None
        if 'currency' in keys and 'total' in keys:
            c, t = col(keys.index('currency')+1), col(keys.index('total')+1)
            formula = f'SUMIF({c}5:{c}{len(rows)+4},"{total["currency"]}",{t}5:{t}{len(rows)+4})'
        elif 'total' in keys:
            t = col(keys.index('total')+1)
            formula = f'SUM({t}5:{t}{len(rows)+4})'
        output += numeric(f'B{rownum}', total['amount'], formula)
        sheet_rows.append(f'<row r="{rownum}" ht="25" customHeight="1">{output}</row>')
    relationships = []
    hyperlinks = []
    for i, (ref, url) in enumerate(links):
        rid = f'link{i+1}'
        relationships.append(f'<Relationship Id="{rid}" Type="{relns}/hyperlink" Target="{xml_escape(url, {chr(34): "&quot;"})}" TargetMode="External"/>')
        hyperlinks.append(f'<hyperlink ref="{ref}" r:id="{rid}"/>')
    if drawings:
        relationships.append(f'<Relationship Id="drawing" Type="{relns}/drawing" Target="../drawings/drawing1.xml"/>')
    widths = ''.join(f'<col min="{i+1}" max="{i+1}" width="{34 if c["key"] == "name" else 13 if c["key"] == "image" else 24}" customWidth="1"/>' for i, c in enumerate(columns))
    worksheet = f'''<worksheet xmlns="{ns}" xmlns:r="{relns}"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>{widths}</cols><sheetData>{''.join(sheet_rows)}</sheetData><autoFilter ref="A4:{col(len(columns))}{len(rows)+4}"/>{'<hyperlinks>'+''.join(hyperlinks)+'</hyperlinks>' if hyperlinks else ''}<pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" paperSize="9"/>{'<drawing r:id="drawing"/>' if drawings else ''}</worksheet>'''
    types = '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/>'
    for part, kind in [('workbook', 'sheet.main'), ('worksheets/sheet1', 'worksheet'), ('styles', 'styles')]:
        types += f'<Override PartName="/xl/{part}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.{kind}+xml"/>'
    if drawings:
        types += '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>'
    styles = f'''<styleSheet xmlns="{ns}"><numFmts count="3"><numFmt numFmtId="166" formatCode="0.######"/><numFmt numFmtId="164" formatCode="dd\\.mm\\.yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00 &quot;RUB&quot;"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/><color rgb="FF334155"/></font><font><b/><sz val="18"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><sz val="11"/><color rgb="FF2563EB"/><u/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF334155"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf fontId="0" fillId="0" borderId="0" numFmtId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf fontId="1" fillId="0" borderId="0" numFmtId="0" xfId="0"/><xf fontId="2" fillId="2" borderId="0" numFmtId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf fontId="0" fillId="0" borderId="0" numFmtId="4" xfId="0" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf><xf fontId="3" fillId="0" borderId="0" numFmtId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf fontId="0" fillId="0" borderId="0" numFmtId="164" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf><xf fontId="0" fillId="0" borderId="0" numFmtId="165" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf><xf fontId="0" fillId="0" borderId="0" numFmtId="166" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="center" horizontal="right"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'''
    result = io.BytesIO()
    with zipfile.ZipFile(result, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', f'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">{types}</Types>')
        archive.writestr('_rels/.rels', f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{relns}/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr('xl/workbook.xml', f'<workbook xmlns="{ns}" xmlns:r="{relns}"><sheets><sheet name="Смета" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{relns}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="{relns}/styles" Target="styles.xml"/></Relationships>')
        archive.writestr('xl/styles.xml', styles)
        archive.writestr('xl/worksheets/sheet1.xml', worksheet)
        if relationships:
            archive.writestr('xl/worksheets/_rels/sheet1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(relationships)+'</Relationships>')
        if drawings:
            archive.writestr('xl/drawings/drawing1.xml', f'<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="{relns}">'+''.join(drawings)+'</xdr:wsDr>')
            archive.writestr('xl/drawings/_rels/drawing1.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+''.join(f'<Relationship Id="rId{i+1}" Type="{relns}/image" Target="../media/{name}"/>' for i, (name, _) in enumerate(media))+'</Relationships>')
            for name, raw in media:
                archive.writestr('xl/media/'+name, raw)
    return result.getvalue()


def pdf():
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
    candidates = ['/usr/share/fonts/dejavu', '/usr/share/fonts/ttf-dejavu', '/usr/share/fonts/truetype/dejavu', '/Library/Fonts', os.path.expanduser('~/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/poppler/poppler/fonts')]
    font = next((os.path.join(root, 'DejaVuSans.ttf') for root in candidates if os.path.isfile(os.path.join(root, 'DejaVuSans.ttf'))), None)
    if not font:
        # Host test runtime may use the existing finance report font override.
        font = os.environ.get('ESTIMATE_PDF_FONT')
    pdfmetrics.registerFont(TTFont('Estimate', font))
    normal = ParagraphStyle('body', fontName='Estimate', fontSize=8, leading=12, textColor=colors.HexColor('#334155'), wordWrap='CJK')
    heading = ParagraphStyle('heading', parent=normal, fontSize=18, leading=25, spaceAfter=14)
    header = ParagraphStyle('header', parent=normal, textColor=colors.white)
    def paragraph(value, style=normal):
        return Paragraph(escape(str(value)).replace('\n', '<br/>'), style)
    result = io.BytesIO()
    doc = SimpleDocTemplate(result, pagesize=landscape(A4), rightMargin=30, leftMargin=30, topMargin=32, bottomMargin=32, title='Смета · '+data['title'], author='Проекты')
    content = []
    # Keep readable type at any width: continue wide estimates in numbered column groups.
    indices = list(range(len(columns)))
    name_index = next((i for i, c in enumerate(columns) if c['key'] == 'name'), None)
    others = [i for i in indices if i != name_index]
    groups = [[name_index] + others[i:i+5] if name_index is not None else others[i:i+6] for i in range(0, max(len(others), 1), 5 if name_index is not None else 6)]
    for group_index, group in enumerate(groups):
        if group_index:
            content.append(PageBreak())
        content.extend([paragraph('Смета · '+data['title'], heading), paragraph('Сформировано: '+data['createdAt'][:10] + (f' · Часть {group_index+1} из {len(groups)}' if len(groups)>1 else '')), Spacer(1, 15)])
        widths = [doc.width * (1.8 if columns[i]['key']=='name' else 1) / sum(1.8 if columns[k]['key']=='name' else 1 for k in group) for i in group]
        table_rows = [[paragraph(columns[i]['label'], header) for i in group]]
        for item, values in zip(rows, cells):
            output = []
            for i, width in zip(group, widths):
                value = values[i]
                if columns[i]['key'] == 'image':
                    image = image_bytes(item['image'])
                    if image:
                        raw, w, h, _ = image
                        factor = min((width-16)/w, 55/h)
                        output.append(Image(io.BytesIO(raw), width=w*factor, height=h*factor))
                    else:
                        output.append(paragraph(''))
                else:
                    if isinstance(value, (int, float)):
                        value = (f'{value:,.2f}' if columns[i]['key'] in ['price', 'total'] else f'{value:,g}').replace(',', ' ').replace('.', ',')
                    elif value and (columns[i]['key'] == 'deadline' or columns[i]['key'].startswith('custom:date:')):
                        value = datetime.strptime(value, '%Y-%m-%d').strftime('%d.%m.%Y')
                    output.append(paragraph(value))
            table_rows.append(output)
        table = Table(table_rows, colWidths=widths, repeatRows=1, hAlign='LEFT', splitByRow=1, splitInRow=1)
        table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#334155')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f1f5f9')]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),9),('BOTTOMPADDING',(0,0),(-1,-1),9),('LINEBELOW',(0,0),(-1,-1),.3,colors.HexColor('#e2e8f0'))]))
        content.append(table)
    content.extend([Spacer(1,18), paragraph('Итого по выбранным строкам', heading)])
    for total in data['totals']:
        content.append(paragraph(f'{total["amount"]:,.2f} ₽'.replace(',', ' ').replace('.', ',')))
    def footer(canvas, document):
        canvas.setFont('Estimate',8)
        canvas.setFillColor(colors.HexColor('#64748b'))
        canvas.drawRightString(doc.pagesize[0]-30,17,f'Страница {document.page}')
    doc.build(content, onFirstPage=footer, onLaterPages=footer)
    return result.getvalue()


sys.stdout.buffer.write(pdf() if sys.argv[1] == 'pdf' else xlsx())
