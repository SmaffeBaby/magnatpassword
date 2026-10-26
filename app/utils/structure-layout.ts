import type { StructureDiagram, StructureTable, StructureLink } from '~~/shared/utils/structure-relationships'
export const STRUCTURE_WIDTH = 300
export const STRUCTURE_HEADER = 68
export const STRUCTURE_ROW = 34
export interface PositionedStructureTable extends StructureTable { x: number; y: number; height: number }
export function layoutStructureTables(tables: StructureTable[]): PositionedStructureTable[] {
  const columns = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(tables.length))))
  const heights = Array.from({ length: columns }, () => 80)
  const sorted = [...tables].sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || b.rows.length - a.rows.length || a.label.localeCompare(b.label, 'ru'))
  return sorted.map(table => {
    const column = heights.indexOf(Math.min(...heights)), height = STRUCTURE_HEADER + Math.max(1, table.rows.length) * STRUCTURE_ROW + 8
    const value = { ...table, x: 80 + column * (STRUCTURE_WIDTH + 180), y: heights[column]!, height }
    heights[column]! += height + 74
    return value
  })
}
export function structurePortY(table: PositionedStructureTable, row: string): number {
  if (row === '@header') return table.y + 30
  const index = table.rows.findIndex(item => item.id === row)
  return table.y + STRUCTURE_HEADER + Math.max(0, index) * STRUCTURE_ROW + STRUCTURE_ROW / 2
}
function roundedPath(points: [number, number][]): string {
  let result = `M${points[0]![0]},${points[0]![1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1]!, point = points[i]!, after = points[i + 1]!
    const incoming = Math.hypot(point[0] - before[0], point[1] - before[1]), outgoing = Math.hypot(after[0] - point[0], after[1] - point[1])
    if (!incoming || !outgoing) continue
    const radius = Math.min(9, incoming / 2, outgoing / 2)
    const ax = point[0] - (point[0] - before[0]) / incoming * radius, ay = point[1] - (point[1] - before[1]) / incoming * radius
    const bx = point[0] + (after[0] - point[0]) / outgoing * radius, by = point[1] + (after[1] - point[1]) / outgoing * radius
    result += `L${ax},${ay}Q${point[0]},${point[1]} ${bx},${by}`
  }
  const last = points.at(-1)!
  return `${result}L${last[0]},${last[1]}`
}
export function structureLinkPath(link: StructureLink, tables: Map<string, PositionedStructureTable>, index = 0): string {
  let a = tables.get(link.source)!, b = tables.get(link.target)!, ar = link.sourceRow, br = link.targetRow
  if (a.x > b.x) { [a, b] = [b, a]; [ar, br] = [br, ar] }
  const ay = structurePortY(a, ar), by = structurePortY(b, br), lane = index % 6
  if (Math.abs(a.x - b.x) < 40) {
    const right = Math.max(a.x, b.x) + STRUCTURE_WIDTH, corridor = right + 30 + lane * 12
    return roundedPath([[a.x + STRUCTURE_WIDTH, ay], [corridor, ay], [corridor, by], [b.x + STRUCTURE_WIDTH, by]])
  }
  const ax = a.x + STRUCTURE_WIDTH, bx = b.x
  if (bx - ax < 300) {
    const corridor = (ax + bx) / 2 + (lane - 2.5) * 12
    return roundedPath([[ax, ay], [corridor, ay], [corridor, by], [bx, by]])
  }
  const top = Math.min(a.y, b.y, ...[...tables.values()].map(table => table.y)) - 22 - lane * 7
  return roundedPath([[ax, ay], [ax + 24, ay], [ax + 24, top], [bx - 24, top], [bx - 24, by], [bx, by]])
}
export function structureNeighbours(diagram: StructureDiagram, id: string, row = ''): Set<string> {
  const result = new Set([id])
  for (const link of diagram.links) if ((link.source === id && (!row || link.sourceRow === row)) || (link.target === id && (!row || link.targetRow === row))) { result.add(link.source); result.add(link.target) }
  return result
}
