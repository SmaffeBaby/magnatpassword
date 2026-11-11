import type { H3Event } from 'h3'
import type { SharedVault, SharedCard } from '../../shared/types/sharing'
import type { VaultData } from '../../shared/types/vault'
import { projectSharedCards } from '../../shared/utils/shared-card-sources'
import { sourceEntries } from '../../shared/utils/vault-sources'
import { assistantGraph, cardRelationshipReply, isCardRelationshipQuestion } from '../../shared/utils/assistant-graph'
import { assistantFetch } from './assistant-context'
export async function assistantGraphRead(event: H3Event, question: string, selected?: string) {
  if (!isCardRelationshipQuestion(question)) return null
  // Same permission/category-filtered sources as the map; unavailable sources fail rather than imply no links.
  const [workspace, personal] = await Promise.all([
    assistantFetch<{ groups: SharedVault[]; cards: SharedCard[] }>(event, '/api/workspace'),
    assistantFetch<{ data: VaultData }>(event, '/api/personal-vault')
  ])
  const sources = projectSharedCards([{ id: 'personal', name: personal.data.name || 'Личное', data: personal.data }, ...workspace.groups.map(group => ({ id: group.id, name: group.name, data: group.data }))], workspace.cards)
  const data = assistantGraph(sourceEntries(sources, true))
  if (selected && !data.cards.some(card => card.key === selected)) throw createError({ statusCode: 403, message: 'Карточка недоступна.' })
  return cardRelationshipReply(question, data, selected)
}
