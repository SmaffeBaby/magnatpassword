<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import Organizer from './Organizer.vue'
import type { MeetingRoomBooking } from '~~/shared/types/meeting-room'
import { meetingRoomCompleted } from '~~/shared/utils/meeting-room'
import { dateLabel } from '~~/shared/utils/subscriptions'

const props = defineProps<{ bookingId: string }>()
const auth = useAuthStore()
const clock = useMeetingRoomClock()
const booking = useQuery({
  queryKey: computed(() => ['account', auth.user?.id, 'meeting-room', props.bookingId] as const),
  enabled: computed(() => !!auth.user && !!props.bookingId),
  queryFn: ({ queryKey: [, , , id], signal }) => sharedRequest<MeetingRoomBooking>(`/api/meeting-room/${id}`, { signal }),
  refetchInterval: 30_000,
  retry: false
})
</script>

<template>
  <div class="space-booking-card" :class="{ completed: booking.data.value && meetingRoomCompleted(booking.data.value.date, booking.data.value.end, clock) }">
    <UIcon name="i-lucide-calendar-clock" class="size-5 text-primary" />
    <template v-if="booking.data.value">
      <h3 class="font-semibold wrap-anywhere">{{ booking.data.value.title }}</h3>
      <p class="text-xs text-muted">{{ dateLabel(booking.data.value.date) }} · {{ booking.data.value.start }}–{{ booking.data.value.end }}</p>
      <Organizer :person="booking.data.value.organizer" />
      <LayoutServiceTabLink :to="{ path: '/meeting-room', query: { booking: bookingId } }" class="text-xs text-primary" @pointerdown.stop>
        Открыть бронь ↗
      </LayoutServiceTabLink>
    </template>
    <p v-else class="text-sm text-muted">{{ booking.isLoading.value ? 'Загружаем бронь…' : 'Бронь недоступна' }}</p>
  </div>
</template>

<style scoped>
.space-booking-card{display:grid;justify-items:start;gap:8px;min-width:0}
.space-booking-card.completed{border-left:3px solid var(--ui-success);padding-left:10px}
</style>
