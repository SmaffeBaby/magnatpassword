import type { AssistantReply } from '../types/assistant'
import type { VaultSource } from '../types/sharing'
import { sourcePayments, currencyTotals, amountLabel } from './subscription-finances.ts'
import { todayDate, validDate, addPeriod, dateLabel } from './subscriptions.ts'
export function isSubscriptionHistoryQuestion(question: string) {
  if (/проект|договор/iu.test(question) || /^(?:как|где)\s/iu.test(question.trim())) return false
  return /оплатил|оплатила|оплатили|оплаченные|оплачены|истори[яюи].*оплат|что.*оплачено|плат[её]жи.*(?:месяц|недел|сегодня|вчера)/iu.test(question)
}
export function paymentPeriod(question: string, today: string): { from: string; to: string } | null {
  const dates = [...question.matchAll(/\d{4}-\d{2}-\d{2}/gu)].map(match => match[0])
  if (dates.length === 2 && dates.every(validDate) && dates[0]! <= dates[1]!) return { from: dates[0]!, to: dates[1]! }
  if (/вчера/iu.test(question)) return { from: addPeriod(today, -1, 'day'), to: addPeriod(today, -1, 'day') }
  if (/сегодня/iu.test(question)) return { from: today, to: today }
  const days = Number(question.match(/последни[ех]\s+(\d+)\s*дн/iu)?.[1])
  if (days >= 1 && days <= 366) return { from: addPeriod(today, 1 - days, 'day'), to: today }
  if (/недел/iu.test(question)) return { from: addPeriod(today, -6, 'day'), to: today }
  if (/в этом году|текущ[а-яё]* год/iu.test(question)) return { from: today.slice(0, 4) + '-01-01', to: today.slice(0, 4) + '-12-31' }
  if (/месяц/iu.test(question)) {
    const current = today.slice(0, 7) + '-01'
    const from = /прошл|предыдущ/iu.test(question) ? addPeriod(current, -1, 'month') : /этом|текущ/iu.test(question) ? current : ''
    if (from) return { from, to: addPeriod(addPeriod(from, 1, 'month'), -1, 'day') }
  }
  return null
}
export function paymentHistoryReply(question: string, sources: VaultSource[], today = todayDate()): AssistantReply {
  const links = [{ label: 'История оплат', to: '/finances/history' }], period = paymentPeriod(question, today)
  if (!period) return { message: 'За какой период показать записанные оплаты? Например: «в этом месяце», «в прошлом месяце» или «с 2026-11-01 по 2026-11-10».', draft: null, links }
  const all = sourcePayments(sources), normalized = (text: string) => text.toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const query = ` ${normalized(question)} `, names = new Set(all.filter(payment => normalized(payment.service).length >= 3 && query.includes(` ${normalized(payment.service)} `)).map(payment => payment.service))
  const payments = all.filter(payment => {
    if (names.size && !names.has(payment.service)) return false
    if (!Number.isFinite(Date.parse(payment.paidAt))) return false
    const date = todayDate(new Date(payment.paidAt))
    if (date < period.from || date > period.to) return false
    const text = `${payment.service} ${payment.label}`.toLocaleLowerCase('ru')
    if (/домен/iu.test(question) && !/домен/iu.test(text)) return false
    if (/хостинг|vps|vds/iu.test(question) && !/хостинг|hosting|vps|vds/iu.test(text)) return false
    return true
  }).sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.service.localeCompare(b.service, 'ru'))
  const lines = [`Записанные оплаты за ${dateLabel(period.from)} — ${dateLabel(period.to)}: ${payments.length}.`]
  for (const p of payments.slice(0, 30)) lines.push(`• ${dateLabel(todayDate(new Date(p.paidAt)))} — ${p.service} · ${p.label} · ${p.vaultNames.join(', ')}: ${amountLabel(p.amount, p.currency)}. Оплаченный период: ${dateLabel(p.periodFrom)} — ${dateLabel(p.periodUntil)}.`)
  if (!payments.length) lines.push('За этот период в доступной вам истории записей об оплате нет.')
  if (payments.length > 30) lines.push(`Показаны первые 30 из ${payments.length}. Уточните период или откройте полную историю.`)
  if (payments.length) lines.push('Итого по валютам: ' + currencyTotals(payments).map(total => amountLabel(total.amount, total.currency)).join('; ') + '.')
  if (/(?:^|\s)я(?:\s|$)/iu.test(question)) lines.push('В истории не указан автор отметки оплаты; показаны записи доступных вам хранилищ.')
  lines.push('Источник — сохранённая история оплат доступных хранилищ; срок действия подписки не считается записью об оплате. Даты платежей учитываются по Москве.')
  return { message: lines.join('\n'), draft: null, conversation: { topic: 'site' }, links }
}
