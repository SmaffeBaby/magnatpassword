<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import ProjectTasksPlanner from '~/components/Kaban/ProjectTasksPlanner.vue'
import { meetingRoomView } from '~/components/Layout/home-service-links'
import Organizer from '~/components/MeetingRoom/Organizer.vue'
import BookingFields from '~/components/MeetingRoom/BookingFields.vue'
import { saveFile } from '~/utils/file-download'
import type { MeetingRoomBooking, MeetingRoomFormInput, MeetingRoomFormSeed, MeetingRoomPlanningEntry } from '~~/shared/types/meeting-room'
import { meetingRoomCompleted, meetingRoomOpens, meetingRoomPlanningEntry, meetingRoomSchedule } from '~~/shared/utils/meeting-room'
import type { TaskDateRange } from '~~/shared/utils/project-task-planning'
import { addPeriod, dateLabel, todayDate, validDate } from '~~/shared/utils/subscriptions'

definePageMeta({ layout: 'home' })
useHead({ title: 'Переговорная комната' })

const route = useRoute()
const auth = useAuthStore()
const client = useQueryClient()
const toast = useToast()
const view = computed(() => meetingRoomView(route.query.view))
const today = ref(todayDate())
const chosenDate = ref('')
const selectedDate = computed(() => chosenDate.value || today.value)
const { dayDisplay } = toRefs(useSavedFilters('meeting-room-day', { dayDisplay: 'grid' as 'grid' | 'list' }))
function chooseDate(value: string) {
  if (validDate(value)) chosenDate.value = value === today.value ? '' : value
}
function moveDate(offset: number) {
  chooseDate(addPeriod(selectedDate.value, offset, 'day'))
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { today.value = todayDate() }, 15_000) })
onBeforeUnmount(() => clearInterval(timer))

const planningRange = ref<TaskDateRange>()
const range = computed(() => view.value === 'today' ? { start: selectedDate.value, end: selectedDate.value } : planningRange.value)
const createDate = computed(() => view.value === 'today' ? selectedDate.value
  : planningRange.value?.start === planningRange.value?.end ? planningRange.value?.start || today.value : today.value)
const { accountKey, query, bookings } = useMeetingRoomBookings(range)
const schedule = computed(() => meetingRoomSchedule(bookings.value))
const entries = computed(() => bookings.value.map(meetingRoomPlanningEntry))
const clock = useMeetingRoomClock()
const formSeed = ref<MeetingRoomFormSeed>({ date: today.value, start: meetingRoomOpens, end: '11:00', title: '', notes: '' })
const formOpen = ref(false)
const opened = ref<MeetingRoomBooking | null>(null)
const editing = ref<MeetingRoomBooking | null>(null)
const confirmDelete = ref(false)
const operation = ref<'save' | 'move' | 'delete' | 'download' | ''>('')
const error = ref('')
const linkError = ref('')
const formId = useId()
let session = 0
watch(() => auth.user?.id, () => {
  session++
  formOpen.value = false
  opened.value = null
  editing.value = null
  confirmDelete.value = false
  operation.value = ''
  error.value = ''
})
watch([() => route.query.booking, () => auth.user?.id], async ([id, user], _, onCleanup) => {
  linkError.value = ''
  if (typeof id !== 'string' || !user) return
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(id)) {
    linkError.value = 'Некорректная ссылка на бронь.'
    return
  }
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  try {
    const booking = await sharedRequest<MeetingRoomBooking>(`/api/meeting-room/${id}`, { signal: controller.signal })
    if (controller.signal.aborted) return
    chooseDate(booking.date)
    showEntry(booking)
  } catch (failure) {
    if (!controller.signal.aborted) linkError.value = message(failure, 'Не удалось открыть бронь.')
  }
}, { immediate: true })

function clearBookingLink() {
  if (!Object.hasOwn(route.query, 'booking')) return
  const query = { ...route.query }
  delete query.booking
  void navigateTo({ path: route.path, query }, { replace: true })
}

function openCreate(date: string, start = meetingRoomOpens, end = '11:00') {
  formSeed.value = { date, start, end, title: '', notes: '' }
  error.value = ''
  editing.value = null
  formOpen.value = true
}

function openEntry(entry: { id: string }) {
  const booking = bookings.value.find(booking => booking.id === entry.id)
  if (booking) showEntry(booking)
}

function showEntry(booking: MeetingRoomBooking) {
  opened.value = booking
  confirmDelete.value = false
  error.value = ''
}

function closeEntry() {
  opened.value = null
  clearBookingLink()
}

function openEdit() {
  const booking = opened.value
  if (!booking?.canEdit || operation.value) return
  closeEntry()
  editing.value = booking
  formSeed.value = { date: booking.date, start: booking.start, end: booking.end, title: booking.title, notes: booking.notes }
  error.value = ''
  formOpen.value = true
}

function message(failure: unknown, fallback: string) {
  return (failure as { data?: { message?: string } })?.data?.message || fallback
}

async function saveBooking(payload: MeetingRoomFormInput, file?: File) {
  if (operation.value) return
  error.value = ''
  const existing = editing.value
  const attempt = session
  const key = accountKey.value
  operation.value = 'save'
  try {
    await writeMeetingRoomBooking(payload, existing?.id, file)
    if (attempt !== session) return
    formOpen.value = false
    if (view.value === 'today') chooseDate(payload.date)
    toast.add({ title: existing ? 'Бронь обновлена' : 'Бронь создана', color: 'success' })
  } catch (failure) {
    if (attempt === session) error.value = message(failure, 'Не удалось сохранить бронь.')
  } finally {
    if (attempt === session) {
      await client.invalidateQueries({ queryKey: key })
      if (attempt === session) operation.value = ''
    }
  }
}

async function moveBooking(entry: MeetingRoomPlanningEntry, start: string, end: string) {
  const booking = bookings.value.find(item => item.id === entry.id)
  if (operation.value || !booking?.canEdit || booking.revision !== entry.revision) {
    throw new Error('Бронь уже изменилась. Попробуйте ещё раз.')
  }
  const attempt = session
  const key = accountKey.value
  operation.value = 'move'
  try {
    await writeMeetingRoomBooking({
      date: booking.date, start, end, title: booking.title, notes: booking.notes,
      participantIds: booking.participants.map(person => person.id), revision: booking.revision
    }, booking.id)
    if (attempt === session) toast.add({ title: 'Время брони изменено', color: 'success' })
  } catch (failure) {
    if (attempt === session) throw new Error(message(failure, 'Не удалось перенести бронь.'))
  } finally {
    if (attempt === session) {
      await client.invalidateQueries({ queryKey: key })
      if (attempt === session) operation.value = ''
    }
  }
}

async function deleteBooking() {
  const booking = opened.value
  if (!booking?.canDelete || operation.value) return
  const attempt = session
  const key = accountKey.value
  operation.value = 'delete'
  error.value = ''
  try {
    await sharedRequest(`/api/meeting-room/${booking.id}`, { method: 'DELETE' })
    if (attempt !== session) return
    closeEntry()
    toast.add({ title: 'Бронь удалена', color: 'success' })
  } catch (failure) {
    if (attempt === session) error.value = message(failure, 'Не удалось удалить бронь.')
  } finally {
    if (attempt === session) {
      await client.invalidateQueries({ queryKey: key })
      if (attempt === session) operation.value = ''
    }
  }
}

async function download() {
  const booking = opened.value
  if (!booking?.attachmentName || operation.value) return
  const attempt = session
  operation.value = 'download'
  error.value = ''
  try {
    const blob = await sharedRequest<Blob>(`/api/meeting-room/${booking.id}/file`, { responseType: 'blob' })
    if (attempt === session) await saveFile(blob, booking.attachmentName)
  } catch (failure) {
    if (attempt === session) error.value = message(failure, 'Не удалось скачать вложение.')
  } finally {
    if (attempt === session) operation.value = ''
  }
}
</script>

<template>
  <section class="min-w-0">
    <header class="projects-heading">
      <h1>Переговорная комната<span class="title-dot">.</span></h1>
      <UButton label="Добавить бронь" icon="i-lucide-plus" :disabled="!!operation" @click="openCreate(createDate)" />
    </header>

    <UAlert v-if="linkError" color="error" :description="linkError" class="mb-4" />
    <div v-if="view === 'today'" class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <UButton color="neutral" variant="outline" icon="i-lucide-chevron-left" aria-label="Предыдущий день" @click="moveDate(-1)" />
        <UButton color="neutral" variant="outline" label="Сегодня" @click="chosenDate = ''" />
        <UButton color="neutral" variant="outline" icon="i-lucide-chevron-right" aria-label="Следующий день" @click="moveDate(1)" />
        <SharedDatePicker :model-value="selectedDate" :clearable="false" aria-label="Выбрать день расписания" class="w-36" @update:model-value="chooseDate" />
      </div>
      <div class="flex gap-2" role="group" aria-label="Вид расписания">
        <UButton label="Сетка" icon="i-lucide-layout-grid" color="neutral" :variant="dayDisplay === 'grid' ? 'soft' : 'outline'" :aria-pressed="dayDisplay === 'grid'" @click="dayDisplay = 'grid'" />
        <UButton label="Список" icon="i-lucide-list" color="neutral" :variant="dayDisplay === 'list' ? 'soft' : 'outline'" :aria-pressed="dayDisplay === 'list'" @click="dayDisplay = 'list'" />
      </div>
    </div>

    <UAlert v-if="query.error.value" color="error" title="Не удалось загрузить расписание"
      :actions="[{ label: 'Повторить', onClick: () => query.refetch() }]" class="mb-4" />
    <p v-else-if="query.isPending.value" class="mb-4 text-sm text-muted" role="status">Загружаем расписание…</p>

    <section v-if="view === 'today' && query.data.value">
      <h2 class="mb-4 text-lg font-semibold">{{ dateLabel(selectedDate) }}</h2>
      <ol v-if="dayDisplay === 'list' && bookings.length" class="divide-y divide-default rounded-xl border border-default bg-default">
        <li v-for="booking in bookings" :key="booking.id">
          <button type="button" :class="{ 'completed-booking': meetingRoomCompleted(booking.date, booking.end, clock) }" class="grid w-full gap-2 px-4 py-3 text-left hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary sm:grid-cols-[7rem_minmax(0,1fr)_minmax(9rem,1fr)] sm:items-center"
            :disabled="!!operation" @click="openEntry(booking)">
            <span class="text-sm tabular-nums text-muted">{{ booking.start }}–{{ booking.end }}</span>
            <span class="text-sm font-medium wrap-anywhere">{{ booking.title }}</span>
            <Organizer :person="booking.organizer" />
          </button>
        </li>
      </ol>
      <p v-else-if="dayDisplay === 'list'" class="rounded-xl border border-default bg-default p-4 text-sm text-muted">На этот день броней нет.</p>
      <ol v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="slot in schedule" :key="slot.start" class="min-w-0">
          <button v-if="!slot.bookings.length" type="button"
            class="flex h-full min-h-28 w-full flex-col justify-between gap-3 rounded-xl border border-default bg-default p-4 text-left transition-colors hover:border-primary hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-60"
            :aria-label="`Забронировать ${slot.start}–${slot.end}`" :disabled="!!operation || !!query.error.value"
            @click="openCreate(selectedDate, slot.start, slot.end)">
            <span class="flex w-full flex-wrap items-center justify-between gap-2">
              <span class="text-base font-semibold tabular-nums">{{ slot.start }}–{{ slot.end }}</span>
              <UBadge variant="subtle" color="success" label="Свободно" />
            </span>
            <span class="flex items-center gap-1.5 text-sm font-medium text-primary">
              <UIcon name="i-lucide-plus" class="size-4" />
              Забронировать
            </span>
          </button>
          <div v-else class="flex h-full min-h-28 flex-col gap-3 rounded-xl border border-default bg-default p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-base font-semibold tabular-nums">{{ slot.start }}–{{ slot.end }}</span>
              <UBadge variant="subtle" color="warning" :label="slot.fullyBooked ? 'Занято' : 'Частично занято'" />
            </div>
            <ul class="grid gap-2">
              <li v-for="booking in slot.bookings" :key="booking.id" class="min-w-0">
                <button type="button" class="grid w-full gap-1 rounded-md p-1 text-left text-sm hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary" :class="{ 'completed-booking': meetingRoomCompleted(booking.date, booking.end, clock) }"
                  :title="booking.title" :disabled="!!operation" @click="openEntry(booking)">
                  <span class="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <span class="text-xs tabular-nums text-muted">{{ booking.start }}–{{ booking.end }}</span>
                    <span class="font-medium wrap-anywhere">{{ booking.title }}</span>
                  </span>
                  <Organizer :person="booking.organizer" />
                </button>
              </li>
            </ul>
            <div v-if="slot.free.length" class="flex flex-wrap gap-2">
              <UButton v-for="interval in slot.free" :key="interval.start" size="xs" color="success" variant="soft" icon="i-lucide-plus"
                :label="`Свободно ${interval.start}–${interval.end}`"
                :disabled="!!operation || !!query.error.value" @click="openCreate(selectedDate, interval.start, interval.end)" />
            </div>
          </div>
        </li>
      </ol>
    </section>
    <ProjectTasksPlanner v-if="view !== 'today'" :mode="view" filter-scope="meeting-room" :tasks="entries"
      bookings can-create :busy="!!operation" :loading="query.isPending.value || !!query.error.value" :move-booking="moveBooking"
      @range-change="planningRange = $event" @create="openCreate" @open="openEntry" />

    <UModal v-model:open="formOpen" :title="editing ? 'Редактировать бронь' : 'Новая бронь'" description="Укажите время встречи по Москве." :dismissible="!operation" :close="!operation">
      <template #body>
        <BookingFields v-if="formOpen" :form-id="formId" :seed="formSeed" :editing="editing" :busy="!!operation"
          :error="error" @submit="saveBooking" />
      </template>
      <template #footer>
        <UButton label="Отмена" color="neutral" variant="outline" :disabled="!!operation" @click="formOpen = false" />
        <UButton type="submit" :form="formId" :label="editing ? 'Сохранить изменения' : 'Забронировать'" :loading="operation === 'save'" />
      </template>
    </UModal>

    <UModal :open="!!opened" :title="opened?.title || 'Бронь'" :description="opened ? `${dateLabel(opened.date)} · ${opened.start}–${opened.end} МСК` : undefined"
      :dismissible="!operation" :close="!operation" @update:open="value => { if (!value) closeEntry() }">
      <template #body>
        <div v-if="opened" class="grid gap-4 text-sm">
          <dl class="grid gap-3">
            <div>
              <dt class="mb-1 font-medium">Организатор</dt>
              <dd>
                <NuxtLink v-if="opened.organizer" :to="`/team/${opened.organizer.id}`" class="underline-offset-2 hover:underline"><Organizer :person="opened.organizer" /></NuxtLink>
                <Organizer v-else :person="null" />
              </dd>
            </div>
            <div v-if="opened.participants.length">
              <dt class="mb-1 font-medium">Участники</dt>
              <dd><ul class="flex flex-wrap gap-2">
                <li v-for="person in opened.participants" :key="person.id">
                  <UButton :to="`/team/${person.id}`" :label="person.name" icon="i-lucide-at-sign" variant="soft" size="xs" />
                </li>
              </ul></dd>
            </div>
            <div v-if="opened.notes">
              <dt class="mb-1 font-medium">Описание</dt>
              <dd class="whitespace-pre-wrap break-words">{{ opened.notes }}</dd>
            </div>
            <div v-if="opened.attachmentName">
              <dt class="mb-1 font-medium">Вложение</dt>
              <dd><UButton :label="opened.attachmentName" icon="i-lucide-download" color="neutral" variant="outline"
                :loading="operation === 'download'" :disabled="!!operation" class="max-w-full break-all text-left" @click="download" /></dd>
            </div>
          </dl>
          <p v-if="confirmDelete">Удалить эту бронь и освободить время?</p>
          <UAlert v-if="error" color="error" :description="error" />
        </div>
      </template>
      <template v-if="opened?.canDelete" #footer>
        <UButton v-if="!confirmDelete && opened.canEdit" label="Редактировать" icon="i-lucide-pencil" color="neutral" variant="outline" :disabled="!!operation" @click="openEdit" />
        <UButton v-if="confirmDelete" label="Отмена" color="neutral" variant="outline" :disabled="!!operation" @click="confirmDelete = false" />
        <UButton label="Удалить бронь" icon="i-lucide-trash-2" color="error" :variant="confirmDelete ? 'solid' : 'outline'"
          :loading="operation === 'delete'" :disabled="!!operation" @click="confirmDelete ? deleteBooking() : confirmDelete = true" />
      </template>
    </UModal>
  </section>
</template>

<style scoped>
.completed-booking{background:color-mix(in srgb,var(--ui-success) 12%,var(--ui-bg))}
</style>
