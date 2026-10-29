import type { Subscription, SubscriptionCard, NotificationSettings, ReminderRules } from '../types/subscriptions'
import type { ScopedCredential } from './vault-sources'
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = { sharedChanges: true, subscriptions: true, leadDays: [7, 3, 1, 0], repeatEveryDays: 0, customDates: [] }
export const todayDate = (now = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
export function validDate(value: string): boolean { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false; const date = new Date(`${value}T12:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value && value.slice(0,4) !== '0000' }
export function addPeriod(value: string, count: number, unit: 'day' | 'month' | 'year'): string {
  if (!validDate(value) || !Number.isInteger(count)) return ''
  const date = new Date(`${value}T12:00:00Z`), day = date.getUTCDate()
  if (unit === 'day') date.setUTCDate(day + count)
  else { date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + count * (unit === 'year' ? 12 : 1)); const last = new Date(date); last.setUTCMonth(last.getUTCMonth()+1); last.setUTCDate(0); date.setUTCDate(Math.min(day, last.getUTCDate())) }
  if (!Number.isFinite(date.getTime())) return ''
  const result = date.toISOString().slice(0,10)
  return validDate(result) ? result : ''
}
export const dayDifference = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86400000)
export const dateLabel = (value: string) => validDate(value) ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`)) : '—'
export const moneyLabel = (value: Subscription) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: value.currency, maximumFractionDigits: 2 }).format(value.price)
export function periodLabel(value: Subscription) { return `${value.periodCount} ${value.periodUnit === 'day' ? 'дн.' : value.periodUnit === 'month' ? 'мес.' : 'г.'}` }
export function nextPaidUntil(value: Subscription) {
  const monthDistance = (Number(value.paidUntil.slice(0,4)) - Number(value.startsOn.slice(0,4))) * 12 + Number(value.paidUntil.slice(5,7)) - Number(value.startsOn.slice(5,7))
  const elapsed = value.periodUnit === 'day' ? dayDifference(value.startsOn, value.paidUntil) : value.periodUnit === 'year' ? monthDistance / 12 : monthDistance
  const cycles = elapsed / value.periodCount
  if (Number.isInteger(cycles) && cycles >= 0 && addPeriod(value.startsOn, cycles * value.periodCount, value.periodUnit) === value.paidUntil) return addPeriod(value.startsOn, (cycles + 1) * value.periodCount, value.periodUnit)
  return addPeriod(value.paidUntil, value.periodCount, value.periodUnit)
}
export function subscriptionRows(entries: ScopedCredential[], today = todayDate()) {
  return entries.flatMap(entry => (entry.kind === 'subscription' ? (entry.financeSubscription ? [entry.financeSubscription] : []) : entry.customFields ?? []).filter(field => field.type === 'subscription' && field.subscription).map(field => {
    const subscription = field.subscription!, daysLeft = dayDifference(today, subscription.paidUntil), from = subscription.paidFrom || subscription.startsOn
    return { key: `${entry.vaultId}/${entry.id}/${field.id}`, entry, field, subscription, daysLeft, progress: Math.max(0, Math.min(100, dayDifference(from, today) / Math.max(1,dayDifference(from, subscription.paidUntil)) * 100)) }
  })).sort((a,b) => a.subscription.paidUntil.localeCompare(b.subscription.paidUntil) || a.entry.title.localeCompare(b.entry.title, 'ru'))
}
export function dueReminder(subscription: Subscription, rules: ReminderRules, today: string): string | null {
  const dates = [...new Set([...rules.leadDays.map(days => addPeriod(subscription.paidUntil, -days, 'day')), ...rules.customDates])].filter(validDate).sort()
  const first = dates[0]
  if (!first || today < first) return null
  if (rules.repeatEveryDays > 0) { const elapsed = dayDifference(first, today), slot = Math.floor(elapsed / rules.repeatEveryDays); dates.push(addPeriod(first, slot * rules.repeatEveryDays, 'day')) }
  return dates.filter(date => date <= today).sort().at(-1) || null
}

export const subscriptionCardKey = (card: SubscriptionCard) => card.sharedCardId ? `shared:${card.sharedCardId}` : `${card.vaultId}/${card.entryId}`
export function matchesSubscriptionCard(card: SubscriptionCard, entry: ScopedCredential): boolean {
  return card.sharedCardId ? card.sharedCardId === entry.sharedCardId : card.entryId === entry.id && (entry.vaultIds ?? [entry.vaultId]).includes(card.vaultId)
}
export function subscriptionCardReferences(subscription: Subscription): SubscriptionCard[] {
  return [...(subscription.primaryCard ? [subscription.primaryCard] : []), ...(subscription.linkedCards ?? [])]
}
