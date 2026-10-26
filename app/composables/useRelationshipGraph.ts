import { select, drag, zoom, zoomIdentity, zoomTransform } from 'd3'
import { buildRelationships, cardKey } from '~~/shared/utils/relationships'
import { bundleRelationships, relationshipNeighborhood, relationshipSubgraph, type RelationBundle } from '~~/shared/utils/relationship-view'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
import { layoutRelationships, relationNodeSize, type PositionedRelationNode } from '~/utils/relationship-layout'

type DrawnBundle = Omit<RelationBundle, 'source' | 'target'> & { source: PositionedRelationNode; target: PositionedRelationNode }
const kindLabels = { card: 'Карточка', title: 'Общее название', site: 'Общий сайт', field: 'Общее поле' }
const shorten = (value: string, length: number) => Array.from(value).length > length ? Array.from(value).slice(0, length - 1).join('') + '…' : value

export function useRelationshipGraph(props: { entries: ScopedCredential[] }, openEntry: (entry: ScopedCredential) => void) {
  const canvas = useTemplateRef<SVGSVGElement>('relationship-canvas'), container = useTemplateRef<HTMLElement>('relationship-container')
  const { mode, query, linkedOnly } = toRefs(useFiltersStore().relationships)
  const selectedId = ref(''), focusOnly = ref(false), zoomPercent = ref(100)
  const modes = [{ label: 'Все связи', value: 'all' }, { label: 'По названиям', value: 'title' }, { label: 'По сайтам', value: 'site' }, { label: 'По дополнительным полям', value: 'field' }, { label: 'Подписки и ручные связи', value: 'manual' }]
  const search = computed(() => query.value.trim().toLocaleLowerCase('ru-RU'))
  const matching = computed(() => props.entries.filter(entry => [entry.title, entry.url, ...(entry.vaultNames ?? [entry.vaultName]), ...(entry.customFields ?? []).filter(field => field.type !== 'secret').map(field => `${field.label} ${field.value}`)].some(value => value.toLocaleLowerCase('ru-RU').includes(search.value))))
  const graphEntries = computed(() => {
    if (!search.value) return props.entries.slice(0, 300)
    const matches = new Set(matching.value)
    return [...matching.value, ...props.entries.filter(entry => !matches.has(entry))].slice(0, 300)
  })
  const fullGraph = computed(() => buildRelationships(graphEntries.value, mode.value))
  const fullBundles = computed(() => bundleRelationships(fullGraph.value.edges))
  const matchIds = computed(() => new Set([
    ...matching.value.map(entry => cardKey(entry.vaultId, entry.id)),
    ...fullGraph.value.nodes.filter(node => node.kind !== 'card' && node.label.toLocaleLowerCase('ru-RU').includes(search.value)).map(node => node.id)
  ]))
  const graph = computed(() => {
    if (focusOnly.value && selectedId.value) return relationshipSubgraph(fullGraph.value, relationshipNeighborhood(fullGraph.value, [selectedId.value]))
    if (search.value) return relationshipSubgraph(fullGraph.value, relationshipNeighborhood(fullGraph.value, matchIds.value))
    if (linkedOnly.value) return relationshipSubgraph(fullGraph.value, new Set([...fullGraph.value.edges.flatMap(edge => [edge.source, edge.target]), selectedId.value]))
    return fullGraph.value
  })
  const selected = computed(() => fullGraph.value.nodes.find(node => node.id === selectedId.value))
  const selectedEntry = computed(() => props.entries.find(entry => cardKey(entry.vaultId, entry.id) === selectedId.value))
  const nodeMap = computed(() => new Map(fullGraph.value.nodes.map(node => [node.id, node])))
  const connected = computed(() => fullBundles.value.filter(edge => edge.source === selectedId.value || edge.target === selectedId.value).map(edge => ({ ...edge, other: nodeMap.value.get(edge.source === selectedId.value ? edge.target : edge.source)! })).sort((a, b) => Number(b.other.kind === 'card') - Number(a.other.kind === 'card') || a.other.label.localeCompare(b.other.label, 'ru')))
  const cards = computed(() => graph.value.nodes.filter(node => node.kind === 'card'))
  const allCards = computed(() => fullGraph.value.nodes.filter(node => node.kind === 'card'))
  const degrees = computed(() => {
    const result = new Map<string, number>()
    for (const edge of fullBundles.value) for (const id of [edge.source, edge.target]) result.set(id, (result.get(id) ?? 0) + 1)
    return result
  })
  const isolated = computed(() => allCards.value.filter(node => !degrees.value.has(node.id)).length)
  const cardList = computed(() => allCards.value.filter(node => !search.value || matchIds.value.has(node.id)).sort((a, b) => (degrees.value.get(b.id) ?? 0) - (degrees.value.get(a.id) ?? 0) || a.label.localeCompare(b.label, 'ru')))
  const bundles = computed(() => bundleRelationships(graph.value.edges))
  let view: ReturnType<typeof zoom<SVGSVGElement, unknown>> | undefined, observer: ResizeObserver | undefined
  let drawnNodes: PositionedRelationNode[] = [], drawnEdges: DrawnBundle[] = [], width = 0, height = 0, layoutKey = '', hovered = '', fitFrame = 0
  let paint = () => {}, highlight = () => {}

  function openSelected() { if (selectedEntry.value) openEntry(selectedEntry.value) }
  function clearSelection() { focusOnly.value = false; selectedId.value = '' }
  function focusSelected() { if (selected.value) focusOnly.value = !focusOnly.value }
  function choose(id: string) { selectedId.value = id }
  function fit() {
    if (!canvas.value || !view || !drawnNodes.length) return
    const left = Math.min(...drawnNodes.map(node => node.x - relationNodeSize(node).width / 2)), top = Math.min(...drawnNodes.map(node => node.y - relationNodeSize(node).height / 2))
    const right = Math.max(...drawnNodes.map(node => node.x + relationNodeSize(node).width / 2)), bottom = Math.max(...drawnNodes.map(node => node.y + relationNodeSize(node).height / 2))
    const scale = Math.max(.08, Math.min(1.15, (width - 72) / Math.max(1, right - left), (height - 120) / Math.max(1, bottom - top)))
    const transform = zoomIdentity.translate(width / 2 - scale * (left + right) / 2, (height - 40) / 2 - scale * (top + bottom) / 2).scale(scale)
    select(canvas.value).call(view.transform, transform)
  }
  function changeZoom(factor: number) { if (canvas.value && view) select(canvas.value).call(view.scaleBy, factor) }
  function bringIntoView(id: string) {
    if (!canvas.value || !view) return
    const node = drawnNodes.find(node => node.id === id)
    if (!node) return
    const scale = Math.max(.85, zoomTransform(canvas.value).k)
    select(canvas.value).call(view.transform, zoomIdentity.translate(width / 2 - node.x * scale, height / 2 - node.y * scale).scale(scale))
  }
  function render() {
    if (!canvas.value || !container.value) return
    width = Math.max(280, container.value.clientWidth); height = Math.max(320, canvas.value.clientHeight || 650)
    const svg = select(canvas.value).attr('viewBox', `0 0 ${width} ${height}`)
    const key = JSON.stringify(graph.value)
    if (key !== layoutKey) { drawnNodes = layoutRelationships(graph.value.nodes, bundles.value, width / height); layoutKey = key }
    const lookup = new Map(drawnNodes.map(node => [node.id, node]))
    drawnEdges = bundles.value.map(edge => ({ ...edge, source: lookup.get(edge.source)!, target: lookup.get(edge.target)! }))
    svg.selectAll('*').remove(); hovered = ''
    const layer = svg.append('g')
    view = zoom<SVGSVGElement, unknown>().scaleExtent([.08, 3]).filter(event => {
      // Scrolling the page remains natural; explicit controls or Ctrl/⌘ + wheel zoom.
      return !event.button && (event.type !== 'wheel' || event.ctrlKey || event.metaKey)
    }).on('zoom', event => { layer.attr('transform', event.transform.toString()); zoomPercent.value = Math.round(event.transform.k * 100) })
    svg.call(view).on('dblclick.zoom', null).on('click.clear', event => { if (event.target === canvas.value) clearSelection() })
    const paths = layer.append('g').attr('class', 'relation-lines').selectAll('path').data(drawnEdges).join('path').attr('class', edge => `relation-edge ${edge.kind}`)
    paths.append('title').text(edge => edge.labels.join('\n'))
    const counts = layer.append('g').selectAll('g').data(drawnEdges.filter(edge => edge.edges.length > 1)).join('g').attr('class', 'relation-bundle-count')
    counts.append('rect').attr('x', -12).attr('y', -10).attr('width', 24).attr('height', 20).attr('rx', 10)
    counts.append('text').attr('text-anchor', 'middle').attr('dy', 4).text(edge => edge.edges.length)
    const nodes = layer.append('g').selectAll<SVGGElement, PositionedRelationNode>('g').data(drawnNodes).join('g').attr('class', node => `relation-node ${node.kind}`).attr('role', 'button').attr('tabindex', 0).attr('aria-label', node => `${node.label}, ${node.vaultName ?? kindLabels[node.kind]}`).attr('aria-pressed', node => node.id === selectedId.value ? 'true' : 'false')
    nodes.append('rect').attr('class', 'relation-node-body').attr('x', node => -relationNodeSize(node).width / 2).attr('y', node => -relationNodeSize(node).height / 2).attr('width', node => relationNodeSize(node).width).attr('height', node => relationNodeSize(node).height).attr('rx', 12)
    nodes.append('rect').attr('class', 'relation-node-symbol-bg').attr('x', node => -relationNodeSize(node).width / 2 + 12).attr('y', -16).attr('width', 32).attr('height', 32).attr('rx', 9)
    nodes.append('text').attr('class', 'relation-node-symbol').attr('x', node => -relationNodeSize(node).width / 2 + 28).attr('text-anchor', 'middle').attr('dy', 5).text(node => node.kind === 'card' ? Array.from(node.label)[0]?.toUpperCase() ?? '' : node.kind === 'site' ? '↗' : node.kind === 'field' ? '=' : '#')
    nodes.append('text').attr('class', 'relation-node-name').attr('x', node => -relationNodeSize(node).width / 2 + 54).attr('y', -4).text(node => shorten(node.label, node.kind === 'card' ? 19 : 16))
    nodes.append('text').attr('class', 'relation-node-meta').attr('x', node => -relationNodeSize(node).width / 2 + 54).attr('y', 14).text(node => shorten(node.vaultName ?? kindLabels[node.kind], 23))
    nodes.selectAll<SVGTextElement, PositionedRelationNode>('.relation-node-name, .relation-node-meta').each(function (node) {
      const maximum = relationNodeSize(node).width - 68
      const letters = Array.from(this.textContent ?? '')
      while (this.getComputedTextLength() > maximum && letters.length > 1) { letters.pop(); this.textContent = letters.join('') + '…' }
    })
    nodes.append('title').text(node => `${node.label}\n${node.vaultName ?? kindLabels[node.kind]}\nСвязанных узлов: ${degrees.value.get(node.id) ?? 0}`)
    nodes.on('click', (event, node) => { event.stopPropagation(); choose(node.id) })
      .on('keydown', (event, node) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(node.id) } if (event.key === 'Escape') clearSelection() })
      .on('mouseenter', (_event, node) => { hovered = node.id; highlight() })
      .on('focus', (event, node) => { hovered = node.id; highlight(); if ((event.currentTarget as Element).matches(':focus-visible')) bringIntoView(node.id) })
      .on('mouseleave blur', () => { hovered = ''; highlight() })
    highlight = () => {
      const active = hovered || selectedId.value
      const neighbours = new Set([active])
      for (const edge of drawnEdges) if (edge.source.id === active || edge.target.id === active) { neighbours.add(edge.source.id); neighbours.add(edge.target.id) }
      nodes.classed('is-selected', node => node.id === selectedId.value).classed('is-muted', node => !!active && !neighbours.has(node.id)).classed('is-match', node => !!search.value && matchIds.value.has(node.id)).attr('aria-pressed', node => node.id === selectedId.value ? 'true' : 'false')
      paths.classed('is-active', edge => !!active && (edge.source.id === active || edge.target.id === active)).classed('is-muted', edge => !!active && edge.source.id !== active && edge.target.id !== active)
      counts.classed('is-muted', edge => !!active && edge.source.id !== active && edge.target.id !== active)
    }
    const endpoint = (a: PositionedRelationNode, b: PositionedRelationNode) => {
      const size = relationNodeSize(a), dx = b.x - a.x, dy = b.y - a.y
      const scale = Math.min((size.width / 2 + 2) / Math.max(.001, Math.abs(dx)), (size.height / 2 + 2) / Math.max(.001, Math.abs(dy)))
      return { x: a.x + dx * scale, y: a.y + dy * scale }
    }
    paint = () => {
      const curve = (edge: DrawnBundle) => {
        const a = endpoint(edge.source, edge.target), b = endpoint(edge.target, edge.source)
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1
        const bend = Math.min(45, length * .14)
        return { a, b, x: (a.x + b.x) / 2 - dy / length * bend, y: (a.y + b.y) / 2 + dx / length * bend }
      }
      paths.attr('d', edge => { const p = curve(edge); return `M${p.a.x},${p.a.y}Q${p.x},${p.y} ${p.b.x},${p.b.y}` })
      counts.attr('transform', edge => { const p = curve(edge); return `translate(${(p.a.x + 2 * p.x + p.b.x) / 4},${(p.a.y + 2 * p.y + p.b.y) / 4})` })
      nodes.attr('transform', node => `translate(${node.x},${node.y})`)
    }
    nodes.call(drag<SVGGElement, PositionedRelationNode>().on('start', event => event.sourceEvent.stopPropagation()).on('drag', (event, node) => { node.x = event.x; node.y = event.y; paint() }))
    paint(); highlight(); fit()
  }
  function selectFromList(id: string) { choose(id); nextTick(() => bringIntoView(id)) }
  watch(() => JSON.stringify(graph.value), () => nextTick(render))
  watch(selectedId, () => highlight())
  watch([query, mode], () => { clearSelection() })
  watch(fullGraph, value => { if (!value.nodes.some(node => node.id === selectedId.value)) clearSelection() })
  onMounted(() => {
    observer = new ResizeObserver(() => {
      cancelAnimationFrame(fitFrame)
      fitFrame = requestAnimationFrame(() => {
        if (!container.value || !canvas.value) return
        const nextWidth = Math.max(280, container.value.clientWidth), nextHeight = Math.max(320, canvas.value.clientHeight)
        if (nextWidth !== width || nextHeight !== height) { width = nextWidth; height = nextHeight; select(canvas.value).attr('viewBox', `0 0 ${width} ${height}`); fit() }
      })
    })
    if (container.value) observer.observe(container.value)
    render()
  })
  onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(fitFrame); if (canvas.value) select(canvas.value).on('.zoom', null).on('.clear', null).selectAll('*').remove(); drawnNodes = []; drawnEdges = [] })
  return { mode, query, linkedOnly, modes, graph, matching, selectedId, selected, selectedEntry, connected, cards, allCards, cardList, isolated, degrees, focusOnly, zoomPercent, bundles, kindLabels, limited: computed(() => props.entries.length > 300), openSelected, clearSelection, focusSelected, selectFromList, reset: fit, changeZoom }
}
