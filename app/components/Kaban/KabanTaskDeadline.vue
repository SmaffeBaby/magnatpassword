<script setup lang="ts">
import type { KabanTask } from '~~/shared/types/kaban'
import { kabanDeadlineProgress } from '~~/shared/utils/kaban'

const props = defineProps<{
  task: Pick<KabanTask, 'startOn' | 'dueOn' | 'createdAt'> & Partial<Pick<KabanTask, 'archived'>>
  today: string
  done?: boolean
  compact?: boolean
}>()

const deadline = computed(() => props.done || props.task.archived ? null : kabanDeadlineProgress(props.task, props.today))
const dayCount = new Intl.NumberFormat('ru-RU', { style: 'unit', unit: 'day', unitDisplay: 'long' })
const deadlineLabel = computed(() => {
  const days = deadline.value?.daysLeft ?? 0
  if (days < 0) return `Просрочено на ${dayCount.format(-days)}`
  return days === 0 ? 'Срок сегодня' : `Осталось ${dayCount.format(days)}`
})
</script>

<template>
  <div v-if="deadline" class="task-deadline" :class="{ 'task-deadline-compact': compact }" :style="{ '--deadline-color': `hsl(${deadline.hue} 66% 39%)` }">
    <div class="task-deadline-label" aria-hidden="true">
      <span v-if="!compact">До дедлайна</span>
      <strong>{{ deadlineLabel }}</strong>
    </div>
    <div class="task-deadline-track" role="progressbar" aria-label="Время до дедлайна" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="deadline.percent" :aria-valuetext="deadlineLabel">
      <span :style="{ width: `${deadline.percent}%` }" />
    </div>
  </div>
</template>

<style scoped>
.task-deadline{display:grid;gap:5px;margin-top:12px}
.task-deadline-compact{margin-top:0}
.task-deadline-label{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:2px 8px;font-size:11px;color:#64748b}
.task-deadline-compact .task-deadline-label{display:block}
.task-deadline-label strong{color:color-mix(in srgb,var(--deadline-color) 85%,#172332);font-weight:650}
.task-deadline-track{height:5px;border-radius:99px;background:color-mix(in srgb,var(--deadline-color) 13%,#eef2f6);overflow:hidden}
.task-deadline-track>span{display:block;height:100%;border-radius:inherit;background:var(--deadline-color)}
</style>
