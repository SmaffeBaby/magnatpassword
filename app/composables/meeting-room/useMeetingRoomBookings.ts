import { useQuery } from '@tanstack/vue-query'
import type { MaybeRefOrGetter } from 'vue'
import type { MeetingRoomBooking } from '~~/shared/types/meeting-room'
import type { TaskDateRange } from '~~/shared/utils/project-task-planning'
import { meetingRoomClock } from '~~/shared/utils/meeting-room'
const runningClocks = new WeakSet<object>()

export function useMeetingRoomBookings(range: MaybeRefOrGetter<TaskDateRange | undefined>) {
  const auth = useAuthStore()
  const accountKey = computed(() => ['account', auth.user?.id, 'meeting-room'] as const)
  const query = useQuery({
    queryKey: computed(() => [...accountKey.value, toValue(range)?.start, toValue(range)?.end] as const),
    enabled: computed(() => !!auth.user && !!toValue(range)),
    queryFn: ({ queryKey: [, , , from, to], signal }) =>
      sharedRequest<MeetingRoomBooking[]>(`/api/meeting-room?from=${from}&to=${to}`, { signal }),
    refetchInterval: 30_000,
    retry: false
  })
  return { accountKey, query, bookings: computed(() => query.data.value ?? []) }
}

export function useMeetingRoomClock() {
  // Share one clock across booking cards, chat messages and embedded planners.
  const clock = useState('meeting-room-clock', () => meetingRoomClock())
  if (import.meta.client) {
    const app = useNuxtApp()
    if (!runningClocks.has(app)) {
      runningClocks.add(app)
      const timer = setInterval(() => { clock.value = meetingRoomClock() }, 15_000)
      app.vueApp.onUnmount(() => { clearInterval(timer); runningClocks.delete(app) })
    }
  }
  return clock
}

export function writeMeetingRoomBooking(payload: object, id?: string, attachment?: File) {
  const body = new FormData()
  body.append('booking', JSON.stringify(payload))
  if (attachment) body.append('file', attachment)
  return sharedRequest<{ id: string }>(id ? `/api/meeting-room/${id}` : '/api/meeting-room', { method: id ? 'PUT' : 'POST', body })
}
