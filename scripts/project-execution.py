"""Render a resolved project document; all figures are supplied by server calculations."""
import io
import json
import os
import sys
import zipfile
from xml.sax.saxutils import escape

def clean(value):
    return ''.join(c for c in str(value) if c in '\t\n\r' or ord(c) >= 32)

def xml(value):
    return escape(clean(value))

def widths(count):
    return {2:[7600,2400],3:[6800,1700,1500],5:[4400,1100,1000,1750,1750]}.get(count,[10000/count]*count)

def docx(data):
    def paragraph(text,style=None):
        props=f'<w:pStyle w:val="{style}"/>' if style else ''
        runs='<w:br/>'.join(f'<w:t xml:space="preserve">{xml(line)}</w:t>' for line in text.split('\n'))
        return f'<w:p><w:pPr>{props}</w:pPr><w:r>{runs}</w:r></w:p>'
    def table(block):
        sizes=[round(w*.9638) for w in widths(len(block['headers']))]
        grid=''.join(f'<w:gridCol w:w="{w}"/>' for w in sizes)
        rows=[]
        for index,row in enumerate([block['headers']]+block['rows']):
            cells=[]
            for size,cell in zip(sizes,row):
                fill='<w:shd w:fill="EDEFF2"/>' if index==0 else ''
                cells.append(f'<w:tc><w:tcPr><w:tcW w:w="{size}" w:type="dxa"/>{fill}<w:vAlign w:val="center"/></w:tcPr>{paragraph(cell,"TableHeader" if index==0 else "TableText")}</w:tc>')
            rows.append('<w:tr><w:trPr>'+('<w:tblHeader/>' if index==0 else '')+'</w:trPr>'+''.join(cells)+'</w:tr>')
        borders=''.join(f'<w:{side} w:val="single" w:sz="4" w:color="CCD2D9"/>' for side in ['top','left','bottom','right','insideH','insideV'])
        return f'<w:tbl><w:tblPr><w:tblW w:w="9638" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>{borders}</w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>{grid}</w:tblGrid>'+''.join(rows)+'</w:tbl>'+paragraph('')
    body=paragraph(data['title'],'Title')
    for block in data['blocks']:
        if block['type']=='table': body+=table(block)
        else:
            for text in block['text'].split('\n\n'):
                body+=paragraph(text)
    document=f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0"/></w:sectPr></w:body></w:document>'''
    styles='''<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="DejaVu Sans" w:hAnsi="DejaVu Sans" w:cs="DejaVu Sans"/><w:sz w:val="21"/><w:color w:val="000000"/><w:lang w:val="ru-RU"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="276" w:lineRule="auto"/><w:widowControl/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:after="280"/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/><w:color w:val="000000"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240"/></w:pPr><w:rPr><w:sz w:val="18"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableHeader"><w:name w:val="Table Header"/><w:basedOn w:val="TableText"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="18"/></w:rPr></w:style></w:styles>'''
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml','''<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>''')
        z.writestr('_rels/.rels','''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>''')
        z.writestr('word/document.xml',document)
        z.writestr('word/styles.xml',styles)
        z.writestr('word/_rels/document.xml.rels','''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>''')
    return out.getvalue()

def pdf(data):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle
    import glob
    roots=['/usr/share/fonts','/usr/local/share/fonts',os.path.expanduser('~/.cache/codex-runtimes')]
    def font(name):
        for root in roots:
            matches=glob.glob(root+'/**/'+name,recursive=True)
            if matches:return matches[0]
        raise RuntimeError('DejaVu fonts required')
    pdfmetrics.registerFont(TTFont('Document',font('DejaVuSans.ttf')))
    pdfmetrics.registerFont(TTFont('DocumentBold',font('DejaVuSans-Bold.ttf')))
    normal=ParagraphStyle('Normal',fontName='Document',fontSize=10.5,leading=14,spaceAfter=8,textColor=colors.black,splitLongWords=True)
    title=ParagraphStyle('Title',parent=normal,fontName='DocumentBold',fontSize=16,leading=21,spaceAfter=18,keepWithNext=True)
    cell=ParagraphStyle('Cell',parent=normal,fontSize=9,leading=12,spaceAfter=0)
    head=ParagraphStyle('Head',parent=cell,fontName='DocumentBold')
    def p(text,style=normal):return Paragraph(xml(text).replace('\n','<br/>'),style)
    story=[p(data['title'],title)]
    for block in data['blocks']:
        if block['type']=='text':
            for text in block['text'].split('\n\n'):story.append(p(text))
        else:
            rows=[[p(t,head) for t in block['headers']]]+[[p(t,cell) for t in row] for row in block['rows']]
            table=Table(rows,colWidths=[w/10000*(A4[0]-40*72/25.4) for w in widths(len(block['headers']))],repeatRows=1,hAlign='LEFT')
            table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#EDEFF2')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#CCD2D9')),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('LEFTPADDING',(0,0),(-1,-1),5),('RIGHTPADDING',(0,0),(-1,-1),5),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
            story.extend([table,Spacer(1,10)])
    out=io.BytesIO();margin=20*72/25.4
    def footer(canvas,doc):
        canvas.setFont('Document',8);canvas.drawRightString(A4[0]-margin,margin/2,f'Страница {doc.page}')
    SimpleDocTemplate(out,pagesize=A4,leftMargin=margin,rightMargin=margin,topMargin=margin,bottomMargin=margin,title=data['title'],author='').build(story,onFirstPage=footer,onLaterPages=footer)
    return out.getvalue()

if __name__=='__main__':
    data=json.load(sys.stdin)
    sys.stdout.buffer.write(docx(data) if sys.argv[1]=='docx' else pdf(data))
