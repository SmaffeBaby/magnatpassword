import { forceSimulation, forceLink, forceManyBody, forceX, forceY, type SimulationNodeDatum } from 'd3'
import type { RelationNode } from '~~/shared/utils/relationships'
import type { RelationBundle } from '~~/shared/utils/relationship-view'

export interface PositionedRelationNode extends RelationNode, SimulationNodeDatum { x: number; y: number }
export const relationNodeSize = (node: RelationNode) => ({ width: node.kind === 'card' ? 212 : 190, height: node.kind === 'card' ? 62 : 54 })

// Rectangular collision keeps both the card and its text clear of other cards.
export function separateRelationNodes(nodes: PositionedRelationNode[], padding = 24) {
  for (let step = 0; step < 160; step++) {
    let changed = false
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!, b = nodes[j]!, sa = relationNodeSize(a), sb = relationNodeSize(b)
      const dx = b.x - a.x, dy = b.y - a.y
      const overlapX = (sa.width + sb.width) / 2 + padding - Math.abs(dx)
      const overlapY = (sa.height + sb.height) / 2 + padding - Math.abs(dy)
      if (overlapX <= 0 || overlapY <= 0) continue
      changed = true
      if (overlapX < overlapY) { const shift = Math.sign(dx || 1) * (overlapX / 2 + .1); a.x -= shift; b.x += shift }
      else { const shift = Math.sign(dy || 1) * (overlapY / 2 + .1); a.y -= shift; b.y += shift }
    }
    if (!changed) break
  }
}

export function layoutRelationships(input: RelationNode[], bundles: RelationBundle[], aspect = 1.5): PositionedRelationNode[] {
  const nodes: PositionedRelationNode[] = input.map(node => ({ ...node, x: 0, y: 0 }))
  if (!nodes.length) return nodes
  const adjacency = new Map(nodes.map(node => [node.id, new Set<string>()]))
  for (const edge of bundles) { adjacency.get(edge.source)?.add(edge.target); adjacency.get(edge.target)?.add(edge.source) }
  const lookup = new Map(nodes.map(node => [node.id, node])), visited = new Set<string>(), components: PositionedRelationNode[][] = []
  for (const node of nodes) {
    if (visited.has(node.id)) continue
    const component: PositionedRelationNode[] = [], queue = [node.id]
    visited.add(node.id)
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]!
      component.push(lookup.get(id)!)
      for (const other of adjacency.get(id) ?? []) if (!visited.has(other)) { visited.add(other); queue.push(other) }
    }
    components.push(component)
  }
  components.sort((a, b) => b.length - a.length)
  const blocks = components.map(component => {
    const ids = new Set(component.map(node => node.id))
    const links = bundles.filter(edge => ids.has(edge.source) && ids.has(edge.target)).map(edge => ({ source: edge.source, target: edge.target }))
    // A settled, deterministic layout avoids cards moving while the user reads.
    component.forEach((node, index) => { const angle = index * 2.399963; const radius = 80 * Math.sqrt(index); node.x = Math.cos(angle) * radius; node.y = Math.sin(angle) * radius })
    const simulation = forceSimulation(component).stop()
      .force('link', forceLink<PositionedRelationNode, { source: string; target: string }>(links).id(node => node.id).distance(250).strength(.35))
      .force('charge', forceManyBody().strength(-1100))
      .force('x', forceX(0).strength(.045)).force('y', forceY(0).strength(.075))
    simulation.tick(180)
    // Snap the settled topology to roomy slots. A force-only map wastes space
    // around high-degree providers and makes every label tiny when fitted.
    const columns = Math.max(1, Math.ceil(Math.sqrt(component.length * 1.9 * 104 / 260)))
    const rows = Math.ceil(component.length / columns)
    const slots = Array.from({ length: rows * columns }, (_, index) => ({ x: (index % columns - (columns - 1) / 2) * 260, y: (Math.floor(index / columns) - (rows - 1) / 2) * 104 }))
    const minX = Math.min(...component.map(node => node.x)), maxX = Math.max(...component.map(node => node.x))
    const minY = Math.min(...component.map(node => node.y)), maxY = Math.max(...component.map(node => node.y))
    const targets = new Map(component.map(node => [node.id, { x: ((node.x - minX) / Math.max(1, maxX - minX) - .5) * (columns - 1) * 260, y: ((node.y - minY) / Math.max(1, maxY - minY) - .5) * (rows - 1) * 104 }]))
    const ranked = [...component].sort((a, b) => (adjacency.get(b.id)?.size ?? 0) - (adjacency.get(a.id)?.size ?? 0))
    for (const node of ranked) {
      const target = targets.get(node.id)!
      slots.sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))
      const slot = slots.shift()!
      node.x = slot.x; node.y = slot.y
    }
    separateRelationNodes(component)
    const left = Math.min(...component.map(node => node.x - relationNodeSize(node).width / 2))
    const top = Math.min(...component.map(node => node.y - relationNodeSize(node).height / 2))
    const width = Math.max(...component.map(node => node.x + relationNodeSize(node).width / 2)) - left
    const height = Math.max(...component.map(node => node.y + relationNodeSize(node).height / 2)) - top
    return { nodes: component, left, top, width, height }
  })
  const area = blocks.reduce((sum, block) => sum + (block.width + 80) * (block.height + 80), 0)
  const rowWidth = Math.max(...blocks.map(block => block.width), Math.sqrt(area * Math.max(.7, aspect)))
  let x = 0, y = 0, rowHeight = 0
  for (const block of blocks) {
    if (x && x + block.width > rowWidth) { x = 0; y += rowHeight + 80; rowHeight = 0 }
    for (const node of block.nodes) { node.x += x - block.left; node.y += y - block.top }
    x += block.width + 80; rowHeight = Math.max(rowHeight, block.height)
  }
  return nodes
}
