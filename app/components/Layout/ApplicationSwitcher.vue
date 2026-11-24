<script setup lang="ts">
import { servicePageTitle } from '~/stores/serviceTabs'
import ServicePicker from './ServicePicker.vue'

const route = useRoute(), tabs = useServiceTabsStore()
const switcher = ref<HTMLElement | null>(null)
const strip = ref<HTMLElement | null>(null)
const addButton = ref<HTMLButtonElement | null>(null)
const overflowing = ref(false)
const addOpen = ref(false)
const displayedTabs = computed(() => tabs.tabs.length || route.path === '/' ? tabs.tabs : [{ id: '', path: route.fullPath, label: undefined, editor: undefined }])
const tabName = (tab: typeof displayedTabs.value[number]) => tab.label || servicePageTitle(tab.path)
const listOpen = ref(false), tabSearch = ref('')
const listedTabs = computed(() => {
  const query = tabSearch.value.trim().toLocaleLowerCase('ru')
  return displayedTabs.value.filter(tab => tabName(tab).toLocaleLowerCase('ru').includes(query))
})
watch(listOpen, open => { if (!open) tabSearch.value = '' })

function selectFromList(id: string) {
  listOpen.value = false
  if (id === tabs.activeId) showTab(id)
  else void tabs.select(id)
}
const dragging = ref(''), sliding = ref(false), dropIndex = ref(-1), announcement = ref('')
const dropMarker = computed(() => {
  if (!dragging.value || dropIndex.value < 0 || dropIndex.value === tabs.tabs.findIndex(tab => tab.id === dragging.value)) return
  const remaining = tabs.tabs.filter(tab => tab.id !== dragging.value)
  return remaining[dropIndex.value]?.id ?? 'end'
})
let pointer: { id: number; tab: string | undefined; start: number; x: number; y: number; scrollLeft: number } | undefined
let scrollFrame = 0, clickTimer: ReturnType<typeof setTimeout> | undefined, suppressClick = false

function tabElements() {
  return [...(strip.value?.querySelectorAll<HTMLElement>('[data-tab-id]') ?? [])]
}

function measureOverflow() {
  const bar = switcher.value, list = strip.value, add = addButton.value
  if (!bar || !list || !add || dragging.value) return
  const style = window.getComputedStyle(bar)
  // Measure against the width without the overview button so it can disappear as soon as the tabs fit.
  const available = bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    - parseFloat(style.columnGap) - add.getBoundingClientRect().width
  overflowing.value = list.scrollWidth > available + 0.5
  if (!overflowing.value) listOpen.value = false
}

function showTab(id: string) {
  const list = strip.value
  const item = tabElements().find(element => element.dataset.tabId === id)
  if (!list || !item) return
  const bounds = list.getBoundingClientRect(), tab = item.getBoundingClientRect()
  if (tab.left < bounds.left) list.scrollLeft += tab.left - bounds.left
  else if (tab.right > bounds.right) list.scrollLeft += tab.right - bounds.right
}

function moveTab(id: string, index: number) {
  if (!tabs.move(id, index)) return
  const position = tabs.tabs.findIndex(tab => tab.id === id)
  const item = tabs.tabs[position]
  if (item) announcement.value = `${tabName(item)}, позиция ${position + 1} из ${tabs.tabs.length}`
}

function moveByKey(id: string, direction: number) {
  moveTab(id, tabs.tabs.findIndex(tab => tab.id === id) + direction)
  void nextTick(() => {
    tabElements().find(element => element.dataset.tabId === id)?.querySelector<HTMLElement>('.service-tab-main')?.focus({ preventScroll: true })
    showTab(id)
  })
}

function beginDrag(event: PointerEvent) {
  const list = strip.value, target = event.target
  if (pointer || !list || event.button !== 0 || !(target instanceof Element) || target.closest('.service-close')) return
  const tab = target.closest('[data-tab-grip]')?.closest<HTMLElement>('[data-tab-id]')?.dataset.tabId
  if (tab ? tabs.tabs.length < 2 : (event.pointerType === 'touch' || list.scrollWidth <= list.clientWidth)) return
  pointer = { id: event.pointerId, tab, start: event.clientX, x: event.clientX, y: event.clientY, scrollLeft: list.scrollLeft }
  window.addEventListener('pointermove', dragMove)
  window.addEventListener('pointerup', finishDrag)
  window.addEventListener('pointercancel', cancelDrag)
  window.addEventListener('blur', stopDrag)
}

function dragMove(event: PointerEvent) {
  if (!pointer || pointer.id !== event.pointerId) return
  pointer.x = event.clientX
  pointer.y = event.clientY
  const delta = pointer.x - pointer.start
  if (!dragging.value && !sliding.value && Math.abs(delta) >= 6) {
    if (pointer.tab) {
      dragging.value = pointer.tab
      updateDrop()
    } else sliding.value = true
  }
  if (sliding.value && strip.value) strip.value.scrollLeft = pointer.scrollLeft - delta
  if (dragging.value || sliding.value) event.preventDefault()
}

function dropPosition(x: number, y: number, bounds: DOMRect) {
  if (y < bounds.top - 18 || y > bounds.bottom + 18 || x < bounds.left - 18 || x > bounds.right + 18) return -1
  return tabElements().filter(element => {
    if (element.dataset.tabId === dragging.value) return false
    const rect = element.getBoundingClientRect()
    return x > rect.left + rect.width / 2
  }).length
}

function updateDrop() {
  const list = strip.value
  if (!pointer || !list || !dragging.value) return
  const bounds = list.getBoundingClientRect()
  const { x, y } = pointer
  dropIndex.value = dropPosition(x, y, bounds)
  if (dropIndex.value >= 0) {
    const leftGap = x - bounds.left, rightGap = bounds.right - x
    if (leftGap < 24) list.scrollLeft -= Math.min(12, 24 - leftGap)
    else if (rightGap < 24) list.scrollLeft += Math.min(12, 24 - rightGap)
  }
  scrollFrame = requestAnimationFrame(updateDrop)
}

function stopDrag() {
  pointer = undefined
  dragging.value = ''
  sliding.value = false
  dropIndex.value = -1
  cancelAnimationFrame(scrollFrame)
  window.removeEventListener('pointermove', dragMove)
  window.removeEventListener('pointerup', finishDrag)
  window.removeEventListener('pointercancel', cancelDrag)
  window.removeEventListener('blur', stopDrag)
}

function cancelDrag(event: PointerEvent) {
  if (event.pointerId === pointer?.id) stopDrag()
}

function finishDrag(event: PointerEvent) {
  if (event.pointerId !== pointer?.id) return
  if (dragging.value) {
    const bounds = strip.value?.getBoundingClientRect()
    const index = bounds ? dropPosition(event.clientX, event.clientY, bounds) : -1
    if (index >= 0) moveTab(dragging.value, index)
  }
  if (dragging.value || sliding.value) {
    suppressClick = true
    clearTimeout(clickTimer)
    clickTimer = setTimeout(() => { suppressClick = false }, 0)
  }
  stopDrag()
}

function guardClick(event: MouseEvent) {
  if (suppressClick) {
    event.preventDefault()
    event.stopPropagation()
  }
}

function handleTabShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.repeat
    || !event.shiftKey || event.altKey || event.metaKey === event.ctrlKey) return
  if (event.code !== 'Period' && event.code !== 'Comma') return

  const trigger = addButton.value
  if (!trigger?.getClientRects().length || pointer
    || (document.fullscreenElement && !document.fullscreenElement.contains(trigger))
    || document.querySelector('[aria-modal="true"]')) return

  if (event.code === 'Period') {
    event.preventDefault()
    if (addOpen.value) return
    listOpen.value = false
    trigger.focus({ preventScroll: true })
    addOpen.value = true
  } else if (tabs.activeId) {
    event.preventDefault()
    void tabs.close(tabs.activeId)
  }
}

onMounted(() => window.addEventListener('keydown', handleTabShortcut))

watch(() => displayedTabs.value.length, measureOverflow, { flush: 'post' })
watch([() => tabs.activeId, overflowing], ([id]) => showTab(id), { flush: 'post' })
watch([switcher, strip, addButton], ([bar, list, add], _, onCleanup) => {
  if (!bar || !list || !add) return
  measureOverflow()
  const observer = new ResizeObserver(measureOverflow)
  for (const element of [bar, list, add]) observer.observe(element)
  window.addEventListener('resize', measureOverflow)
  onCleanup(() => {
    observer.disconnect()
    window.removeEventListener('resize', measureOverflow)
  })
}, { flush: 'post' })
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleTabShortcut)
  stopDrag()
  clearTimeout(clickTimer)
})
</script>

<template>
  <nav ref="switcher" class="workspace-apps services-switcher" aria-label="Сервисы и вкладки">
    <UPopover
      v-if="overflowing"
      v-model:open="listOpen"
      :content="{ side: 'bottom', align: 'start', sideOffset: 10, collisionPadding: 12 }"
      :ui="{ content: 'overflow-hidden rounded-[18px] shadow-xl' }"
    >
      <button type="button" class="service-icon-button" aria-label="Показать все вкладки" title="Все вкладки">
        <UIcon name="i-lucide-list"/>
      </button>
      <template #content>
        <section class="tab-overview" aria-label="Все вкладки">
          <header><h2>Все вкладки</h2><span>{{ displayedTabs.length }}</span></header>
          <UInput v-model="tabSearch" class="w-full" icon="i-lucide-search" placeholder="Найти вкладку" aria-label="Найти вкладку"/>
          <ul v-if="listedTabs.length" class="tab-overview-list">
            <li v-for="tab in listedTabs" :key="tab.id">
              <button type="button" :aria-current="tab.id === tabs.activeId ? 'page' : undefined" @click="selectFromList(tab.id)">
                <UIcon :name="tab.editor ? 'i-lucide-file-text' : 'i-lucide-app-window'"/>
                <span>{{ tabName(tab) }}</span>
                <UIcon v-if="tab.id === tabs.activeId" name="i-lucide-check"/>
              </button>
            </li>
          </ul>
          <p v-else role="status">Вкладки не найдены</p>
        </section>
      </template>
    </UPopover>
    <ul ref="strip" class="service-tabs" :class="{ 'is-grabbing': dragging || sliding }" aria-label="Открытые вкладки" @pointerdown="beginDrag" @click.capture="guardClick" @dragstart.prevent>
      <li
        v-for="tab in displayedTabs"
        :key="tab.id"
        :data-tab-id="tab.id"
        :class="{ 'is-active': tab.id === tabs.activeId, 'is-dragging': dragging && dragging === tab.id, 'drop-before': dropMarker === tab.id }"
      >
        <ServicePicker v-if="tab.id === tabs.activeId" mode="replace" :dragging="!!dragging || sliding" @choose="tabs.replace">
          <button
            type="button"
            class="service-tab-main"
            :title="tabName(tab)"
            :aria-label="`Сменить сервис во вкладке ${tabName(tab)}`"
            aria-current="page"
            aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
            @keydown.alt.left.prevent="moveByKey(tab.id, -1)"
            @keydown.alt.right.prevent="moveByKey(tab.id, 1)"
          >
            <span class="service-grip" data-tab-grip aria-hidden="true"><UIcon name="i-lucide-grip-vertical"/></span>
            <span class="service-tab-label">{{ tabName(tab) }}</span>
            <UIcon class="service-chevron" name="i-lucide-chevron-down"/>
          </button>
        </ServicePicker>
        <button
          v-else
          type="button"
          class="service-tab-main"
          :title="tabName(tab)"
          aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
          @click="tabs.select(tab.id)"
          @keydown.alt.left.prevent="moveByKey(tab.id, -1)"
          @keydown.alt.right.prevent="moveByKey(tab.id, 1)"
        >
          <span class="service-grip" data-tab-grip aria-hidden="true"><UIcon name="i-lucide-grip-vertical"/></span>
          <span class="service-tab-label">{{ tabName(tab) }}</span>
        </button>
        <button
          v-if="tab.id"
          type="button"
          class="service-close"
          :aria-label="`Закрыть вкладку ${tabName(tab)}`"
          :aria-keyshortcuts="tab.id === tabs.activeId ? 'Meta+Shift+, Control+Shift+,' : undefined"
          :title="tab.id === tabs.activeId ? 'Закрыть вкладку (⌘/Ctrl+Shift+,)' : undefined"
          @click="tabs.close(tab.id)"
        >
          <UIcon name="i-lucide-x"/>
        </button>
      </li>
      <li v-if="dropMarker === 'end'" class="drop-end" aria-hidden="true"/>
    </ul>
    <ServicePicker v-model:open="addOpen" mode="new" :dragging="!!dragging || sliding" @choose="path => tabs.open(path)">
      <button
        ref="addButton"
        type="button"
        class="service-icon-button"
        aria-label="Открыть сервис в новой вкладке"
        aria-keyshortcuts="Meta+Shift+. Control+Shift+."
        title="Открыть сервис в новой вкладке (⌘/Ctrl+Shift+.)"
      >
        <UIcon name="i-lucide-plus"/>
      </button>
    </ServicePicker>
    <span class="sr-only" role="status">{{ announcement }}</span>
  </nav>
</template>

<style scoped>
.workspace-apps.services-switcher { display:flex; flex:1 1 0%; align-items:center; justify-content:center; gap:6px; min-width:0; width:100%; max-width:none; overflow:visible; }
.service-tabs { min-width:0; width:max-content; flex:0 1 auto; display:flex; align-items:center; gap:6px; overflow-x:auto; padding:3px 4px; scrollbar-width:thin; }
.service-tabs li[data-tab-id], .service-icon-button {
  display:flex; flex:none; align-items:center; height:36px; border:1px solid #dce5ef; border-radius:10px; background:#fff; color:#334155;
}
.service-tabs li[data-tab-id] { position:relative; width:clamp(136px, 15vw, 168px); user-select:none; }
.service-tabs li.is-active {
  background:var(--color-magnat-100); border-color:var(--color-magnat-200); color:var(--color-magnat-700);
}
.service-tabs li.is-active::after {
  position:absolute; inset:auto 12px 0; height:2px; border-radius:2px; background:var(--color-magnat-600); content:""; pointer-events:none;
}
.service-tab-main { display:flex; align-items:center; gap:4px; flex:1; min-width:0; height:100%; padding:0 6px; border-radius:9px; text-align:left; font-size:12px; font-weight:600; }
.service-tab-label { flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.service-grip { display:grid; place-items:center; flex:0 0 14px; min-height:28px; color:#687c93; cursor:grab; touch-action:none; }
.service-chevron,.service-close .iconify,.service-grip .iconify { width:14px; height:14px; flex-shrink:0; }
.service-icon-button { justify-content:center; width:36px; }
.service-icon-button .iconify { width:18px; height:18px; }
.service-close { display:grid; place-items:center; flex:0 0 24px; height:28px; margin-right:2px; border-radius:8px; }
.service-close:hover,.service-tab-main:hover,.service-icon-button:hover { background:#eaf2fa; }
.service-tabs li.is-active button:hover { background:var(--color-magnat-200); }
.service-tabs button:focus-visible,.service-icon-button:focus-visible,.tab-overview-list button:focus-visible { outline:2px solid #356c9e; outline-offset:-2px; }
.service-tabs.is-grabbing, .service-tabs.is-grabbing .service-tab-main, .service-tabs.is-grabbing .service-grip { cursor:grabbing; }
.service-tabs li.is-dragging { opacity:.55; }
.service-tabs li.drop-before::before {
  position:absolute; inset:3px auto 3px -5px; width:2px; border-radius:1px; background:#356c9e; content:"";
}
.service-tabs li.drop-end { flex:0 0 2px; height:28px; border-radius:1px; background:#356c9e; }
.tab-overview { display:grid; gap:10px; width:min(340px,calc(100vw - 28px)); padding:12px; background:#f8fbfe; color:#334155; }
.tab-overview header { display:flex; align-items:center; justify-content:space-between; padding:2px 4px; }
.tab-overview h2 { font-size:14px; font-weight:650; }
.tab-overview header span { color:var(--color-magnat-700); background:var(--color-magnat-100); border-radius:999px; padding:2px 8px; font-size:11px; font-weight:600; }
.tab-overview-list { display:grid; gap:3px; max-height:min(350px,55dvh); overflow-y:auto; overscroll-behavior:contain; }
.tab-overview-list button { display:flex; align-items:center; gap:9px; width:100%; padding:8px 9px; border-radius:9px; text-align:left; font-size:13px; }
.tab-overview-list button span:not(.iconify) { flex:1; min-width:0; overflow-wrap:anywhere; }
.tab-overview-list button .iconify { width:16px; height:16px; flex-shrink:0; }
.tab-overview-list button:hover { background:#eaf2fa; }
.tab-overview-list button[aria-current="page"] { background:var(--color-magnat-100); color:var(--color-magnat-700); font-weight:600; }
.tab-overview p { padding:10px 4px; color:#526781; font-size:12px; }
@media(max-width:600px) { .service-tabs li[data-tab-id] { width:132px; } }
</style>
