<script setup lang="ts">
import { spaceSearchText, type SpaceLayerPosition } from '~~/shared/utils/space-layers'

interface LayerRow {
  id: string
  parent: string | null
  depth: number
  kind: string
  icon: string
  title: string
  context: string
  search: string
  hidden: boolean
  hiddenDirectly: boolean
  hiddenByParent: boolean
  hiddenByLink: boolean
}
const props = defineProps<{ spaceId: string; rows: LayerRow[]; selected: ReadonlySet<string>; primary: string; editable: boolean; busy: boolean }>()
const emit = defineEmits<{
  focus: [id: string, toggle: boolean]
  visibility: [id: string]
  move: [ids: readonly string[], target: string | null, position: SpaceLayerPosition]
}>()
const canEdit = computed(() => props.editable && !props.busy)
const open = ref(true)
onMounted(() => { if (window.matchMedia('(max-width: 680px)').matches) open.value = false })
const {query} = toRefs(useSavedFilters(() => `space-layers:${props.spaceId}`, {query:''}))
const searchInput = ref<HTMLInputElement>()
const panel = ref<HTMLElement>()
const collapsed = ref(new Set<string>())
const dragging = ref(new Set<string>())
const drop = ref<{ id: string; position: SpaceLayerPosition }>()
const filter = computed(() => spaceSearchText(query.value))
const byId = computed(() => new Map(props.rows.map(row => [row.id, row])))
const hasChildren = computed(() => new Set(props.rows.map(row => row.parent)))
const items = computed(() => {
  if (filter.value) {
    const words = filter.value.split(/\s+/)
    return props.rows.filter(row => words.every(word => row.search.includes(word)))
  }
  const hidden = new Set<string>()
  return props.rows.filter(row => {
    if (!row.parent || (!collapsed.value.has(row.parent) && !hidden.has(row.parent))) return true
    hidden.add(row.id)
    return false
  })
})
const selectedRow = computed(() => byId.value.get(props.primary))
const siblings = computed(() => props.rows.filter(row => row.parent === selectedRow.value?.parent))
const selectedIndex = computed(() => siblings.value.findIndex(row => row.id === props.primary))
const frames = computed(() => props.rows.filter(row => {
  if (row.kind !== 'frame' || row.id === props.primary) return false
  for (let parent = row.parent; parent; parent = byId.value.get(parent)?.parent ?? null) {
    if (parent === props.primary) return false
  }
  return true
}))

watch(() => props.selected, ids => {
  for (const id of ids) revealAncestors(id)
})

function focusSearch() {
  open.value = true
  void nextTick(() => searchInput.value?.focus())
}
function revealAncestors(id: string) {
  for (let parent = byId.value.get(id)?.parent; parent; parent = byId.value.get(parent)?.parent) collapsed.value.delete(parent)
}
function choose(id: string, toggle = false) {
  revealAncestors(id)
  emit('focus', id, toggle)
}
function toggle(id: string) {
  if (collapsed.value.has(id)) collapsed.value.delete(id)
  else collapsed.value.add(id)
}
function moveSelected(direction: -1 | 1) {
  const target = siblings.value[selectedIndex.value + direction]
  if (target) emit('move', [props.primary], target.id, direction < 0 ? 'before' : 'after')
}
function dragStart(event: DragEvent, id: string) {
  if (!canEdit.value || filter.value) {
    event.preventDefault()
    return
  }
  dragging.value = props.selected.has(id) ? new Set(props.selected) : new Set([id])
  event.dataTransfer?.setData('text/plain', id)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}
function dragOver(event: DragEvent, row: LayerRow) {
  if (!dragging.value.size || !canEdit.value) return
  for (let target: string | null = row.id; target; target = byId.value.get(target)?.parent ?? null) {
    if (dragging.value.has(target)) {
      drop.value = undefined
      return
    }
  }
  event.preventDefault()
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const fraction = (event.clientY - rect.top) / rect.height
  const position = row.kind === 'frame' && fraction > 0.23 && fraction < 0.77 ? 'inside' : fraction < 0.5 ? 'before' : 'after'
  drop.value = { id: row.id, position }
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}
function leaveDrop(event: DragEvent, id: string) {
  if (drop.value?.id === id && !(event.relatedTarget instanceof Node && (event.currentTarget as HTMLElement).contains(event.relatedTarget))) {
    drop.value = undefined
  }
}
function finishDrag(event: DragEvent, row: LayerRow) {
  dragOver(event, row)
  if (dragging.value.size && drop.value?.id === row.id) {
    if (drop.value.position === 'inside') collapsed.value.delete(row.id)
    emit('move', [...dragging.value], row.id, drop.value.position)
  }
  clearDrag()
}
function clearDrag() {
  dragging.value = new Set()
  drop.value = undefined
}
function visibilityLabel(row: LayerRow) {
  if (row.hiddenByParent) return `«${row.title}» скрыт родительским слоем`
  if (row.hiddenByLink) return `«${row.title}» скрыт, пока скрыт один из связанных объектов`
  if (!props.editable) return `«${row.title}» скрыт`
  return `${row.hiddenDirectly ? 'Показать' : 'Скрыть'} слой «${row.title}»`
}
function occupiedWidth() {
  return open.value ? (panel.value?.offsetWidth ?? 0) + 24 : 0
}
defineExpose({ focusSearch, occupiedWidth })
</script>

<template>
  <aside ref="panel" class="space-layers" :class="{ 'layers-closed': !open }" aria-label="Слои пространства" @pointermove.stop @wheel.stop @dragend="clearDrag">
    <header>
      <div v-if="open" class="layers-title"><UIcon name="i-lucide-layers-3" /> <h3>Слои</h3></div>
      <UButton :icon="open ? 'i-lucide-panel-left-close' : 'i-lucide-layers-3'" size="sm" color="neutral" variant="ghost"
        :aria-label="open ? 'Свернуть слои' : 'Показать слои'" :aria-expanded="open" @click="open = !open" />
    </header>
    <template v-if="open">
      <div class="layers-search">
        <UIcon name="i-lucide-search" aria-hidden="true" />
        <input ref="searchInput" v-model="query" type="search" placeholder="Найти объект или файл" aria-label="Поиск по пространству"
          @keydown.enter.prevent="items[0] && choose(items[0].id)" @keydown.esc.stop="query = ''" />
        <button v-if="query" type="button" aria-label="Очистить поиск" @click="query = ''; focusSearch()"><UIcon name="i-lucide-x" /></button>
      </div>
      <p v-if="!items.length" class="layers-empty">{{ filter ? 'Ничего не найдено' : 'В пространстве пока нет элементов' }}</p>
      <ul v-else class="layers-list" :aria-label="filter ? 'Результаты поиска' : 'Порядок слоёв'">
        <li v-for="row in items" :key="row.id" class="layer-row" :class="{ current: selected.has(row.id), 'layer-hidden': row.hidden, 'drop-before': drop?.id === row.id && drop.position === 'before', 'drop-after': drop?.id === row.id && drop.position === 'after', 'drop-inside': drop?.id === row.id && drop.position === 'inside' }"
          :style="{ '--depth': filter ? 0 : Math.min(row.depth, 8) }" :draggable="canEdit && !filter"
          @dragstart="dragStart($event, row.id)" @dragover="dragOver($event, row)" @dragleave="leaveDrop($event, row.id)" @drop.prevent.stop="finishDrag($event, row)">
          <button v-if="!filter && hasChildren.has(row.id)" type="button" class="layer-toggle" :aria-expanded="!collapsed.has(row.id)"
            :aria-label="`${collapsed.has(row.id) ? 'Развернуть' : 'Свернуть'} контур «${row.title}»`" @click="toggle(row.id)"><UIcon :name="collapsed.has(row.id) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" /></button>
          <span v-else class="layer-toggle" aria-hidden="true" />
          <button type="button" class="layer-focus" :aria-current="selected.has(row.id) ? 'true' : undefined" :title="row.title" @click="choose(row.id, $event.shiftKey)">
            <UIcon :name="row.icon" aria-hidden="true" />
            <span><strong>{{ row.title }}</strong><small v-if="filter && row.context">{{ row.context }}</small></span>
          </button>
          <button v-if="editable || row.hidden" type="button" class="layer-visibility"
            :aria-label="visibilityLabel(row)" :title="visibilityLabel(row)"
            :disabled="!canEdit || row.hiddenByParent || row.hiddenByLink" @click.stop="emit('visibility', row.id)">
            <UIcon :name="row.hidden ? 'i-lucide-eye-off' : 'i-lucide-eye'" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <div v-if="canEdit && selectedRow && !filter" class="layer-actions">
        <UButton icon="i-lucide-arrow-up" color="neutral" variant="ghost" size="xs" aria-label="Поднять слой" title="Поднять слой" :disabled="selectedIndex <= 0" @click="moveSelected(-1)" />
        <UButton icon="i-lucide-arrow-down" color="neutral" variant="ghost" size="xs" aria-label="Опустить слой" title="Опустить слой" :disabled="selectedIndex >= siblings.length - 1" @click="moveSelected(1)" />
        <select v-if="frames.length || selectedRow.parent" :value="selectedRow.parent ?? ''" aria-label="Контур выбранного слоя"
          @change="event => { const id = (event.target as HTMLSelectElement).value; if (id) collapsed.delete(id); emit('move', [primary], id || null, id ? 'inside' : 'root') }">
          <option value="">Вне контура</option>
          <option v-for="frame in frames" :key="frame.id" :value="frame.id">{{ frame.title }}</option>
        </select>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.space-layers{position:absolute;z-index:46;top:14px;left:14px;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:8px;width:min(245px,calc(100% - 28px));max-height:calc(100% - 100px);padding:10px;border:1px solid var(--ui-border);border-radius:17px;background:var(--ui-bg);box-shadow:0 8px 24px #17233a1a;touch-action:pan-y}
.space-layers.layers-closed{width:auto;padding:5px;border-radius:13px}
.space-layers header,.layers-title{display:flex;align-items:center;justify-content:space-between;gap:7px}
.layers-title{padding-left:4px;color:var(--ui-text-highlighted)}
.layers-title h3{font-size:13px;font-weight:700}
.layers-search{display:flex;align-items:center;gap:7px;min-width:0;padding:6px 8px;border-radius:8px;background:var(--ui-bg-muted);border:1px solid var(--ui-border);color:var(--ui-text-muted)}
.layers-search:focus-within{border-color:#8b5cf6}
.layers-search input{width:100%;min-width:0;outline:none;font-size:12px;color:var(--ui-text);background:none;border:0}
.layers-search input::-webkit-search-cancel-button{display:none}
.layers-search > .iconify,.layers-search button{flex:none}
.layers-list{overflow:auto;overscroll-behavior:contain;padding:2px}
.layers-empty{padding:7px 4px;color:var(--ui-text-muted);font-size:12px}
.layer-row{position:relative;display:flex;align-items:center;gap:2px;min-width:0;padding-left:calc(var(--depth) * 12px);border-radius:7px}
.layer-row[draggable=true] .layer-focus{cursor:grab}
.layer-row:hover{background:var(--ui-bg-muted)}
.layer-row.current,.layer-row.drop-inside{background:color-mix(in srgb,#8b5cf6 14%,var(--ui-bg))}
.layer-row.drop-before{box-shadow:0 -2px #8b5cf6}
.layer-row.drop-after{box-shadow:0 2px #8b5cf6}
.layer-toggle{display:grid;width:16px;height:26px;flex:none;place-items:center;color:var(--ui-text-muted)}
.layer-focus{display:flex;align-items:center;gap:7px;flex:1;min-width:0;padding:6px 4px 6px 1px;text-align:left;font-size:12px}
.layer-focus > .iconify{color:#8651eb;flex:none}
.layer-focus span{display:grid;min-width:0}
.layer-focus strong,.layer-focus small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.layer-focus strong{font-weight:550}
.layer-hidden .layer-focus{opacity:.62}
.layer-visibility{display:grid;flex:none;place-items:center;width:26px;height:28px;border-radius:6px;color:var(--ui-text-muted)}
.layer-visibility:not(:disabled):hover,.layer-visibility:focus-visible{background:var(--ui-bg);color:var(--ui-text-highlighted)}
.layer-visibility:disabled{opacity:.55}
.layer-visibility .iconify{width:14px;height:14px}
.layer-focus small{color:var(--ui-text-muted);font-size:10px}
.layer-actions{display:flex;align-items:center;gap:3px;padding-top:6px;border-top:1px solid var(--ui-border)}
.layer-actions select{min-width:0;flex:1;border:1px solid var(--ui-border);border-radius:6px;background:var(--ui-bg);font-size:11px;padding:3px}
</style>
