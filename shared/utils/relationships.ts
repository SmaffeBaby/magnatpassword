import type { ScopedCredential } from './vault-sources'
export type RelationshipMode = 'all' | 'title' | 'site' | 'field' | 'manual'
export interface RelationNode { id: string; label: string; kind: 'card' | 'title' | 'site' | 'field'; vaultName?: string }
export interface RelationEdge { id: string; source: string; target: string; kind: 'title' | 'site' | 'field' | 'manual'; label: string }
export const cardKey = (vaultId: string, entryId: string) => `${vaultId}/${entryId}`
export function siteDomain(value: string): string {
  try { const url = new URL(value.includes('://') ? value : `https://${value}`); return ['http:', 'https:'].includes(url.protocol) ? url.hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '') : '' } catch { return '' }
}
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const baseFields: Record<string, string> = { title: 'Название', url: 'Сайт', username: 'Логин', password: 'Пароль', notes: 'Заметка' }
const fieldLabel = (entry: ScopedCredential, id?: string) => id ? baseFields[id] || entry.accounts?.find(account=>account.id===id)?.label || entry.customFields?.find(f => f.id === id)?.label : undefined
export function buildRelationships(entries: ScopedCredential[], mode: RelationshipMode = 'all') {
  const nodes: RelationNode[] = entries.map(e => ({ id: cardKey(e.vaultId, e.id), label: e.title, kind: 'card', vaultName: e.vaultName }))
  const edges: RelationEdge[] = [], lookup = new Map(entries.map(e => [cardKey(e.vaultId, e.id), e]))
  const groups = new Map<string, { kind: 'title' | 'site' | 'field'; label: string; members: Set<string> }>()
  function group(kind: 'title' | 'site', label: string, id: string) {
    if (!label) return
    const key = `${kind}:${label}`
    if (!groups.has(key)) groups.set(key, { kind, label, members: new Set() })
    groups.get(key)!.members.add(id)
  }
  for (const entry of entries) {
    const id = cardKey(entry.vaultId, entry.id)
    if (mode === 'all' || mode === 'title') {
      const title = normalize(entry.title)
      const words = new Set(title.split(' ').filter(word => word.length >= 3 && !['для', 'the', 'and', 'account', 'аккаунт'].includes(word)))
      if (title) words.add(title)
      for (const word of words) group('title', word, id)
    }
    if (mode === 'all' || mode === 'site') group('site', siteDomain(entry.url), id)
    if (mode === 'all' || mode === 'manual') for (const link of entry.links ?? []) {
      const requestedId=cardKey(link.targetVaultId,link.targetEntryId), target=lookup.get(requestedId)??entries.find(entry=>entry.id===link.targetEntryId&&(entry.vaultIds??[entry.vaultId]).includes(link.targetVaultId)),targetId=target?cardKey(target.vaultId,target.id):requestedId
      if (!target || targetId === id) continue
      const sourceField = fieldLabel(entry, link.sourceFieldId)
      const targetField = fieldLabel(target, link.targetFieldId)
      const fields = [sourceField, targetField].filter(Boolean).join(' → ')
      edges.push({ id: `${id}/${link.id}`, source: id, target: targetId, kind: 'manual', label: [link.label, fields].filter(Boolean).join(' · ') || 'Ручная связь' })
    }
  }
  if (mode === 'all' || mode === 'field') {
    const titles = entries.map(e => ({ id: cardKey(e.vaultId, e.id), title: normalize(e.title) }))
    const values = new Map<string, string>()
    for (const entry of entries) for (const field of entry.customFields ?? []) {
      if (field.type === 'secret' || field.type === 'subscription') continue
      const label = normalize(field.label), value = field.value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU')
      if (!label || !value) continue
      const id = `field:${JSON.stringify([label, value])}`
      if (!groups.has(id)) groups.set(id, { kind: 'field', label: `${field.label.trim().replace(/[:：]$/, '')}: ${field.value.trim()}`, members: new Set() })
      groups.get(id)!.members.add(cardKey(entry.vaultId, entry.id))
      values.set(id, normalize(field.value))
    }
    // A provider card may have no custom field itself (e.g. "TimeWeb Cloud").
    for (const [id, value] of values) if (value) for (const card of titles) {
      if (card.title === value || value.length >= 3 && ` ${card.title} `.includes(` ${value} `)) groups.get(id)!.members.add(card.id)
    }
  }
  const distinct = new Map<string, [string, { kind: 'title' | 'site' | 'field'; label: string; members: Set<string> }]>()
  for (const pair of groups) if (pair[1].members.size > 1) {
    const signature = pair[1].kind === 'field' ? pair[0] : `${pair[1].kind}:${[...pair[1].members].sort().join('|')}`
    if (!distinct.has(signature) || distinct.get(signature)![1].label.length < pair[1].label.length) distinct.set(signature, pair)
  }
  for (const [id, value] of distinct.values()) {
    nodes.push({ id, label: value.label, kind: value.kind })
    for (const source of value.members) edges.push({ id: `${id}/${source}`, source, target: id, kind: value.kind, label: value.kind === 'field' ? value.label : value.kind === 'title' ? 'Общее название' : 'Общий сайт' })
  }
  return { nodes, edges }
}
