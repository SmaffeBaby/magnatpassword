import type { Credential } from '../types/vault'
import type { SubscriptionPayment } from '../types/subscriptions'
import { subscriptionCardKey } from './subscriptions'

// Keep the former field ID so renewals, links and payment history retain a stable identity.
export function extractFinanceSubscriptions(entry: Credential, payments: SubscriptionPayment[], vaultId: string, sharedCardId?: string, createId = () => crypto.randomUUID()) {
  const fields = (entry.customFields ?? []).filter(field => field.type === 'subscription' && field.subscription)
  const owner = { vaultId, entryId: entry.id, ...(sharedCardId ? { sharedCardId } : {}) }
  const children = fields.map(field => {
    const subscription = structuredClone(field.subscription!)
    subscription.primaryCard ??= owner
    if (subscriptionCardKey(subscription.primaryCard) !== subscriptionCardKey(owner) && !(subscription.linkedCards ?? []).some(card => subscriptionCardKey(card) === subscriptionCardKey(owner))) {
      subscription.linkedCards = [...(subscription.linkedCards ?? []), owner]
    }
    const child: Credential = {
      id: createId(), kind: 'subscription', title: entry.title, url: '', username: '', password: '', notes: '',
      categoryId: entry.categoryId, categoryIds: entry.categoryIds, favorite: false,
      createdAt: entry.createdAt, updatedAt: entry.updatedAt,
      financeSubscription: { id: field.id, label: field.label, type: 'subscription', value: '', subscription }
    }
    return { id: child.id, entry: child, payments: payments.filter(payment => payment.entryId === entry.id && payment.fieldId === field.id).map(payment => ({ ...payment, entryId: child.id })) }
  })
  const ids = new Set(fields.map(field => field.id))
  return {
    entry: { ...entry, customFields: entry.customFields?.filter(field => !ids.has(field.id)) },
    payments: payments.filter(payment => payment.entryId !== entry.id || !ids.has(payment.fieldId)), children
  }
}
