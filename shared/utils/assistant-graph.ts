import type { ScopedCredential } from './vault-sources'
import type { AssistantReply } from '../types/assistant'
import { buildRelationships, siteDomain } from './relationships.ts'
import { subscriptionCardReferences, matchesSubscriptionCard } from './subscriptions.ts'
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
export function isCardRelationshipQuestion(question: string) {
  if (/смет|договор/iu.test(question) || /проект/iu.test(question) && !/домен|хостинг|размещ/iu.test(question) || /парол[\s\S]*подпис|подпис[\s\S]*парол/iu.test(question)) return false
  if (/сколько стоит|стоимост|цен[ауеы]|срок/iu.test(question) && !/связ|размещ|хостинг/iu.test(question)) return false
  return /домен|хостинг|размещ|взаимосвяз|связан|связь|связи|связей/iu.test(question) && !/связк/iu.test(question)
}
export function assistantGraph(entries: ScopedCredential[]) {
  // Graph inputs contain only labels, domains, public fields and explicit references.
  const safe = entries.map(entry => ({ ...entry, url: siteDomain(entry.url), username: '', password: '', notes: '', accounts: [], images: [], customFields: (entry.customFields || []).filter(field => field.type !== 'secret').map(field => ({ ...field, value: field.type === 'subscription' ? '' : field.value })) }))
  const graph = buildRelationships(safe)
  // The visual map also suggests partial title matches. Only exact provider names
  // or the actual matching field qualify as field evidence in a factual answer.
  const lookup = new Map(safe.map(entry => [`${entry.vaultId}/${entry.id}`, entry]))
  const nodesById = new Map(graph.nodes.map(node => [node.id, node]))
  graph.edges = graph.edges.filter(edge => {
    if (edge.kind !== 'field') return true
    const entry = lookup.get(edge.source), node = nodesById.get(edge.target)
    if (!entry || !node) return false
    const [, value] = JSON.parse(node.id.slice('field:'.length)) as [string, string]
    return normalize(entry.title) === normalize(value) || entry.customFields.some(field => field.type !== 'subscription' && normalize(`${field.label}: ${field.value}`) === normalize(node.label))
  })
  for (const owner of safe) if (owner.financeSubscription?.subscription) for (const ref of subscriptionCardReferences(owner.financeSubscription.subscription)) {
    const target = safe.find(entry => matchesSubscriptionCard(ref, entry))
    if (target) graph.edges.push({ id: `subscription:${owner.id}:${target.id}`, source: `${owner.vaultId}/${owner.id}`, target: `${target.vaultId}/${target.id}`, kind: 'manual', label: 'Карточка выбрана в подписке' })
  }
  return { cards: safe.map(entry => ({ key: `${entry.vaultId}/${entry.id}`, title: entry.title, site: siteDomain(entry.url) || (/^[\p{L}\p{N}][\p{L}\p{N}.-]*\.[\p{L}\p{N}-]{2,63}$/u.test(entry.title.trim()) ? siteDomain(entry.title.trim()) : ''), kind: entry.kind || 'password', vault: entry.vaultName })), graph }
}
type Graph = ReturnType<typeof assistantGraph>
const kindLabel = (kind: string) => kind === 'relationship' ? 'Взаимосвязи' : kind === 'subscription' ? 'Финансы' : 'Пароли'
export function cardRelationshipReply(question: string, data: Graph, selected?: string): AssistantReply {
  const { cards, graph } = data, q = normalize(question)
  const links = [{ label: 'Карта взаимосвязей', to: '/relationships/map' }]
  if (/что такое|как.*(?:работ|добав|созда)|что.*(?:можно|умеет)/iu.test(question)) return { message: 'Во «Взаимосвязях» есть явные связи карточек и найденные совпадения по названию, сайту или полям. Явная связь указывает на сохранённую связь записей. Совпадение поля показывает одинаковое значение, например хостинг; совпадение названия или сайта само по себе не подтверждает размещение домена или оплату.', draft: null, links }
  const named = cards.filter(card => normalize(card.title).length >= 3 && ` ${q} `.includes(` ${normalize(card.title)} `))
  const longest = Math.max(0, ...named.map(card => normalize(card.title).length))
  let roots = named.filter(card => normalize(card.title).length === longest)
  if (roots.length !== 1 && selected) {
    const picked = cards.find(card => card.key === selected && (!roots.length || roots.some(root => root.key === card.key)))
    if (picked) roots = [picked]
  }
  if (!roots.length) roots = cards.filter(card => card.site && question.toLowerCase().includes(card.site) || normalize(card.title).split(' ').some(word => word.length >= 4 && q.split(' ').includes(word)))
  const service = roots.filter(card => card.kind === 'relationship')
  if (service.length === 1 && roots.every(card => normalize(card.title) === normalize(service[0]!.title))) roots = service
  if (roots.length !== 1) return { message: roots.length ? 'Нашёл несколько карточек. Для какой показать связи?' : 'О какой карточке или сервисе рассказать? Выберите его ниже или напишите название.', draft: null, choice: { kind: 'record', prompt: 'Выберите карточку для проверки связей', options: (roots.length ? roots : cards).map(card => ({ id: card.key, label: `${card.title} · ${kindLabel(card.kind)} · ${card.vault}` })) }, links }
  const root = roots[0]!, byKey = new Map(cards.map(card => [card.key, card])), nodes = new Map(graph.nodes.map(node => [node.id, node]))
  const found = new Map<string, { key: string; reason: string; explicit: boolean }>()
  const manual = graph.edges.filter(edge => edge.kind === 'manual')
  function adjacent(key: string) { return manual.flatMap(edge => edge.source === key ? [{ key: edge.target, label: edge.label }] : edge.target === key ? [{ key: edge.source, label: edge.label }] : []) }
  for (const edge of adjacent(root.key)) {
    if (byKey.has(edge.key) && edge.key !== root.key) found.set(edge.key, { key: edge.key, reason: `Явная связь: ${edge.label}`, explicit: true })
    // One service card may group its password and finance cards. Show the path, not an invented direct link.
    if (byKey.get(edge.key)?.kind === 'relationship') for (const next of adjacent(edge.key)) {
      if (next.key !== root.key && !found.has(next.key) && byKey.has(next.key)) found.set(next.key, { key: next.key, reason: `Через «${byKey.get(edge.key)!.title}»: ${edge.label} → ${next.label}`, explicit: true })
    }
  }
  const coincidences = new Set<string>()
  for (const edge of graph.edges.filter(edge => edge.kind !== 'manual' && edge.source === root.key)) {
    for (const peer of graph.edges.filter(peer => peer.target === edge.target && peer.source !== root.key)) {
      if (!byKey.has(peer.source)) continue
      if (edge.kind === 'field' && !found.has(peer.source)) found.set(peer.source, { key: peer.source, reason: `Совпадение поля: ${nodes.get(edge.target)?.label || edge.label}`, explicit: false })
      else if (edge.kind !== 'field') coincidences.add(peer.source)
    }
  }
  const domainsOnly = /домен/iu.test(question), all = [...found.values()].filter(row => {
    if (!domainsOnly) return true
    const card = byKey.get(row.key)!
    return !!card.site && card.kind !== 'subscription' && card.site !== root.site && normalize(card.title) !== normalize(root.title)
  })
  const page = Math.max(1, Number(question.match(/страниц[аыуе]?\s*(\d+)/iu)?.[1]) || 1), start = (page - 1) * 40
  const lines = [`«${root.title}» · ${kindLabel(root.kind)} · ${root.vault}.`, domainsOnly ? `Доступных связанных карточек с доменом: ${all.length}.` : `Связанных карточек: ${all.length}.`]
  for (const row of all.slice(start, start + 40)) { const card = byKey.get(row.key)!; lines.push(`• ${domainsOnly ? card.site + ' — ' : ''}${card.title} · ${kindLabel(card.kind)} · ${card.vault}. ${row.reason}.`) }
  if (!all.length) lines.push(domainsOnly ? 'В доступных карточках не найдены домены с явной связью или совпадающим полем у этого сервиса.' : 'В доступных карточках нет явных связей или совпадающих полей с этой записью.')
  if (all.some(row => !row.explicit)) lines.push('Совпадение поля отражает сохранённые значения карточек; оно не является проверкой текущего состояния сервиса.')
  if (coincidences.size) lines.push(`Также есть совпадения названия или сайта: ${coincidences.size}. Они не включены в список подтверждённых связей и доменов.`)
  if (all.length > 40) lines.push(`Страница ${page} из ${Math.ceil(all.length / 40)}. Для продолжения напишите «страница ${page + 1}».`)
  return { message: lines.join('\n'), draft: null, conversation: { topic: 'relationships', recordKey: root.key, relationQuery: question.slice(0, 300) }, links }
}
