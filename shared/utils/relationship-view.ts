import type { RelationEdge, RelationNode } from './relationships'

export interface RelationshipGraphData { nodes: RelationNode[]; edges: RelationEdge[] }
export interface RelationBundle {
  id: string
  source: string
  target: string
  kind: RelationEdge['kind']
  edges: RelationEdge[]
  labels: string[]
}

/** Multiple subscriptions/fields between the same two nodes share one line. */
export function bundleRelationships(edges: RelationEdge[]): RelationBundle[] {
  const bundles = new Map<string, RelationBundle>()
  for (const edge of edges) {
    const id = JSON.stringify([edge.source, edge.target].sort())
    let bundle = bundles.get(id)
    if (!bundle) {
      bundle = { id, source: edge.source, target: edge.target, kind: edge.kind, edges: [], labels: [] }
      bundles.set(id, bundle)
    }
    bundle.edges.push(edge)
    if (!bundle.labels.includes(edge.label)) bundle.labels.push(edge.label)
  }
  return [...bundles.values()]
}

/** Include a shared-value hub's members, without expanding unrelated manual links. */
export function relationshipNeighborhood(graph: RelationshipGraphData, roots: Iterable<string>): Set<string> {
  const ids = new Set(roots), nodes = new Map(graph.nodes.map(node => [node.id, node]))
  const adjacent = new Map<string, Set<string>>()
  for (const edge of graph.edges) {
    if (!adjacent.has(edge.source)) adjacent.set(edge.source, new Set())
    if (!adjacent.has(edge.target)) adjacent.set(edge.target, new Set())
    adjacent.get(edge.source)!.add(edge.target)
    adjacent.get(edge.target)!.add(edge.source)
  }
  const hubs = new Set<string>()
  for (const root of [...ids]) for (const other of adjacent.get(root) ?? []) {
    ids.add(other)
    if (nodes.get(other)?.kind !== 'card') hubs.add(other)
  }
  for (const hub of hubs) for (const member of adjacent.get(hub) ?? []) ids.add(member)
  return ids
}

export function relationshipSubgraph(graph: RelationshipGraphData, ids: Set<string>): RelationshipGraphData {
  return { nodes: graph.nodes.filter(node => ids.has(node.id)), edges: graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) }
}
