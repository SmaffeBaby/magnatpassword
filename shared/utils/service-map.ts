import type { ScopedCredential } from './vault-sources'
import { cardKey, buildRelationships } from './relationships'

export interface ServiceResource {
  id: string
  entry: ScopedCredential
  reasons: string[]
}
export interface ServiceMapCard {
  id: string
  entry: ScopedCredential
  passwords: ServiceResource[]
  subscriptions: ServiceResource[]
  services: ServiceResource[]
  unavailable: number
}
export const serviceEntryKey = (entry: ScopedCredential) => cardKey(entry.vaultId, entry.id)
const compare = (a: { entry: ScopedCredential }, b: { entry: ScopedCredential }) => a.entry.title.localeCompare(b.entry.title, 'ru', { numeric: true }) || a.entry.vaultName.localeCompare(b.entry.vaultName, 'ru') || serviceEntryKey(a.entry).localeCompare(serviceEntryKey(b.entry))

// Only saved references form the map. Similar names and websites are suggestions, never edges.
export function buildServiceMap(entries: ScopedCredential[]) {
  const aliases = new Map<string, ScopedCredential>()
  for (const entry of entries) for (const vaultId of new Set([entry.vaultId,...(entry.vaultIds??[])])) aliases.set(cardKey(vaultId, entry.id), entry)
  const cards: ServiceMapCard[] = entries.filter(entry => entry.kind === 'relationship').map(entry => ({ id: serviceEntryKey(entry), entry, passwords: [], subscriptions: [], services: [], unavailable: 0 })).sort(compare)
  const byId = new Map(cards.map(card => [card.id, card]))
  function add(list: ServiceResource[], entry: ScopedCredential, reason: string) {
    const id = serviceEntryKey(entry), existing = list.find(item => item.id === id)
    if (existing) { if (reason && !existing.reasons.includes(reason)) existing.reasons.push(reason) }
    else list.push({ id, entry, reasons: reason ? [reason] : [] })
  }
  for (const card of cards) {
    const missing = new Set<string>()
    for (const link of card.entry.links ?? []) {
      const key = cardKey(link.targetVaultId, link.targetEntryId), target = aliases.get(key)
      if (!target) { missing.add(key); continue }
      if (serviceEntryKey(target) === card.id) continue
      const reason = link.label || 'Привязка в карточке сервиса'
      if (target.kind === 'relationship') {
        add(card.services, target, reason)
        const other = byId.get(serviceEntryKey(target))
        if (other) add(other.services, card.entry, reason)
      } else add(target.kind === 'subscription' ? card.subscriptions : card.passwords, target, reason)
    }
    card.unavailable = missing.size
  }
  const usage = new Map<string, ServiceMapCard[]>()
  for (const card of cards) {
    card.passwords.sort(compare); card.subscriptions.sort(compare); card.services.sort(compare)
    for (const resource of [...card.passwords, ...card.subscriptions]) {
      const owners = usage.get(resource.id) ?? []
      owners.push(card); usage.set(resource.id, owners)
    }
  }
  const unlinked = entries.filter(entry => entry.kind !== 'relationship' && !usage.has(serviceEntryKey(entry))).sort((a,b) => compare({entry:a},{entry:b}))
  return { cards, usage, unlinked }
}

export function searchServiceCards(cards: ServiceMapCard[], query: string) {
  const terms = query.toLocaleLowerCase('ru-RU').trim().split(/\s+/).filter(Boolean)
  return cards.filter(card => {
    const values = [card.entry, ...card.passwords.map(row=>row.entry), ...card.subscriptions.map(row=>row.entry), ...card.services.map(row=>row.entry)]
    const text = values.map(entry => [entry.title, entry.url, ...(entry.vaultNames ?? [entry.vaultName]), entry.financeSubscription?.label ?? ''].join(' ')).join(' ').toLocaleLowerCase('ru-RU')
    return terms.every(term => text.includes(term))
  })
}

export function serviceSuggestions(entries: ScopedCredential[], id: string) {
  // Compare service metadata only: Password credentials and secret fields never enter suggestions.
  const services = entries.filter(entry => entry.kind === 'relationship')
  const graph = buildRelationships(services, 'all'), nodes = new Map(graph.nodes.map(node=>[node.id,node]))
  const reasons = new Map<string, Set<string>>()
  const saved = new Set(buildServiceMap(entries).cards.find(card=>card.id===id)?.services.map(row=>row.id) ?? [])
  const groups = new Set(graph.edges.filter(edge=>edge.source===id && edge.kind!=='manual').map(edge=>edge.target))
  for (const edge of graph.edges) {
    if (!groups.has(edge.target) || edge.source===id || edge.kind==='manual' || saved.has(edge.source)) continue
    const node=nodes.get(edge.target), labels=reasons.get(edge.source)??new Set<string>()
    if(node)labels.add(`${edge.kind==='site'?'Общий сайт':edge.kind==='field'?'Общее поле':'Похожее название'}: ${node.label}`)
    reasons.set(edge.source,labels)
  }
  return services.filter(entry=>reasons.has(serviceEntryKey(entry))).map(entry=>({id:serviceEntryKey(entry),entry,reasons:[...reasons.get(serviceEntryKey(entry))!]})).sort(compare)
}
