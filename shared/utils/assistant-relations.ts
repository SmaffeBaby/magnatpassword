import { assistantSite } from './assistant-lookup.ts'
import type { ScopedCredential } from './vault-sources'
import type { AssistantContext } from '../types/assistant'

export function assistantRelations(entries: ScopedCredential[]): AssistantContext['relations'] {
  const byKey = new Map<string, ScopedCredential>(), byShared = new Map<string, ScopedCredential>()
  const rows = new Map<ScopedCredential, AssistantContext['relations'][number]>()
  const linked = new Map<ScopedCredential, Set<ScopedCredential>>()
  for (const entry of entries) {
    for (const vault of entry.vaultIds || [entry.vaultId]) byKey.set(`${vault}/${entry.id}`, entry)
    if (entry.sharedCardId) byShared.set(entry.sharedCardId, entry)
    if (!entry.kind) rows.set(entry, { key: `${entry.vaultId}/${entry.id}`, title: entry.title, site: assistantSite(entry.url), vault: entry.vaultName, subscriptions: [] })
  }
  for (const entry of entries) for (const link of entry.links || []) {
    const target = byKey.get(`${link.targetVaultId}/${link.targetEntryId}`)
    if (!target) continue
    if (!linked.has(entry)) linked.set(entry, new Set())
    if (!linked.has(target)) linked.set(target, new Set())
    linked.get(entry)!.add(target); linked.get(target)!.add(entry)
  }
  for (const owner of entries) for (const field of [owner.financeSubscription, ...(owner.customFields || [])]) {
    if (!field?.subscription) continue
    const sub = field.subscription, targets = new Map<ScopedCredential, string>()
    if (rows.has(owner)) targets.set(owner, 'Подписка в полях этой карточки')
    for (const target of linked.get(owner) || []) {
      targets.set(target, 'Ручная связь карточек')
      if (target.kind === 'relationship') for (const member of linked.get(target) || []) {
        if (member !== owner && !targets.has(member)) targets.set(member, `Через карточку взаимосвязи «${target.title}»`)
      }
    }
    for (const ref of [...(sub.primaryCard ? [sub.primaryCard] : []), ...(sub.linkedCards || [])]) {
      const target = ref.sharedCardId ? byShared.get(ref.sharedCardId) : byKey.get(`${ref.vaultId}/${ref.entryId}`)
      if (target) targets.set(target, 'Пароль явно выбран в подписке')
    }
    for (const [target, relation] of targets) {
      const row = rows.get(target)
      if (!row) continue
      const title = `${owner.title} · ${field.label}`
      if (!row.subscriptions.some(item => item.title === title && item.paidUntil === sub.paidUntil)) row.subscriptions.push({ title, relation, paidUntil: sub.paidUntil, price: sub.price, currency: sub.currency })
    }
  }
  return [...rows.values()]
}
