import { select, drag, zoom, zoomIdentity, zoomTransform } from 'd3'
import type { VaultSource } from '~~/shared/types/sharing'
import { sourceEntries } from '~~/shared/utils/vault-sources'
import { cardKey } from '~~/shared/utils/relationships'
import { buildStructureDiagram, filterStructureDiagram, type StructureView, type StructureRow } from '~~/shared/utils/structure-relationships'
import { layoutStructureTables, structureLinkPath, structureNeighbours, STRUCTURE_WIDTH, STRUCTURE_HEADER, STRUCTURE_ROW, type PositionedStructureTable } from '~/utils/structure-layout'

export function useStructureRelationships(props: { sources: VaultSource[]; mode: StructureView }) {
  const canvas = useTemplateRef<SVGSVGElement>('structure-canvas'), container = useTemplateRef<HTMLElement>('structure-container')
  const filters = useFiltersStore()
  const query = computed({ get: () => filters.relationships.structure[props.mode].query, set: (value: string) => { filters.relationships.structure[props.mode].query = value } })
  const linkedOnly = computed({ get: () => filters.relationships.structure[props.mode].linkedOnly, set: (value: boolean) => { filters.relationships.structure[props.mode].linkedOnly = value } })
  const full = computed(() => buildStructureDiagram(props.sources, props.mode))
  const selectedId = ref(''), selectedRowId = ref(''), focused = ref(false), zoomPercent = ref(100)
  const diagram = computed(() => filterStructureDiagram(full.value, query.value, linkedOnly.value, focused.value ? selectedId.value : ''))
  const selected = computed(() => full.value.tables.find(table => table.id === selectedId.value))
  const selectedRow = computed(() => selected.value?.rows.find(row => row.id === selectedRowId.value))
  const entries = computed(() => new Map(sourceEntries(props.sources).map(entry => [cardKey(entry.vaultId, entry.id), entry])))
  const selectedEntry = computed(() => selectedRow.value?.entryKey ? entries.value.get(selectedRow.value.entryKey) : undefined)
  const connections = computed(() => full.value.links.filter(link => (link.source === selectedId.value && (!selectedRowId.value || link.sourceRow === selectedRowId.value)) || (link.target === selectedId.value && (!selectedRowId.value || link.targetRow === selectedRowId.value))).map(link => ({ ...link, other: full.value.tables.find(table => table.id === (link.source === selectedId.value ? link.target : link.source))! })))
  const labels = { category: 'Категория', folder: 'Папка категорий', vault: 'Хранилище' }
  let observer: ResizeObserver | undefined, frame = 0, width = 0, height = 0, key = '', hovered = ''
  let tables: PositionedStructureTable[] = [], view: ReturnType<typeof zoom<SVGSVGElement, unknown>> | undefined
  let highlight = () => {}
  function clear() { focused.value = false; selectedId.value = ''; selectedRowId.value = '' }
  function choose(id: string, row = '') { selectedId.value = id; selectedRowId.value = row }
  function fit() {
    if (!canvas.value || !view || !tables.length) return
    const left = Math.min(...tables.map(table => table.x)) - 25, right = Math.max(...tables.map(table => table.x + STRUCTURE_WIDTH)) + 125
    const top = Math.min(...tables.map(table => table.y)) - 65, bottom = Math.max(...tables.map(table => table.y + table.height)) + 25
    const scale = Math.max(.05, Math.min(1.1, (width - 48) / (right - left), (height - 95) / (bottom - top)))
    select(canvas.value).call(view.transform, zoomIdentity.translate(width / 2 - (left + right) / 2 * scale, (height - 35) / 2 - (top + bottom) / 2 * scale).scale(scale))
  }
  function changeZoom(factor: number) { if (canvas.value && view) select(canvas.value).call(view.scaleBy, factor) }
  function reveal(id: string) {
    if (!canvas.value || !view) return
    const table = tables.find(table => table.id === id)
    if (!table) return
    const scale = Math.max(.7, zoomTransform(canvas.value).k)
    select(canvas.value).call(view.transform, zoomIdentity.translate(width / 2 - (table.x + STRUCTURE_WIDTH / 2) * scale, height / 2 - (table.y + Math.min(350, table.height) / 2) * scale).scale(scale))
  }
  function chooseFromList(id: string) { choose(id); nextTick(() => reveal(id)) }
  function render() {
    if (!canvas.value || !container.value) return
    width = Math.max(280, container.value.clientWidth); height = canvas.value.clientHeight || 680
    const svg = select(canvas.value).attr('viewBox', `0 0 ${width} ${height}`), nextKey = JSON.stringify(diagram.value)
    if (nextKey !== key) { tables = layoutStructureTables(diagram.value.tables); key = nextKey }
    const lookup = new Map(tables.map(table => [table.id, table]))
    svg.selectAll('*').remove(); hovered = ''
    const layer = svg.append('g')
    view = zoom<SVGSVGElement, unknown>().scaleExtent([.05, 2.5]).filter(event => !event.button && (event.type !== 'wheel' || event.ctrlKey || event.metaKey)).on('zoom', event => { layer.attr('transform', event.transform.toString()); zoomPercent.value = Math.round(event.transform.k * 100) })
    svg.call(view).on('dblclick.zoom', null).on('click.clear', event => { if (event.target === canvas.value) clear() })
    const paths = layer.append('g').selectAll('path').data(diagram.value.links).join('path').attr('class', link => `structure-wire ${link.kind}`)
    paths.append('title').text(link => link.reasons.join('\n'))
    const boxes = layer.append('g').selectAll<SVGGElement, PositionedStructureTable>('g').data(tables).join('g').attr('class', table => `structure-table ${table.kind}`).attr('role', 'group').attr('aria-label', table => `${labels[table.kind]}: ${table.label}`)
    boxes.append('rect').attr('class', 'structure-table-body').attr('width', STRUCTURE_WIDTH).attr('height', table => table.height).attr('rx', 8)
    const headers = boxes.append('g').attr('class', 'structure-table-header').attr('role', 'button').attr('tabindex', 0).attr('aria-label', table => `${labels[table.kind]} ${table.label}, ${table.rows.length} элементов`)
    headers.append('rect').attr('width', STRUCTURE_WIDTH).attr('height', STRUCTURE_HEADER).attr('rx', 8)
    headers.append('path').attr('class', 'structure-table-icon').attr('d', 'M17,20h15v14h-15zM17,25h15M22,20v14')
    headers.append('text').attr('class', 'structure-table-title').attr('x', 42).attr('y', 30).text(table => table.label)
    headers.append('text').attr('class', 'structure-table-subtitle').attr('x', 17).attr('y', 52).text(table => table.subtitle)
    headers.append('text').attr('class', 'structure-table-count').attr('x', STRUCTURE_WIDTH - 16).attr('y', 30).attr('text-anchor', 'end').text(table => table.rows.length)
    headers.append('line').attr('x1', 0).attr('x2', STRUCTURE_WIDTH).attr('y1', STRUCTURE_HEADER).attr('y2', STRUCTURE_HEADER)
    headers.on('click', (event, table) => { event.stopPropagation(); choose(table.id) }).on('keydown', (event, table) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(table.id) } if (event.key === 'Escape') clear() })
    boxes.each(function (table) {
      const group = select(this)
      if (!table.rows.length) group.append('text').attr('x', 17).attr('y', STRUCTURE_HEADER + 22).attr('class', 'structure-empty-row').text(table.kind === 'folder' ? 'Нет доступных категорий' : 'Пока нет элементов')
      const rows = group.selectAll<SVGGElement, StructureRow>('g.structure-row').data(table.rows).join('g').attr('class', row => `structure-row ${row.kind}`).attr('transform', (_row, index) => `translate(0,${STRUCTURE_HEADER + index * STRUCTURE_ROW})`).attr('role', 'button').attr('tabindex', 0).attr('aria-label', row => `${row.label}, ${row.meta}`)
      rows.append('rect').attr('width', STRUCTURE_WIDTH).attr('height', STRUCTURE_ROW)
      rows.append('line').attr('x1', 0).attr('x2', STRUCTURE_WIDTH).attr('y1', STRUCTURE_ROW).attr('y2', STRUCTURE_ROW)
      rows.append('text').attr('class', 'structure-row-symbol').attr('x', 17).attr('y', 22).text(row => row.kind === 'folder' ? '▦' : row.kind === 'category' ? '◇' : '◆')
      rows.append('text').attr('class', 'structure-row-name').attr('x', 38).attr('y', 22).text(row => row.label)
      rows.append('text').attr('class', 'structure-row-meta').attr('x', STRUCTURE_WIDTH - 14).attr('y', 22).attr('text-anchor', 'end').text(row => row.meta)
      rows.append('title').text(row => `${row.label} · ${row.meta}`)
      rows.on('click', (event, row) => { event.stopPropagation(); choose(table.id, row.id) }).on('keydown', (event, row) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(table.id, row.id) } if (event.key === 'Escape') clear() })
      group.selectAll<SVGTextElement, unknown>('.structure-table-title,.structure-table-subtitle,.structure-row-name,.structure-row-meta').each(function () {
        const maximum = this.classList.contains('structure-table-title') ? 215 : this.classList.contains('structure-table-subtitle') ? 265 : this.classList.contains('structure-row-name') ? 159 : 76
        const characters = Array.from(this.textContent ?? '')
        while (this.getComputedTextLength() > maximum && characters.length > 1) { characters.pop(); this.textContent = characters.join('') + '…' }
      })
    })
    highlight = () => {
      const id = hovered || selectedId.value, row = hovered ? '' : selectedRowId.value, neighbours = structureNeighbours(diagram.value, id, row)
      boxes.classed('is-selected', table => table.id === selectedId.value).classed('is-muted', table => !!id && !neighbours.has(table.id))
      paths.classed('is-active', link => (link.source === id && (!row || link.sourceRow === row)) || (link.target === id && (!row || link.targetRow === row))).classed('is-muted', link => !!id && !((link.source === id && (!row || link.sourceRow === row)) || (link.target === id && (!row || link.targetRow === row))))
      boxes.each(function (table) { select(this).selectAll<SVGGElement, StructureRow>('.structure-row').classed('is-selected', value => table.id === selectedId.value && value.id === selectedRowId.value) })
    }
    headers.on('focus', (event, table) => { if ((event.currentTarget as Element).matches(':focus-visible')) reveal(table.id) })
    headers.on('mouseenter', (_event, table) => { hovered = table.id; highlight() }).on('mouseleave', () => { hovered = ''; highlight() })
    const draw = () => { boxes.attr('transform', table => `translate(${table.x},${table.y})`); paths.attr('d', (link, index) => structureLinkPath(link, lookup, index)) }
    headers.call(drag<SVGGElement, PositionedStructureTable>().container(() => layer.node()!).clickDistance(5).on('start', event => event.sourceEvent.stopPropagation()).on('drag', (event, table) => { table.x = event.x; table.y = event.y; draw() }))
    draw(); highlight(); fit()
  }
  watch(() => JSON.stringify(diagram.value), () => nextTick(render))
  watch([selectedId, selectedRowId], () => highlight())
  watch([() => props.mode, query], clear)
  watch(full, value => {
    const table = value.tables.find(table => table.id === selectedId.value)
    if (selectedId.value && !table) clear()
    else if (selectedRowId.value && !table?.rows.some(row => row.id === selectedRowId.value)) selectedRowId.value = ''
  })
  onMounted(() => {
    observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (canvas.value && container.value && (width !== container.value.clientWidth || height !== canvas.value.clientHeight)) { width = Math.max(280, container.value.clientWidth); height = canvas.value.clientHeight; select(canvas.value).attr('viewBox', `0 0 ${width} ${height}`); fit() } }) })
    if (container.value) observer.observe(container.value)
    render()
  })
  onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(frame); if (canvas.value) select(canvas.value).on('.zoom', null).on('.clear', null).selectAll('*').remove() })
  return { query, linkedOnly, full, diagram, selected, selectedRow, selectedEntry, connections, labels, focused, zoomPercent, clear, fit, changeZoom, chooseFromList }
}
