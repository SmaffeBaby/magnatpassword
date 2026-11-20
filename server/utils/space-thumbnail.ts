import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as XLSX from 'xlsx'
import type { SpaceFileThumbnail, SpaceSpreadsheetPreview } from '../../shared/types/project-documents'
import { documentEditor, documentExtension, spaceSpreadsheetPreviewDefaults, spaceSpreadsheetPreviewLimits } from '../../shared/utils/project-documents'

const run = promisify(execFile)
let rendering = false

export async function spaceThumbnail(
  bytes: Buffer,
  name: string,
  detail = false,
  spreadsheet: SpaceSpreadsheetPreview = spaceSpreadsheetPreviewDefaults
): Promise<SpaceFileThumbnail> {
  const editor = documentEditor(name)?.key
  if (editor === 'gridcraft') {
    const maxRows = detail ? spaceSpreadsheetPreviewLimits.rows : spreadsheet.rows
    const maxColumns = detail ? Math.max(12, spreadsheet.columns) : spreadsheet.columns
    const options = { type: 'buffer' as const, sheetRows: maxRows, bookVBA: false, cellFormula: false }
    let workbook = XLSX.read(bytes, { ...options, sheets: spreadsheet.sheet ?? 0 })
    const sheets = workbook.SheetNames
    const sheet = spreadsheet.sheet && sheets.includes(spreadsheet.sheet) ? spreadsheet.sheet : sheets[0]
    if (sheet === undefined) return { kind: 'unavailable' }
    if (!Object.hasOwn(workbook.Sheets, sheet) && spreadsheet.sheet) {
      workbook = XLSX.read(bytes, { ...options, sheets: 0 })
    }
    const activeSheet = workbook.Sheets[sheet]
    const range = activeSheet?.['!ref'] ? XLSX.utils.decode_range(activeSheet['!ref']) : undefined
    const rowCount = detail ? Math.max(1, Math.min((range?.e.r ?? 0) - (range?.s.r ?? 0) + 1, maxRows)) : maxRows
    const columnCount = detail ? Math.max(1, Math.min((range?.e.c ?? 0) - (range?.s.c ?? 0) + 1, maxColumns)) : maxColumns
    const rows = Array.from({ length: rowCount }, (_, row) => Array.from({ length: columnCount }, (_, column) => {
      const cell = activeSheet?.[XLSX.utils.encode_cell({
        r: row + (detail ? range?.s.r ?? 0 : 0),
        c: column + (detail ? range?.s.c ?? 0 : 0)
      })]
      return String(cell?.w ?? cell?.v ?? '').slice(0, 200)
    }))
    return { kind: 'cells', rows, sheets, sheet }
  }

  const extension = documentExtension(name)
  if (editor !== 'wordcraft' && editor !== 'pdfcraft' && !['pptx', 'ppt', 'odp'].includes(extension)) {
    return { kind: 'unavailable' }
  }
  if (rendering) throw createError({ statusCode: 503, message: 'Миниатюра готовится, повторите позже' })
  rendering = true
  let dir: string | undefined
  try {
    dir = await mkdtemp(join(tmpdir(), 'space-thumb-'))
    const source = join(dir, `source.${extension}`)
    await writeFile(source, bytes)
    const pdf = join(dir, 'source.pdf')
    if (extension !== 'pdf') {
      await run('libreoffice', ['--headless', `-env:UserInstallation=file://${dir}/profile`, '--convert-to', 'pdf', '--outdir', dir, source], {
        timeout: 40000,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, SAL_USE_VCLPLUGIN: 'svp' }
      })
    }
    await run('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', detail ? '1600' : '650', '-png', pdf, join(dir, 'preview')], {
      timeout: 15000,
      maxBuffer: 1024 * 1024
    })
    return { kind: 'image', src: `data:image/png;base64,${(await readFile(join(dir, 'preview.png'))).toString('base64')}` }
  } finally {
    rendering = false
    if (dir) await rm(dir, { recursive: true, force: true })
  }
}
