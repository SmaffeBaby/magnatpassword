<script setup lang="ts">
import ProjectTasksPlanner from '~/components/Kaban/ProjectTasksPlanner.vue'
import type { TaskDateRange } from '~~/shared/utils/project-task-planning'
import { meetingRoomPlanningEntry } from '~~/shared/utils/meeting-room'

const props = defineProps<{ mode: 'calendar' | 'gantt'; scope: string; portal?: HTMLElement }>()
const range = ref<TaskDateRange>()
const { query, bookings } = useMeetingRoomBookings(range)
const entries = computed(() => bookings.value.map(meetingRoomPlanningEntry))
const title = computed(() => props.mode === 'calendar' ? 'Календарь броней' : 'Гант броней')
function open(id: string) {
  void useServiceTabsStore().open({ path: '/meeting-room', query: { booking: id } })
}
</script>

<template>
  <section class="grid min-w-0 gap-3" :aria-label="title">
    <header class="flex flex-wrap items-center gap-2">
      <UIcon :name="mode === 'calendar' ? 'i-lucide-calendar-days' : 'i-lucide-chart-gantt'" class="text-primary" />
      <h3 class="min-w-0 flex-1 text-sm font-semibold">{{ title }}</h3>
      <LayoutServiceTabLink :to="{ path: '/meeting-room', query: { view: mode } }" class="text-xs text-primary" @pointerdown.stop>Открыть ↗</LayoutServiceTabLink>
    </header>
    <div class="widget-body" @pointerdown.stop @keydown.stop @wheel.stop @dblclick.stop>
      <UAlert v-if="query.error.value" color="error" title="Не удалось загрузить брони" :actions="[{ label: 'Повторить', onClick: () => query.refetch() }]" />
      <ProjectTasksPlanner :mode="mode" :filter-scope="scope" :tasks="entries" :portal="portal" embedded bookings
        :busy="false" :can-create="false" :loading="query.isPending.value || !!query.error.value"
        @range-change="range = $event" @open="entry => open(entry.id)" />
    </div>
  </section>
</template>

<style scoped>
.widget-body{min-width:0;max-height:calc(var(--board-card-height,420px) - 65px);overflow:auto;overscroll-behavior:contain}
</style>
