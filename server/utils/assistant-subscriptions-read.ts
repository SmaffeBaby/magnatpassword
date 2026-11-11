import { isSubscriptionHistoryQuestion, paymentHistoryReply } from '../../shared/utils/assistant-payment-history'
import type { H3Event } from 'h3'
import type { SharedVault, SharedCard } from '../../shared/types/sharing'
import type { VaultData } from '../../shared/types/vault'
import { projectSharedCards } from '../../shared/utils/shared-card-sources'
import { sourceEntries } from '../../shared/utils/vault-sources'
import { isSubscriptionRead, subscriptionReadReply } from '../../shared/utils/assistant-subscriptions'
import { assistantFetch } from './assistant-context'
export async function assistantSubscriptionsRead(event: H3Event, question: string, selected?: string) {
  if (!isSubscriptionRead(question)) return null
  const [workspace, personal] = await Promise.all([
    assistantFetch<{ groups: SharedVault[]; cards: SharedCard[] }>(event, '/api/workspace'),
    assistantFetch<{ data: VaultData }>(event, '/api/personal-vault')
  ])
  const sources = projectSharedCards([{ id: 'personal', name: personal.data.name || 'Личное', data: personal.data }, ...workspace.groups.map(group => ({ id: group.id, name: group.name, data: group.data }))], workspace.cards)
  if (isSubscriptionHistoryQuestion(question)) return paymentHistoryReply(question, sources)
  const entries = sourceEntries(sources, true)
  if (selected && !entries.some(entry => `${entry.vaultId}/${entry.id}` === selected)) throw createError({ statusCode: 403, message: 'Карточка подписки недоступна.' })
  return subscriptionReadReply(question, entries, undefined, selected)
}
