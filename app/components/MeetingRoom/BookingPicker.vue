<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import BookingFields from './BookingFields.vue'
import type { MeetingRoomFormInput, MeetingRoomFormSeed, MeetingRoomReference } from '~~/shared/types/meeting-room'
import { meetingRoomOpens } from '~~/shared/utils/meeting-room'
import { dateLabel, todayDate, validDate } from '~~/shared/utils/subscriptions'

const props = defineProps<{ portal?: HTMLElement; allowCreate?: boolean }>()
const emit = defineEmits<{ close: []; choose: [booking: MeetingRoomReference] }>()
const client = useQueryClient()
const mode = ref<'attach' | 'create'>('attach')
const date = ref(todayDate())
const seed = computed<MeetingRoomFormSeed>(() => ({ date: date.value, start: meetingRoomOpens, end: '11:00', title: '', notes: '' }))
const range = computed(() => mode.value === 'attach' ? { start: date.value, end: date.value } : undefined)
const { accountKey, query, bookings } = useMeetingRoomBookings(range)
const error = ref('')
const busy = ref(false)
const formId = useId()
function choose(booking: MeetingRoomReference) {
  emit('choose', { id: booking.id, title: booking.title, date: booking.date, start: booking.start, end: booking.end })
  emit('close')
}
async function create(input: MeetingRoomFormInput, file?: File) {
  if (busy.value || !props.allowCreate) return
  busy.value = true
  error.value = ''
  const key = accountKey.value
  try {
    const { id } = await writeMeetingRoomBooking(input, undefined, file)
    if (key[1] !== accountKey.value[1]) return
    choose({ id, ...input })
    void client.invalidateQueries({ queryKey: key })
  } catch (failure) {
    error.value = (failure as { data?: { message?: string } })?.data?.message || 'Не удалось создать бронь.'
  } finally { busy.value = false }
}
</script>

<template>
  <UModal :open="true" :portal="portal ?? true" :dismissible="!busy" :close="!busy" title="Переговорная комната"
    :description="mode === 'create' ? 'Бронь сохранится в переговорной и добавится в черновик сообщения.' : 'Выберите бронь на нужную дату.'"
    @update:open="value => { if (!value) emit('close') }">
    <template #body>
      <div class="grid gap-4">
        <div v-if="allowCreate" class="flex flex-wrap gap-2">
          <UButton label="Прикрепить бронь" color="neutral" :variant="mode === 'attach' ? 'soft' : 'outline'" :disabled="busy" @click="mode = 'attach'" />
          <UButton label="Создать бронь" color="neutral" :variant="mode === 'create' ? 'soft' : 'outline'" :disabled="busy" @click="mode = 'create'" />
        </div>
        <BookingFields v-if="mode === 'create'" :form-id="formId" :seed="seed" :busy="busy" :error="error" @submit="create" />
        <template v-else>
          <SharedDatePicker :model-value="date" :clearable="false" aria-label="Дата брони" class="w-36"
            @update:model-value="value => { if (validDate(value)) date = value }" />
          <p v-if="query.isPending.value" class="text-sm text-muted">Загружаем брони…</p>
          <UAlert v-else-if="query.error.value" color="error" title="Не удалось загрузить брони"
            :actions="[{ label: 'Повторить', onClick: () => query.refetch() }]" />
          <p v-else-if="!bookings.length" class="text-sm text-muted">На {{ dateLabel(date) }} броней нет.</p>
          <ul v-else class="max-h-80 space-y-2 overflow-auto">
            <li v-for="booking in bookings" :key="booking.id">
              <button type="button" class="flex w-full items-center gap-3 rounded-lg border border-default p-3 text-left hover:bg-elevated" @click="choose(booking)">
                <UIcon name="i-lucide-calendar-clock" class="shrink-0 text-muted" />
                <span class="min-w-0 flex-1 text-sm font-medium wrap-anywhere">{{ booking.title }}</span>
                <span class="shrink-0 text-xs tabular-nums text-muted">{{ booking.start }}–{{ booking.end }}</span>
              </button>
            </li>
          </ul>
        </template>
      </div>
    </template>
    <template v-if="mode === 'create'" #footer>
      <UButton type="submit" :form="formId" label="Создать и прикрепить" :loading="busy" />
    </template>
  </UModal>
</template>
