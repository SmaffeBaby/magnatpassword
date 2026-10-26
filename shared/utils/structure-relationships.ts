import type { VaultSource } from '../types/sharing'
import { entryCategoryIds } from './credentials'
import { buildRelationships, cardKey } from './relationships'
import { sourceEntries, sourceCategories, sourceCategoryFolders, categoryInFolder, categoryFilterId } from './vault-sources'

export type StructureView = 'categories' | 'vaults'
export interface StructureRow { id: string; label: string; meta: string; kind: 'card' | 'category' | 'folder'; entryKey?: string; categoryKey?: string }
export interface StructureTable { id: string; label: string; subtitle: string; kind: 'category' | 'folder' | 'vault'; rows: StructureRow[]; vaultId: string; categoryKey?: string }
export interface StructureLink { id: string; source: string; target: string; sourceRow: string; targetRow: string; kind: 'shared' | 'manual' | 'folder'; reasons: string[]; count: number }
export interface StructureDiagram { tables: StructureTable[]; links: StructureLink[] }
const identity = (entry: { id: string; sharedCardId?: string }, vaultId: string) => entry.sharedCardId ? `shared:${entry.sharedCardId}` : cardKey(vaultId, entry.id)
export const structureCategoryId = (vaultId: string, id: string) => `category:${categoryFilterId(vaultId, id)}`
const folderId = (vaultId: string, id: string) => `folder:${categoryFilterId(vaultId, id)}`
const vaultId = (id: string) => `vault:${id}`
const cardCount = (count: number) => `${count} ${count % 100 >= 11 && count % 100 <= 14 ? 'карточек' : count % 10 === 1 ? 'карточка' : count % 10 >= 2 && count % 10 <= 4 ? 'карточки' : 'карточек'}`

/** Build only from already-authorized sources; labels never imply membership. */
export function buildStructureDiagram(sources: VaultSource[], view: StructureView): StructureDiagram {
  const entries = sourceEntries(sources), categories = sourceCategories(sources), folders = sourceCategoryFolders(sources)
  const canonical = new Map(entries.map(entry => [identity(entry, entry.vaultId), entry]))
  const tables: StructureTable[] = [], links = new Map<string, StructureLink>()
  const occurrences = new Map<string, { table: string; row: string }[]>()
  const addOccurrence = (id: string, table: string, row: string) => {
    const list = occurrences.get(id) ?? []
    if (!list.some(item => item.table === table && item.row === row)) list.push({ table, row })
    occurrences.set(id, list)
  }
  function addLink(a: { table: string; row: string }, b: { table: string; row: string }, kind: StructureLink['kind'], reason: string) {
    if (a.table === b.table) return
    const ends = [a, b].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    const source = ends[0]!, target = ends[1]!, id = JSON.stringify(ends)
    const existing = links.get(id)
    if (existing) { if (!existing.reasons.includes(reason)) existing.reasons.push(reason); existing.count++; return }
    links.set(id, { id, source: source.table, sourceRow: source.row, target: target.table, targetRow: target.row, kind, reasons: [reason], count: 1 })
  }
  function cardRow(entry: VaultSource['data']['entries'][number], sourceId: string): StructureRow {
    const id = identity(entry, sourceId), card = canonical.get(id)!
    return { id: `card:${id}`, label: entry.title, meta: entry.sharedCardId ? 'Общая карточка' : 'Карточка', kind: 'card', entryKey: cardKey(card.vaultId, card.id) }
  }
  if (view === 'categories') {
    for (const category of categories) {
      const source = sources.find(source => source.id === category.vaultId)!, id = structureCategoryId(category.vaultId, category.id)
      const rows = source.data.entries.filter(entry => entryCategoryIds(entry).includes(category.id)).map(entry => cardRow(entry, source.id))
      tables.push({ id, kind: 'category', label: category.name, subtitle: category.vaultName, vaultId: category.vaultId, categoryKey: category.filterId, rows: [...new Map(rows.map(row => [row.id, row])).values()] })
      for (const entry of source.data.entries.filter(entry => entryCategoryIds(entry).includes(category.id))) addOccurrence(identity(entry, source.id), id, `card:${identity(entry, source.id)}`)
    }
    for (const source of sources) {
      const categoryIds = new Set(source.data.categories.map(category => category.id))
      const unclassified = source.data.entries.filter(entry => !entryCategoryIds(entry).some(id => categoryIds.has(id)))
      if (!unclassified.length) continue
      const id = `uncategorized:${source.id}`, rows = unclassified.map(entry => cardRow(entry, source.id))
      tables.push({ id, kind: 'category', label: 'Без категории', subtitle: source.name, vaultId: source.id, rows: [...new Map(rows.map(row => [row.id, row])).values()] })
      for (const entry of unclassified) addOccurrence(identity(entry, source.id), id, `card:${identity(entry, source.id)}`)
    }
    for (const folder of folders) {
      const id = folderId(folder.vaultId, folder.id), members = categories.filter(category => categoryInFolder(category, folder))
      const rows = members.map(category => ({ id: `category:${category.filterId}`, label: category.name, meta: category.vaultName, kind: 'category' as const, categoryKey: category.filterId }))
      tables.push({ id, kind: 'folder', label: folder.name, subtitle: folder.vaultName, vaultId: folder.vaultId, rows })
      for (const category of members) addLink({ table: id, row: `category:${category.filterId}` }, { table: structureCategoryId(category.vaultId, category.id), row: '@header' }, 'folder', `Категория «${category.name}» входит в папку «${folder.name}»`)
    }
  } else {
    for (const source of sources) {
      const id = vaultId(source.id), rows: StructureRow[] = [
        ...source.data.categories.map(category => ({ id: `category:${category.id}`, label: category.name, meta: cardCount(source.data.entries.filter(entry => entryCategoryIds(entry).includes(category.id)).length), kind: 'category' as const, categoryKey: categoryFilterId(source.id, category.id) })),
        ...(source.data.categoryFolders ?? []).map(folder => ({ id: `folder:${folder.id}`, label: folder.name, meta: 'Папка категорий', kind: 'folder' as const })),
        ...source.data.entries.map(entry => cardRow(entry, source.id))
      ]
      tables.push({ id, kind: 'vault', label: source.name, subtitle: source.id === 'personal' ? 'Личное хранилище' : 'Общее хранилище', vaultId: source.id, rows: [...new Map(rows.map(row => [row.id, row])).values()] })
      for (const entry of source.data.entries) addOccurrence(identity(entry, source.id), id, `card:${identity(entry, source.id)}`)
    }
    for (const folder of folders) for (const category of categories.filter(category => category.vaultId !== folder.vaultId && categoryInFolder(category, folder))) {
      addLink({ table: vaultId(folder.vaultId), row: `folder:${folder.id}` }, { table: vaultId(category.vaultId), row: `category:${category.id}` }, 'folder', `Папка «${folder.name}» ссылается на категорию «${category.name}»`)
    }
  }
  for (const [id, places] of occurrences) for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++) {
    addLink(places[i]!, places[j]!, 'shared', `Общая карточка: ${canonical.get(id)!.title}`)
  }
  const entryIdentities = new Map(entries.map(entry => [cardKey(entry.vaultId, entry.id), identity(entry, entry.vaultId)]))
  for (const edge of buildRelationships(entries, 'manual').edges) {
    for (const source of occurrences.get(entryIdentities.get(edge.source)!) ?? []) for (const target of occurrences.get(entryIdentities.get(edge.target)!) ?? []) addLink(source, target, 'manual', edge.label)
  }
  return { tables, links: [...links.values()] }
}

export function filterStructureDiagram(diagram: StructureDiagram, query: string, linkedOnly: boolean, focusId = ''): StructureDiagram {
  const search = query.trim().toLocaleLowerCase('ru-RU')
  const seeds = new Set(focusId ? [focusId] : diagram.tables.filter(table => !search || [table.label, table.subtitle, ...table.rows.map(row => `${row.label} ${row.meta}`)].some(value => value.toLocaleLowerCase('ru-RU').includes(search))).map(table => table.id))
  const visible = new Set(seeds)
  if (search || focusId) for (const link of diagram.links) { if (seeds.has(link.source)) visible.add(link.target); if (seeds.has(link.target)) visible.add(link.source) }
  const connected = new Set(diagram.links.flatMap(link => [link.source, link.target]))
  const tables = diagram.tables.filter(table => visible.has(table.id) && (!linkedOnly || !!focusId || connected.has(table.id)))
  const ids = new Set(tables.map(table => table.id))
  return { tables, links: diagram.links.filter(link => ids.has(link.source) && ids.has(link.target)) }
}
