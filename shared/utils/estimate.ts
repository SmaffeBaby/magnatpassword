import { z } from 'zod'
import type { EstimateContent, EstimateItem, EstimateView, ProjectCounterparty } from '../types/estimate'
import { validRasterImage } from './media'

export const estimateCurrencies = ['RUB'] as const
const currency = z.enum(estimateCurrencies)
const date = z.union([z.literal(''), z.iso.date()])
const link = z.string().max(2000).refine(value => !value || /^https?:\/\//i.test(value) && URL.canParse(value), 'Укажите ссылку с https:// или http://')
const reference = z.union([z.uuid(), z.literal('')]).default('')
const text = (max = 160) => z.string().trim().max(max)
const amount = z.number().finite().min(0).max(1e12)
const vatRate = z.number().finite().min(0).max(100)
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
  unit: text(30).default('шт.'), counterpartyId: reference, internalCost: z.boolean().default(false), vatRate: vatRate.default(0), vatGroup: text(100).default(''),
  fields: z.array(field).max(20).refine(values => new Set(values.map(customColumnKey)).size === values.length, 'Названия дополнительных полей одного типа должны различаться')
}).strict().refine(item => item.quantity * item.price <= 1e12, 'Сумма позиции не должна превышать 1 трлн')
export const estimateItemsSchema = z.array(estimateItemSchema).max(200)
  .refine(items => new Set(items.map(item => item.id)).size === items.length, 'Повторяющиеся строки')
  .refine(items => items.reduce((sum, item) => sum + lineTotal(item), 0) <= 1e13, 'Общая сумма сметы слишком велика')
export const counterpartySchema = z.object({ id: z.uuid(), company: text().min(1), inn: z.string().regex(/^(?:\d{10}|\d{12})?$/, 'ИНН должен содержать 10 или 12 цифр'), kpp: z.string().regex(/^(?:\d{9})?$/, 'КПП должен содержать 9 цифр'), director: text(), address: text(500), bankAccount: z.string().regex(/^(?:\d{20})?$/, 'Расчётный счёт должен содержать 20 цифр'), catalogId: z.uuid().optional(), isOwnLegalEntity: z.boolean().optional() }).strict()
const legacyQuantityId = '10000000-0000-4000-8000-000000000001', legacyPriceId = '10000000-0000-4000-8000-000000000002'
export const estimateDetailsSchema = z.object({ title: text().default(''), code: text(80).default(''), description: text(500).default(''), batchQuantity: z.number().finite().min(0).max(1e6).default(0), clientUnitPrice: amount.default(0), finishDate: date.default(''), revenueVatRate: vatRate.default(0), notice: text(1000).default(''), notes: z.array(text(2000)).max(10).default([]), counterpartyNote: text(2000).default(''),
  fields: z.array(field).max(20).optional(), revenueMode: z.enum(['formula','manual','markup']).default('formula'), revenueAmount: amount.default(0), markupPercent: z.number().finite().min(0).max(10000).default(0), revenueFactors: z.array(z.uuid()).max(2).optional()
}).strict().transform(value => {
  const fields = value.fields ?? (value.batchQuantity || value.clientUnitPrice ? [
    { id: legacyQuantityId, label: 'Тираж, компл.', type: 'number' as const, value: String(value.batchQuantity), currency: 'RUB' as const },
    { id: legacyPriceId, label: 'Цена набора для клиента, ₽', type: 'money' as const, value: String(value.clientUnitPrice), currency: 'RUB' as const }
  ] : [])
  return { ...value, fields, revenueFactors: value.revenueFactors ?? fields.filter(field => ['number','money'].includes(field.type)).slice(0,2).map(field => field.id) }
}).superRefine((value, ctx) => {
  if (new Set(value.fields.map(field => field.id)).size !== value.fields.length) ctx.addIssue({ code:'custom', message:'Дополнительные поля должны различаться' })
  if (value.revenueMode === 'formula' && value.revenueFactors.some(id => !value.fields.some(field => field.id === id && ['number','money'].includes(field.type)))) ctx.addIssue({ code:'custom', message:'Выберите числовые поля для расчёта выручки' })
})
const unique = <T extends { id: string }>(rows: T[]) => new Set(rows.map(row => row.id)).size === rows.length
export const estimateContentSchema = z.object({ items: estimateItemsSchema.default([]), details: estimateDetailsSchema.default(() => estimateDetailsSchema.parse({})), counterparties: z.array(counterpartySchema).max(200).refine(unique, 'Повторяющиеся контрагенты').default([]) }).strict().superRefine((content, ctx) => {
  const parties = new Set(content.counterparties.map(party => party.id))
  if (content.items.some(item => item.counterpartyId && !parties.has(item.counterpartyId))) ctx.addIssue({ code: 'custom', message: 'Сначала уберите связи с контрагентом из позиций сметы.' })
  const revenue = estimateRevenue(content.details, content.items.reduce((sum,item) => sum + lineTotal(item),0))
  if (!Number.isFinite(revenue) || revenue < 0 || revenue > 1e13) ctx.addIssue({ code:'custom', message:'Выручка должна быть от 0 до 10 трлн рублей. Проверьте параметры расчёта.' })
})
export const estimateWriteSchema = z.object({ revision: z.number().int().min(0), items: estimateItemsSchema.optional(), details: estimateDetailsSchema.optional(), counterparties: z.array(counterpartySchema).max(200).optional() }).strict()
export function normalizeEstimate(value: unknown): EstimateContent { return estimateContentSchema.parse(Array.isArray(value) ? { items: value } : value ?? {}) }
export const estimateViewSchema = z.object({ hiddenRows: z.array(z.uuid()).max(200), hiddenColumns: z.array(z.string().max(200)).max(4000) }).strict()
export const estimateExportSchema = z.object({ format: z.enum(['xlsx','pdf']), view: estimateViewSchema, target: z.enum(['estimate','counterparties']).default('estimate'), companyKind: z.enum(['all','counterparties','legal-entities']).default('all') }).strict()
export function customColumnKey(field: { label: string; type: string }) { return `custom:${field.type}:${field.label.trim().toLocaleLowerCase('ru')}` }
export const estimateBaseColumns = [
  { key: 'number', label: '№' }, { key: 'name', label: 'Статья затрат' }, { key: 'counterparty', label: 'Контрагент / исполнитель' },
  { key: 'unit', label: 'Ед.' }, { key: 'quantity', label: 'Количество' }, { key: 'price', label: 'Цена, ₽' },
  { key: 'total', label: 'Сумма, ₽' }, { key: 'vat', label: 'НДС входящий, ₽' }, { key: 'net', label: 'Без НДС, ₽' },
  { key: 'kind', label: 'Тип' }, { key: 'image', label: 'Изображение' }, { key: 'link', label: 'Ссылка' },
  { key: 'deadline', label: 'До какого числа' }, { key: 'vatRate', label: 'НДС, %' }
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
export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
export function estimateAmounts(items: EstimateItem[]) {
  const rows = items.map(item => ({ total: lineTotal(item), vat: roundMoney(lineTotal(item) * (item.vatRate || 0) / (100 + (item.vatRate || 0))), net: 0 }))
  const groups = new Map<string, number[]>()
  items.forEach((item, index) => { if (item.vatGroup && item.vatRate) { const key = `${item.counterpartyId}:${item.vatGroup}:${item.vatRate}`; groups.set(key, [...groups.get(key) ?? [], index]) } })
  for (const indices of groups.values()) {
    const last = indices.at(-1)!, rate = items[last]!.vatRate
    rows[last]!.vat = roundMoney(roundMoney(indices.reduce((sum, i) => sum + rows[i]!.total, 0) * rate / (100 + rate)) - indices.slice(0,-1).reduce((sum, i) => sum + rows[i]!.vat, 0))
  }
  rows.forEach(row => { row.net = roundMoney(row.total - row.vat) })
  return rows
}
export function estimateFinancials(content: Pick<EstimateContent, 'items' | 'details'>) {
  const rows = estimateAmounts(content.items), cost = roundMoney(rows.reduce((sum, row) => sum + row.total, 0)), inputVat = roundMoney(rows.reduce((sum, row) => sum + row.vat, 0)), netCost = roundMoney(cost-inputVat)
  const revenue = estimateRevenue(content.details, cost), outputVat = roundMoney(revenue * content.details.revenueVatRate / (100+content.details.revenueVatRate)), netRevenue = roundMoney(revenue-outputVat), profit = roundMoney(netRevenue-netCost)
  return { cost, inputVat, netCost, revenue, outputVat, netRevenue, difference: roundMoney(revenue-cost), profit, profitability: netRevenue ? profit/netRevenue : null }
}
export function estimateRevenue(details: EstimateContent['details'], cost: number) {
  if (details.revenueMode === 'manual') return roundMoney(details.revenueAmount)
  if (details.revenueMode === 'markup') return roundMoney(cost * (1 + details.markupPercent/100))
  const values = details.revenueFactors.map(id => details.fields.find(field => field.id === id)?.value ?? '')
  return values.length && values.every(value => value !== '' && Number.isFinite(Number(value))) ? roundMoney(values.reduce((product,value) => product * Number(value), 1)) : 0
}
export function counterpartyLabel(id: string, parties: ProjectCounterparty[]) { return parties.find(party => party.id === id)?.company || '' }
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
  return (item[key as keyof EstimateItem] ?? '') as string | number
}
export function estimateSnapshot(items: EstimateItem[], view: EstimateView) {
  const rows = items.filter(item => !view.hiddenRows.includes(item.id))
  return { rows, columns: estimateColumns(items).filter(column => !view.hiddenColumns.includes(column.key)), totals: estimateTotals(rows) }
}
