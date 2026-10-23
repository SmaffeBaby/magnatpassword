import { select, forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, drag, zoom, zoomIdentity, type Simulation, type SimulationNodeDatum, type SimulationLinkDatum } from 'd3'
import { buildRelationships, cardKey, type RelationshipMode, type RelationNode, type RelationEdge } from '~~/shared/utils/relationships'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
type Node = RelationNode & SimulationNodeDatum
type Edge = Omit<RelationEdge, 'source' | 'target'> & SimulationLinkDatum<Node> & { curve?: number }
export function useRelationshipGraph(props: { entries: ScopedCredential[] }, edit: (entry: ScopedCredential) => void) {
  const canvas = ref<SVGSVGElement | null>(null), container = ref<HTMLElement | null>(null)
  const { mode, query } = toRefs(useFiltersStore().relationships)
  const selectedId = ref('')
  const modes = [{ label: 'Все связи', value: 'all' }, { label: 'По названиям', value: 'title' }, { label: 'По сайтам', value: 'site' }, { label: 'По дополнительным полям', value: 'field' }, { label: 'Ручные связи', value: 'manual' }]
  const matching = computed(() => props.entries.filter(e => [e.title, e.url, e.vaultName, ...(e.customFields ?? []).filter(f => f.type !== 'secret').map(f => `${f.label} ${f.value}`)].some(v => v.toLowerCase().includes(query.value.trim().toLowerCase()))))
  const graph = computed(() => buildRelationships(matching.value.slice(0, 300), mode.value))
  const selected = computed(() => graph.value.nodes.find(n => n.id === selectedId.value))
  const selectedEntry = computed(() => props.entries.find(e => cardKey(e.vaultId, e.id) === selectedId.value))
  const connected = computed(() => graph.value.edges.filter(e => e.source === selectedId.value || e.target === selectedId.value).map(e => ({ ...e, other: graph.value.nodes.find(n => n.id === (e.source === selectedId.value ? e.target : e.source))! })))
  const cards = computed(() => graph.value.nodes.filter(n => n.kind === 'card'))
  let simulation: Simulation<Node, Edge> | undefined, observer: ResizeObserver | undefined
  let view: ReturnType<typeof zoom<SVGSVGElement, unknown>> | undefined
  let positions = new Map<string, { x?: number; y?: number }>()
  function openSelected() { if (selectedEntry.value) edit(selectedEntry.value) }
  function render() {
    if (!canvas.value || !container.value) return
    simulation?.stop()
    const width = Math.max(320, container.value.clientWidth), height = Math.max(320, canvas.value.clientHeight || 540)
    const svg = select(canvas.value).attr('viewBox', `0 0 ${width} ${height}`)
    svg.selectAll('*').remove()
    const layer = svg.append('g'), nodes: Node[] = graph.value.nodes.map(n => ({ ...n, ...positions.get(n.id) })), edges: Edge[] = graph.value.edges.map(e => ({ ...e }))
    const parallel = new Map<string, Edge[]>()
    for (const edge of edges.filter(e => e.kind === 'manual')) {
      const key = [String(edge.source), String(edge.target)].sort().join('|')
      if (!parallel.has(key)) parallel.set(key, [])
      parallel.get(key)!.push(edge)
    }
    for (const group of parallel.values()) group.forEach((edge, i) => { edge.curve = (i - (group.length - 1) / 2) * 45 * (String(edge.source) < String(edge.target) ? 1 : -1) })
    view = zoom<SVGSVGElement, unknown>().scaleExtent([0.15, 4]).on('zoom', event => layer.attr('transform', event.transform.toString()))
    svg.call(view).call(view.transform, zoomIdentity).on('dblclick.zoom', null)
    layer.append('g').selectAll('path').data(edges).join('path').attr('class', e => `relation-edge ${e.kind}`).append('title').text(e => e.label)
    const labels = layer.append('g').selectAll('text').data(edges.filter(e => e.kind === 'manual')).join('text').attr('class', 'relation-edge-label').attr('text-anchor', 'middle').text(e => e.label.length > 40 ? e.label.slice(0, 39) + '…' : e.label)
    const circles = layer.append('g').selectAll<SVGGElement, Node>('g').data(nodes).join('g').attr('class', n => `relation-node ${n.kind}`).attr('role', 'button').attr('tabindex', 0).attr('aria-label', n => `${n.label}${n.vaultName ? ', ' + n.vaultName : ''}`)
    circles.append('circle').attr('r', n => n.kind === 'card' ? 21 : 15)
    circles.append('text').attr('text-anchor', 'middle').attr('dy', 4).attr('class', 'relation-node-icon').text(n => n.kind === 'card' ? n.label.slice(0, 1).toUpperCase() : n.kind === 'site' ? '↗' : n.kind === 'field' ? '=' : '#')
    circles.append('text').attr('text-anchor', 'middle').attr('dy', 37).attr('class', 'relation-node-label').text(n => n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label)
    circles.append('title').text(n => n.label + (n.vaultName ? ' · ' + n.vaultName : ''))
    circles.on('click', (_event, n) => { selectedId.value = n.id }).on('keydown', (event, n) => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); selectedId.value = n.id } })
    simulation = forceSimulation(nodes).force('link', forceLink<Node, Edge>(edges).id(n => n.id).distance(125)).force('charge', forceManyBody().strength(-400)).force('center', forceCenter(width / 2, height / 2)).force('collision', forceCollide(55)).alphaDecay(0.045)
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const draw = () => {
      const point = (e: Edge) => {
        const a = e.source as Node, b = e.target as Node, ax = a.x ?? 0, ay = a.y ?? 0, bx = b.x ?? 0, by = b.y ?? 0
        const length = Math.hypot(bx - ax, by - ay) || 1, curve = e.curve || 0
        return { ax, ay, bx, by, mx: (ax + bx) / 2 - (by - ay) / length * curve, my: (ay + by) / 2 + (bx - ax) / length * curve }
      }
      layer.selectAll<SVGPathElement, Edge>('path').attr('d', e => { const p = point(e); return `M${p.ax},${p.ay}Q${p.mx},${p.my} ${p.bx},${p.by}` })
      labels.attr('x', e => { const p = point(e); return (p.ax + 2 * p.mx + p.bx) / 4 }).attr('y', e => { const p = point(e); return (p.ay + 2 * p.my + p.by) / 4 - 7 })
      circles.attr('transform', n => `translate(${n.x},${n.y})`).classed('is-selected', n => n.id === selectedId.value)
      positions = new Map(nodes.map(n => [n.id, { x: n.x, y: n.y }]))
    }
    circles.call(drag<SVGGElement, Node>().on('start', (event, n) => { if (!event.active && !reduced) simulation!.alphaTarget(0.15).restart(); n.fx = n.x; n.fy = n.y }).on('drag', (event, n) => { n.fx = event.x; n.fy = event.y; if (reduced) { n.x = event.x; n.y = event.y; draw() } }).on('end', (event, n) => { if (!event.active) simulation!.alphaTarget(0); n.fx = null; n.fy = null }))
    simulation.on('tick', draw)
    if (reduced) { simulation.stop().tick(180); draw() }
    else draw()
    if (!graph.value.nodes.some(n => n.id === selectedId.value)) selectedId.value = ''
  }
  function reset() { if (canvas.value && view) select(canvas.value).call(view.transform, zoomIdentity) }
  watch(() => JSON.stringify(graph.value), () => nextTick(render))
  watch(selectedId, () => { if (canvas.value) select(canvas.value).selectAll<SVGGElement, Node>('.relation-node').classed('is-selected', n => n.id === selectedId.value) })
  onMounted(() => { observer = new ResizeObserver(render); if (container.value) observer.observe(container.value); render() })
  onBeforeUnmount(() => { simulation?.stop(); observer?.disconnect(); positions.clear(); if (canvas.value) select(canvas.value).on('.zoom', null).selectAll('*').remove() })
  return { canvas, container, mode, query, modes, graph, matching, selectedId, selected, selectedEntry, connected, cards, openSelected, reset }
}
