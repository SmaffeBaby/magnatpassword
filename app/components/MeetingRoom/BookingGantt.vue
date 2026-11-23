<script setup lang="ts">
import Organizer from './Organizer.vue'
import type { MeetingRoomPlanningEntry } from '~~/shared/types/meeting-room'
import { adjustMeetingRoomInterval, meetingRoomBar, meetingRoomCompleted, meetingRoomDayMinutes, meetingRoomHours, meetingRoomTicks, type MeetingRoomDragMode, type MeetingRoomGridStep } from '~~/shared/utils/meeting-room'
import { dateLabel } from '~~/shared/utils/subscriptions'

const props = defineProps<{
  days: string[]
  today: string
  hourly: boolean
  rows: { entry: MeetingRoomPlanningEntry; column: number }[]
  busy: boolean
  loading?: boolean
  move?: (entry: MeetingRoomPlanningEntry, start: string, end: string) => Promise<void>
}>()
const emit = defineEmits<{ open: [id: string]; day: [date: string] }>()
const hours = meetingRoomHours.slice(0, -1)
const { step } = toRefs(useSavedFilters('meeting-room-gantt-grid', { step: 10 as MeetingRoomGridStep }))
const gridStep = computed<MeetingRoomGridStep>(() => step.value === 5 ? 5 : 10)
const ticks = computed(() => props.hourly ? meetingRoomTicks(gridStep.value) : [])
const columns = computed(() => props.hourly ? ticks.value.length : props.days.length)
const scroll = ref<HTMLElement>()
const clock = useMeetingRoomClock()
const canPan = ref(false)
const panning = ref(false)
let pan: { pointer: number; x: number; left: number; scale: number } | undefined
watch(scroll, (element, _, cleanup) => {
  if (!element) return
  const measure = () => { canPan.value = element.scrollWidth > element.clientWidth }
  const observer = new ResizeObserver(measure)
  observer.observe(element)
  if (element.firstElementChild) observer.observe(element.firstElementChild)
  cleanup(() => observer.disconnect())
  measure()
})
function startPan(event: PointerEvent) {
  const element = scroll.value
  if (!element || !canPan.value || pan || gesture || event.pointerType === 'touch' || !event.isPrimary || event.button !== 0
    || (event.target as Element).closest('button,a,input')) return
  event.preventDefault()
  element.setPointerCapture(event.pointerId)
  pan = { pointer: event.pointerId, x: event.clientX, left: element.scrollLeft, scale: element.getBoundingClientRect().width / element.offsetWidth || 1 }
  panning.value = true
}
function scrollPan(event: PointerEvent) {
  if (pan?.pointer === event.pointerId && scroll.value) scroll.value.scrollLeft = pan.left - (event.clientX - pan.x) / pan.scale
}
function stopPan(event: PointerEvent) {
  if (pan?.pointer !== event.pointerId) return
  pan = undefined
  panning.value = false
  if (scroll.value?.hasPointerCapture(event.pointerId)) scroll.value.releasePointerCapture(event.pointerId)
}
const shortMonth = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' })
const canMove = (entry: MeetingRoomPlanningEntry) => props.hourly && entry.canEdit && !!props.move
const error = ref('')
type Interval = { start: string; end: string }
type Gesture = {
  entry: MeetingRoomPlanningEntry
  mode: MeetingRoomDragMode
  handle: HTMLButtonElement
  track: HTMLElement
  pointer: number
  origin: number
  clientX: number
  latestX: number
  moved: boolean
}
let gesture: Gesture | undefined
let scrollFrame = 0
let suppressClick = ''
const preview = shallowRef<{ id: string; interval: Interval }>()
const saving = ref(false)

function slot(entry: MeetingRoomPlanningEntry) {
  return preview.value?.id === entry.id ? preview.value.interval : entry
}
function bookingLabel(entry: MeetingRoomPlanningEntry) {
  const { start, end } = slot(entry)
  const completed = meetingRoomCompleted(entry.startOn, end, clock.value)
  return [entry.title, `${start}–${end}`, entry.organizer?.name, completed && 'Завершена'].filter(Boolean).join(' · ')
}
function position(entry: MeetingRoomPlanningEntry, column: number) {
  const interval = slot(entry)
  const { left, width } = props.hourly
    ? meetingRoomBar(interval.start, interval.end)
    : { left: `${column / columns.value * 100}%`, width: `${100 / columns.value}%` }
  return { '--left': left, '--width': width }
}
function overlaps(entry: MeetingRoomPlanningEntry, interval: Interval) {
  return props.rows.some(({ entry: other }) => other.id !== entry.id && other.startOn === entry.startOn
    && other.start < interval.end && other.end > interval.start)
}

function startMove(event: PointerEvent, entry: MeetingRoomPlanningEntry, mode: MeetingRoomDragMode) {
  if (!event.isPrimary || event.button !== 0 || gesture || props.busy || saving.value || !canMove(entry)) return
  const handle = event.currentTarget as HTMLButtonElement
  const track = handle.closest<HTMLElement>('.booking-row')
  if (!track) return
  error.value = ''
  suppressClick = ''
  handle.setPointerCapture(event.pointerId)
  gesture = {
    entry, mode, handle, track, pointer: event.pointerId,
    origin: event.clientX - track.getBoundingClientRect().left, clientX: event.clientX, latestX: event.clientX, moved: false
  }
}

function updatePreview(active: Gesture) {
  const bounds = active.track.getBoundingClientRect()
  if (!bounds.width) return
  const delta = (active.latestX - bounds.left - active.origin) * meetingRoomDayMinutes / bounds.width
  preview.value = {
    id: active.entry.id,
    interval: adjustMeetingRoomInterval(active.entry.start, active.entry.end, delta, gridStep.value, active.mode)
  }
}

function scrollDuringDrag() {
  scrollFrame = 0
  const active = gesture
  const viewport = scroll.value
  if (!active?.moved || !viewport) return
  const { left, right } = viewport.getBoundingClientRect()
  const x = active.latestX
  const velocity = x < left + 40 ? Math.max(-18, (x - left - 40) / 3)
    : x > right - 40 ? Math.min(18, (x - right + 40) / 3) : 0
  if (!velocity) return
  const previous = viewport.scrollLeft
  viewport.scrollLeft += velocity
  if (viewport.scrollLeft === previous) return
  updatePreview(active)
  scrollFrame = requestAnimationFrame(scrollDuringDrag)
}

function drag(event: PointerEvent) {
  const active = gesture
  if (!active || active.pointer !== event.pointerId) return
  if (!active.moved && Math.abs(event.clientX - active.clientX) < 4) return
  active.moved = true
  active.latestX = event.clientX
  updatePreview(active)
  if (!scrollFrame) scrollFrame = requestAnimationFrame(scrollDuringDrag)
}

function release(active: Gesture) {
  gesture = undefined
  cancelAnimationFrame(scrollFrame)
  scrollFrame = 0
  if (active.handle.hasPointerCapture(active.pointer)) active.handle.releasePointerCapture(active.pointer)
}

function cancel(event?: PointerEvent) {
  const active = gesture
  if (!active || (event && active.pointer !== event.pointerId)) return
  if (active.moved) suppressClick = active.entry.id
  release(active)
  preview.value = undefined
}

function finish(event: PointerEvent) {
  const active = gesture
  if (!active || active.pointer !== event.pointerId) return
  drag(event)
  release(active)
  if (!active.moved) return
  suppressClick = active.entry.id
  const interval = preview.value?.interval
  if (interval) void commit(active.entry, interval)
}

async function commit(entry: MeetingRoomPlanningEntry, interval: Interval) {
  if ((entry.start === interval.start && entry.end === interval.end) || !canMove(entry) || !props.move || props.busy || saving.value) {
    preview.value = undefined
    return
  }
  if (overlaps(entry, interval)) {
    error.value = 'Переговорная уже занята в это время.'
    preview.value = undefined
    return
  }
  error.value = ''
  preview.value = { id: entry.id, interval }
  saving.value = true
  try { await props.move(entry, interval.start, interval.end) }
  catch (failure) { error.value = failure instanceof Error ? failure.message : 'Не удалось изменить время брони.' }
  finally { saving.value = false; preview.value = undefined }
}

function open(event: MouseEvent, entry: MeetingRoomPlanningEntry) {
  if (event.detail > 0 && suppressClick === entry.id) {
    suppressClick = ''
    return
  }
  emit('open', entry.id)
}

function keyboardMove(event: KeyboardEvent, entry: MeetingRoomPlanningEntry, mode: MeetingRoomDragMode) {
  if (event.key === 'Escape' && gesture) {
    event.preventDefault()
    cancel()
    return
  }
  if (!canMove(entry) || event.altKey || event.metaKey || event.ctrlKey) return
  const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
  if (!direction) return
  event.preventDefault()
  if (!gesture && !saving.value && !props.busy) {
    const delta = direction * gridStep.value * (event.shiftKey ? 3 : 1)
    void commit(entry, adjustMeetingRoomInterval(entry.start, entry.end, delta, gridStep.value, mode))
  }
}

watch([() => props.hourly, () => props.days[0], columns], () => { cancel(); error.value = '' })
watch(() => props.rows, rows => {
  if (gesture && !rows.some(({ entry }) => entry.id === gesture?.entry.id && entry.revision === gesture.entry.revision && entry.canEdit)) cancel()
})
onBeforeUnmount(() => cancel())
</script>

<template>
  <UAlert v-if="error" color="error" :description="error" />
  <div v-if="hourly" class="flex items-center justify-end gap-2" role="group" aria-label="Шаг сетки">
    <span class="text-sm text-muted">Шаг сетки</span>
    <UButton v-for="size in ([5, 10] as const)" :key="size" :label="`${size} мин`" size="sm" color="neutral"
      :variant="gridStep === size ? 'soft' : 'outline'" :aria-pressed="gridStep === size" @click="step = size" />
  </div>
  <div ref="scroll" class="booking-scroll" :class="{ 'can-pan': canPan, panning }" tabindex="0" aria-label="Шкала диаграммы Ганта"
    @pointerdown="startPan" @pointermove="scrollPan" @pointerup="stopPan" @pointercancel="stopPan" @lostpointercapture="stopPan">
    <div class="booking-chart" :class="{ hourly }" :style="{ '--columns': columns }">
      <div v-if="hourly" class="booking-axis minute-axis">
        <div class="hour-labels">
          <span v-for="hour in hours" :key="hour">{{ hour }}</span>
          <span class="last-hour">{{ meetingRoomHours.at(-1) }}</span>
        </div>
        <div class="minute-labels">
          <span v-for="tick in ticks" :key="tick">{{ tick.endsWith(':00') ? '' : tick }}</span>
        </div>
      </div>
      <div v-else class="booking-axis">
        <button v-for="(day, index) in days" :key="day" type="button" :class="{ today: day === today }"
          :aria-label="`Показать часы за ${dateLabel(day)}`" :aria-current="day === today ? 'date' : undefined"
          @click="emit('day', day)">
          {{ Number(day.slice(-2)) }}
          <small v-if="index === 0 || day.endsWith('-01')">{{ shortMonth.format(new Date(day + 'T12:00:00Z')) }}</small>
        </button>
      </div>
      <div v-for="{ entry, column } in rows" :key="entry.id" class="booking-row" :style="position(entry, column)"
        @pointermove="drag" @pointerup="finish" @pointercancel="cancel" @lostpointercapture="cancel">
        <div class="booking-block" :class="{ editable: canMove(entry), completed: meetingRoomCompleted(entry.startOn, slot(entry).end, clock) }">
          <button type="button" class="booking-card"
          :class="{ movable: canMove(entry), dragging: preview?.id === entry.id, conflict: preview?.id === entry.id && overlaps(entry, preview.interval) }"
          :aria-keyshortcuts="canMove(entry) ? 'ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight' : undefined"
          :aria-label="bookingLabel(entry)"
          :title="canMove(entry) ? `${bookingLabel(entry)} · Перетащите, чтобы перенести бронь` : bookingLabel(entry)"
          :aria-disabled="busy || saving || undefined"
          @click="event => { if (!busy && !saving) open(event, entry) }"
          @dragstart.prevent
          @pointerdown="startMove($event, entry, 'move')" @keydown="keyboardMove($event, entry, 'move')">
          <span class="booking-title">{{ entry.title }}</span>
          <span class="booking-time">{{ slot(entry).start }}–{{ slot(entry).end }}</span>
          <Organizer :person="entry.organizer" />
          </button>
          <template v-if="canMove(entry)">
            <button v-for="edge in (['start', 'end'] as const)" :key="edge" type="button"
              class="resize-handle" :class="edge" :aria-disabled="busy || saving || undefined"
              :aria-label="`Изменить ${edge === 'start' ? 'начало' : 'окончание'} брони «${entry.title}»`"
              aria-keyshortcuts="ArrowLeft ArrowRight Shift+ArrowLeft Shift+ArrowRight"
              @pointerdown="startMove($event, entry, edge)" @keydown="keyboardMove($event, entry, edge)" />
          </template>
        </div>
        <span v-if="!hourly" class="booking-interval" aria-hidden="true" />
      </div>
      <div v-if="!loading && !rows.length" class="booking-row"><p class="booking-empty">На выбранный период нет броней.</p></div>
    </div>
  </div>
</template>

<style scoped>
.booking-scroll{overflow:auto;min-width:0;border:1px solid var(--ui-border);border-radius:14px;background:var(--ui-bg)}
.booking-scroll.can-pan{cursor:grab}
.booking-scroll.panning{cursor:grabbing;user-select:none}
.booking-chart{--column-min:35px;min-width:calc(var(--columns)*var(--column-min))}
.booking-chart.hourly{--column-min:38px;--hour-line:linear-gradient(to left,var(--ui-border-accented) 1px,transparent 1px)}
.booking-axis,.booking-row{position:relative;background-image:repeating-linear-gradient(to right,transparent 0 calc(100% / var(--columns) - 1px),var(--ui-border) calc(100% / var(--columns) - 1px) calc(100% / var(--columns)))}
.hourly .booking-row,.minute-labels{background-image:var(--hour-line),linear-gradient(to left,var(--ui-border) 1px,transparent 1px);background-size:calc(100% / 9) 100%,calc(100% / var(--columns)) 100%}
.booking-axis{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));min-height:40px;background-color:var(--ui-bg-muted);border-bottom:1px solid var(--ui-border);color:var(--ui-text-muted);font-size:11px;font-weight:600}
.booking-axis>button,.hour-labels>span,.minute-labels>span{display:grid;align-content:center;padding:4px 5px}
.booking-axis>button:hover,.booking-axis>button:focus-visible,.booking-axis .today{background:color-mix(in srgb,var(--ui-primary) 9%,transparent);color:var(--ui-primary)}
.minute-axis{display:block;background-image:none}
.hour-labels,.minute-labels{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));min-height:25px}
.hour-labels{position:relative;background-image:var(--hour-line);background-size:calc(100% / 9) 100%;border-bottom:1px solid var(--ui-border)}
.hour-labels .last-hour{position:absolute;inset:0 0 0 auto;background:var(--ui-bg-muted)}
.minute-labels{grid-template-columns:repeat(var(--columns),minmax(0,1fr));font-size:10px;font-weight:500;font-variant-numeric:tabular-nums}
.booking-row{--card-width:clamp(10rem,var(--width),100%);padding-block:8px 13px;border-bottom:1px solid var(--ui-border)}
.booking-row:last-child{border-bottom:0}
.booking-block{position:relative;width:var(--card-width);margin-inline-start:clamp(0px,var(--left),calc(100% - var(--card-width)))}
.hourly .booking-row{padding-block-end:8px}
.hourly .booking-block{width:var(--width);margin-inline-start:var(--left);container-type:inline-size}
.booking-card{display:block;width:100%;padding:8px 10px;text-align:left;color:var(--ui-text-highlighted);background:var(--ui-bg-muted);border:1px solid var(--ui-border-accented);border-radius:8px;cursor:pointer;overflow:hidden}
.hourly .booking-card{border-color:transparent;box-shadow:inset 0 0 0 1px var(--ui-border-accented);padding-inline:clamp(0px,5cqi,10px)}
.booking-block.editable .booking-card{padding-bottom:22px}
.booking-title{font-size:13px;font-weight:650;line-height:1.35;overflow-wrap:anywhere}
.booking-title,.booking-time{display:block;margin-bottom:3px}
.booking-time{font-size:12px;color:var(--ui-text-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.booking-card:hover{border-color:var(--ui-primary)}
.booking-card:focus-visible,.booking-card.dragging{outline:2px solid var(--ui-primary);outline-offset:-2px}
.booking-card.movable{cursor:grab;touch-action:pan-y;user-select:none}
.booking-card.dragging{cursor:grabbing}
.booking-card.conflict{outline-color:var(--ui-error)}
.booking-block.completed .booking-card{background:color-mix(in srgb,var(--ui-success) 14%,var(--ui-bg));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--ui-success) 45%,var(--ui-border))}
.booking-interval{position:absolute;bottom:6px;left:var(--left);width:var(--width);min-width:1px;height:4px;border-radius:4px;background:var(--ui-primary);pointer-events:none}
.resize-handle{position:absolute;bottom:2px;width:14px;height:18px;border-radius:4px;background:var(--ui-bg-muted);border:1px solid var(--ui-border-accented);cursor:ew-resize;touch-action:pan-y}
.resize-handle.start{left:0;transform:translateX(-25%)}
.resize-handle.end{right:0;transform:translateX(25%)}
.resize-handle::before{content:'';display:block;width:4px;height:8px;border-inline:1px solid currentColor;margin:auto}
.resize-handle:hover,.resize-handle:focus-visible{color:var(--ui-primary);outline:2px solid currentColor}
.booking-empty{position:sticky;left:0;width:fit-content;padding:14px;font-size:13px;color:var(--ui-text-muted)}
@container (max-width:90px){.booking-title{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}.booking-time{font-size:10px}}
@container (max-width:62px){.booking-card :deep(.organizer),.booking-time{display:none}}
</style>
