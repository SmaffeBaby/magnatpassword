import { z } from 'zod'
export const documentMaxSize = 20 * 1024 * 1024
export const documentMetadataSchema = z.object({
  name: z.string().trim().min(1).max(240).refine(name => !/[\x00-\x1f/\\]/.test(name) && name !== '.' && name !== '..'),
  description: z.string().max(4000), tags: z.array(z.string().trim().min(1).max(50)).max(20)
}).strict()
export const documentAccessSchema = z.object({
  revision: z.number().int().positive(), defaultPermission: z.enum(['inherit','hidden','viewer','editor']),
  members: z.array(z.object({ userId: z.uuid(), permission: z.enum(['hidden','viewer','editor']) }).strict()).max(500)
}).strict().refine(value => new Set(value.members.map(m => m.userId)).size === value.members.length)
export const documentEditors = [
  { key: 'wordcraft', label: 'WordCraft', extensions: ['docx','doc','docm','dotx','odt','rtf','txt','md'] },
  { key: 'pdfcraft', label: 'PdfCraft', extensions: ['pdf'] },
  { key: 'gridcraft', label: 'GridCraft', extensions: ['xlsx','xls','xlsm','ods','csv','tsv'] },
  { key: 'deckcraft', label: 'DeckCraft', extensions: ['pptx','ppt','odp','deckcraft'] },
  { key: 'photocraft', label: 'PhotoCraft', extensions: ['png','jpg','jpeg','webp','gif','bmp','tif','tiff','psd','psb','ora'] }
] as const
export type DocumentEditorKey = typeof documentEditors[number]['key']
export function documentExtension(name: string) { return name.split('.').pop()?.toLowerCase() || '' }
export function documentEditor(name: string) { const extension = documentExtension(name); return documentEditors.find(editor => (editor.extensions as readonly string[]).includes(extension)) }
export function documentSize(size: number) { return size < 1024 ? `${size} Б` : size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} КБ` : `${(size / 1024 / 1024).toFixed(1)} МБ` }

export const spaceSpreadsheetPreviewDefaults = { rows: 5, columns: 2 }
export const spaceSpreadsheetPreviewLimits = { rows: 50, columns: 20 }
export const spaceSpreadsheetPreviewSchema = z.object({
  sheet: z.string().min(1).max(255).optional(),
  rows: z.number().int().min(1).max(spaceSpreadsheetPreviewLimits.rows),
  columns: z.number().int().min(1).max(spaceSpreadsheetPreviewLimits.columns)
}).strict()
