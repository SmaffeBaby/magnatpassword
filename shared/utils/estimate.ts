import { z } from 'zod'
import type { EstimateItem, EstimateView } from '../types/estimate'
import { validRasterImage } from './media'

export const estimateCurrencies = ['RUB'] as const
const currency = z.enum(estimateCurrencies)
const date = z.union([z.literal(''), z.iso.date()])
const link = z.string().max(2000).refine(value => !value || /^https?:\/\//i.test(value) && URL.canParse(value), 'Укажите ссылку с https:// или http://')
const field = z.object({
  id: z.uuid(), label: z.string().trim().min(1).max(80), type: z.enum(['text','link','money','date','number']),
  value: z.string().max(2000), currency
}).strict().superRefine((value, context) => {
  if (!value.value) return
  if (value.type === 'date' && !date.safeParse(value.value).success || value.type === 'link' && !link.safeParse(value.value).success ||
    ['number','money'].includes(value.type) && (!Number.isFinite(Number(value.value)) || Math.abs(Number(value.value)) > 1e12)) {
    context.addIssue({ code: 'custom', message: `Проверьте поле «${value.label}»` })
  }
})
export const estimateItemSchema = z.object({
  id: z.uuid(), kind: z.enum(['product','service']), name: z.string().trim().min(1).max(160),
  image: z.string().max(350000).refine(value => !value || validRasterImage(value), 'Некорректное изображение'), link,
  quantity: z.number().finite().positive().max(1e6), price: z.number().finite().min(0).max(1e9).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.0001, 'Укажите стоимость с точностью до копеек'), currency, deadline: date,
  fields: z.array(field).max(20).refine(values => new Set(values.map(customColumnKey)).size === values.length, 'Названия дополнительных полей одного типа должны различаться')
}).strict().refine(item => item.quantity * item.price <= 1e12, 'Сумма позиции не должна превышать 1 трлн')
export const estimateItemsSchema = z.array(estimateItemSchema).max(200)
  .refine(items => new Set(items.map(item => item.id)).size === items.length, 'Повторяющиеся строки')
  .refine(items => items.reduce((sum, item) => sum + lineTotal(item), 0) <= 1e13, 'Общая сумма сметы слишком велика')
export const estimateWriteSchema = z.object({ revision: z.number().int().min(0), items: estimateItemsSchema }).strict()
export const estimateViewSchema = z.object({ hiddenRows: z.array(z.uuid()).max(200), hiddenColumns: z.array(z.string().max(200)).max(4000) }).strict()
export const estimateExportSchema = z.object({ format: z.enum(['xlsx','pdf']), view: estimateViewSchema }).strict()
export function customColumnKey(field: { label: string; type: string }) { return `custom:${field.type}:${field.label.trim().toLocaleLowerCase('ru')}` }
export const estimateBaseColumns = [
  { key: 'name', label: 'Название' }, { key: 'kind', label: 'Тип' }, { key: 'image', label: 'Изображение' },
  { key: 'link', label: 'Ссылка' }, { key: 'quantity', label: 'Количество' }, { key: 'price', label: 'Стоимость за единицу, ₽' },
  { key: 'total', label: 'Сумма, ₽' }, { key: 'deadline', label: 'До какого числа' }
]
export function estimateColumns(items: EstimateItem[]) {
  const columns = [...estimateBaseColumns], keys = new Set<string>()
  for (const item of items) for (const field of item.fields) {
    const key = customColumnKey(field)
    if (!keys.has(key)) { keys.add(key); columns.push({ key, label: field.label }) }
  }
  return columns
}
export function lineTotal(item: EstimateItem) { return Math.round((item.quantity * item.price + Number.EPSILON) * 100) / 100 }
export function estimateTotals(items: EstimateItem[]) {
  return estimateCurrencies.flatMap(currency => {
    const rows = items.filter(item => item.currency === currency)
    return rows.length ? [{ currency, amount: rows.reduce((total, item) => total + Math.round(lineTotal(item) * 100), 0) / 100 }] : []
  })
}
export function estimateCell(item: EstimateItem, key: string): string | number {
  if (key === 'kind') return item.kind === 'product' ? 'Товар' : 'Услуга'
  if (key === 'total') return lineTotal(item)
  if (key.startsWith('custom:')) {
    const field = item.fields.find(field => customColumnKey(field) === key)
    if (!field || !field.value) return ''
    return field.type === 'money' ? `${Number(field.value).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽` : field.type === 'number' ? Number(field.value) : field.value
  }
  return item[key as keyof EstimateItem] as string | number
}
export function estimateSnapshot(items: EstimateItem[], view: EstimateView) {
  const rows = items.filter(item => !view.hiddenRows.includes(item.id))
  return { rows, columns: estimateColumns(items).filter(column => !view.hiddenColumns.includes(column.key)), totals: estimateTotals(rows) }
}
