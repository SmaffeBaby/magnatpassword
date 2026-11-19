export interface SpaceLayerObject {
  id: string
  revision: number
  data: { kind: string; layerHidden?: boolean; from?: string; to?: string; parentId?: string; layerOrder?: number; x: number; y: number }
}

export interface SpaceLayerChange {
  id: string
  revision: number
  parentId?: string | null
  layerOrder?: number
  layerHidden?: boolean
  x?: number
  y?: number
}

export function spaceLayers<T extends SpaceLayerObject>(objects: readonly T[]) {
  const byId = new Map(objects.map(item => [item.id, item]))
  const parents = new Map<string, string | null>()
  for (const item of objects) {
    const parentId = item.data.parentId
    if (!parentId || byId.get(parentId)?.data.kind !== 'frame') {
      parents.set(item.id, null)
      continue
    }
    const seen = new Set([item.id])
    let ancestor: string | undefined = parentId
    while (ancestor && !seen.has(ancestor)) {
      seen.add(ancestor)
      ancestor = byId.get(ancestor)?.data.parentId
    }
    parents.set(item.id, ancestor ? null : parentId)
  }
  const buckets = new Map<string | null, T[]>()
  const legacyOrder: Record<string, number> = { frame: -2, link: -1, stroke: 1, comment: 2 }
  for (const item of objects) {
    const parent = parents.get(item.id) ?? null
    if (!buckets.has(parent)) buckets.set(parent, [])
    buckets.get(parent)!.push(item)
  }
  for (const group of buckets.values()) {
    group.reverse().sort((a, b) => (b.data.layerOrder ?? legacyOrder[b.data.kind] ?? 0) - (a.data.layerOrder ?? legacyOrder[a.data.kind] ?? 0))
  }
  const children = (parent: string | null) => buckets.get(parent) ?? []
  const rows: { item: T; depth: number; parent: string | null }[] = []
  const paint: T[] = []
  function walk(parent: string | null, depth: number) {
    for (const item of children(parent)) {
      rows.push({ item, depth, parent })
      walk(item.id, depth + 1)
      paint.push(item)
    }
  }
  walk(null, 0)
  return { rows, z: new Map(paint.reverse().map((item, index) => [item.id, index + 1])), children, parents, byId }
}

export type SpaceLayerPosition = 'before' | 'after' | 'inside' | 'root'

export function spaceHiddenLayers(layers: LayerTree) {
  const hidden = new Set<string>()
  const linksByEndpoint = new Map<string, string[]>()
  for (const { item, parent } of layers.rows) {
    if (item.data.layerHidden || (parent && hidden.has(parent))) hidden.add(item.id)
    if (item.data.kind !== 'link') continue
    for (const endpoint of [item.data.from, item.data.to]) {
      if (!endpoint) continue
      const links = linksByEndpoint.get(endpoint) ?? []
      links.push(item.id)
      linksByEndpoint.set(endpoint, links)
    }
  }
  for (const id of hidden) {
    for (const link of linksByEndpoint.get(id) ?? []) hidden.add(link)
  }
  return hidden
}

export function topSpaceLayers(layers: LayerTree, selected: ReadonlySet<string>) {
  return layers.rows.filter(({ item }) => {
    if (!selected.has(item.id)) return false
    for (let parent = layers.parents.get(item.id); parent; parent = layers.parents.get(parent)) {
      if (selected.has(parent)) return false
    }
    return true
  }).map(({ item }) => item.id)
}

export function moveSpaceLayers(layers: LayerTree, ids: readonly string[], target: string | null, position: SpaceLayerPosition) {
  const selected = new Set(ids)
  if (!selected.size || (target && !layers.byId.has(target))) return
  for (let ancestor = target; ancestor; ancestor = layers.parents.get(ancestor) ?? null) {
    if (selected.has(ancestor)) return
  }
  const parentId = position === 'inside' ? target : target ? layers.parents.get(target) ?? null : null
  if (position === 'inside' && (!parentId || layers.byId.get(parentId)?.data.kind !== 'frame')) return

  const moved = topSpaceLayers(layers, selected)
  if (!moved.length) return
  const order = layers.children(parentId).map(({ id }) => id).filter(id => !selected.has(id))
  const targetIndex = target ? order.indexOf(target) : -1
  const index = targetIndex < 0 ? 0 : targetIndex + Number(position === 'after')
  order.splice(index, 0, ...moved)
  return { moved, parentId, changes: layerRanks(layers, order, parentId) }
}

export function moveSpaceLayer(layers: LayerTree, id: string, target: string | null, position: SpaceLayerPosition) {
  return moveSpaceLayers(layers, [id], target, position)?.changes ?? []
}

export function spaceSearchText(value: string) {
  return value.normalize('NFC').toLocaleLowerCase('ru').replaceAll('ё', 'е').trim()
}

type LayerTree = ReturnType<typeof spaceLayers>

function layerRanks(layers: LayerTree, ids: string[], parentId: string | null) {
  return ids.flatMap((id, index): SpaceLayerChange[] => {
    const item = layers.byId.get(id)
    const layerOrder = ids.length - index
    return !item || (item.data.layerOrder === layerOrder && (item.data.parentId ?? null) === parentId)
      ? [] : [{ id, revision: item.revision, parentId, layerOrder }]
  })
}

export function groupSpaceLayers(layers: LayerTree, selected: ReadonlySet<string>, groupId: string) {
  const ancestors = (id: string) => {
    const chain: (string | null)[] = []
    for (let parent = layers.parents.get(id) ?? null; parent; parent = layers.parents.get(parent) ?? null) chain.push(parent)
    return [...chain, null]
  }
  const roots = topSpaceLayers(layers, selected)
  if (roots.length < 2) return
  const [first, ...rest] = roots
  const parentId = ancestors(first!).find(parent => rest.every(id => ancestors(id).includes(parent))) ?? null
  const firstBranch = [first!, ...ancestors(first!)].find(id => id && layers.parents.get(id) === parentId)
  const selectedRoots = new Set(roots)
  const order = layers.children(parentId).flatMap(({ id }) => [
    ...(id === firstBranch ? [groupId] : []), ...(selectedRoots.has(id) ? [] : [id])
  ])
  return {
    parentId, order: order.length - order.indexOf(groupId), members: [...selectedRoots],
    changes: [...layerRanks(layers, order, parentId), ...layerRanks(layers, [...selectedRoots], groupId)]
  }
}

export function ungroupSpaceLayers(layers: LayerTree, groups: ReadonlySet<string>) {
  const flatten = (id: string): string[] => groups.has(id)
    ? layers.children(id).flatMap(child => flatten(child.id)) : [id]
  const changes: SpaceLayerChange[] = []
  const members = new Set<string>()
  const parents = new Set<string | null>()
  for (const group of groups) {
    const parent = layers.parents.get(group) ?? null
    if (!parent || !groups.has(parent)) parents.add(parent)
    for (const id of layers.children(group).flatMap(child => flatten(child.id))) members.add(id)
  }
  for (const parent of parents) {
    changes.push(...layerRanks(layers, layers.children(parent).flatMap(item => flatten(item.id)), parent))
  }
  return { changes, members: [...members] }
}
