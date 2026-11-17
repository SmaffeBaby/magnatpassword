import { crc32, deflateSync } from 'node:zlib'
import * as XLSX from 'xlsx'
export const projectDocumentTemplateExtensions = { wordcraft: 'docx', pdfcraft: 'pdf', gridcraft: 'xlsx', deckcraft: 'pptx', photocraft: 'png' } as const
export async function projectDocumentTemplate(kind: keyof typeof projectDocumentTemplateExtensions): Promise<Buffer> {
  if (kind === 'gridcraft') {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['']]), 'Лист 1')
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })
  }
  if (kind === 'pdfcraft') {
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << >> /Contents 4 0 R >>','<< /Length 0 >>\nstream\n\nendstream']
    let pdf = '%PDF-1.7\n', offsets = [0]
    for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${i+1} 0 obj\n${object}\nendobj\n` }
    const xref = Buffer.byteLength(pdf)
    pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
    return Buffer.from(pdf)
  }
  if (kind === 'photocraft') {
    function chunk(type: string, bytes: Buffer) { const header = Buffer.alloc(4), crc = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), bytes]); header.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(body)); return Buffer.concat([header, body, crc]) }
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1024); ihdr.writeUInt32BE(768, 4); ihdr[8] = 8; ihdr[9] = 6
    const pixels = Buffer.alloc((1024 * 4 + 1) * 768, 255)
    for (let y = 0; y < 768; y++) pixels[y * (1024 * 4 + 1)] = 0
    return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))])
  }
  const rel = 'http://schemas.openxmlformats.org/package/2006/relationships', office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const entries: { path: string; bytes: Buffer }[] = []
  const add = (path: string, xml: string) => entries.push({ path, bytes: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${xml}`) })
  if (kind === 'wordcraft') {
    add('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
    add('_rels/.rels', `<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="word/document.xml"/></Relationships>`)
    add('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>')
  } else {
    const p = 'http://schemas.openxmlformats.org/presentationml/2006/main', a = 'http://schemas.openxmlformats.org/drawingml/2006/main'
    add('[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/></Types>')
    add('_rels/.rels', `<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`)
    add('ppt/presentation.xml', `<p:presentation xmlns:p="${p}" xmlns:a="${a}" xmlns:r="${office}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId2"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`)
    add('ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${office}/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="${office}/slideMaster" Target="slideMasters/slideMaster1.xml"/></Relationships>`)
    const tree = `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>`
    add('ppt/slides/slide1.xml', `<p:sld xmlns:p="${p}" xmlns:a="${a}" xmlns:r="${office}"><p:cSld>${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`)
    add('ppt/slides/_rels/slide1.xml.rels', `<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${office}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`)
    add('ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout xmlns:p="${p}" xmlns:a="${a}" xmlns:r="${office}" type="blank"><p:cSld name="Пустой слайд">${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`)
    add('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${office}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`)
    add('ppt/slideMasters/slideMaster1.xml', `<p:sldMaster xmlns:p="${p}" xmlns:a="${a}" xmlns:r="${office}"><p:cSld>${tree}</p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`)
    add('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<Relationships xmlns="${rel}"><Relationship Id="rId1" Type="${office}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`)
  }
  return writeDocumentArchive(entries)
}
