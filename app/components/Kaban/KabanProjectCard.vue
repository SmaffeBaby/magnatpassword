<script setup lang="ts">
import type { Project } from '~~/shared/types/projects'
import type { KabanTaskDeadlinePreview } from '~~/shared/types/kaban'
import { projectProfile, projectStatuses } from '~~/shared/utils/project-workspace'
import { dateLabel, validDate } from '~~/shared/utils/subscriptions'
import PersonAvatar from '~/components/Shared/PersonAvatar.vue'
import KabanTaskDeadline from './KabanTaskDeadline.vue'

const props = defineProps<{ project: Project; deadlines?: KabanTaskDeadlinePreview[]; today: string }>()

const boardPath = computed(() => `/projects/${props.project.id}/tasks`)
const profile = computed(() => projectProfile(props.project))
const status = computed(() => projectStatuses.find(item => item.value === profile.value.status))
const statusColors = {
  planned: 'neutral',
  active: 'info',
  paused: 'warning',
  completed: 'success',
  cancelled: 'error'
} as const
const description = computed(() => profile.value.description?.trim())
const manager = computed(() => props.project.members.find(member => member.userId === profile.value.managerId))
const contact = computed(() => manager.value ?? props.project.members.find(member => member.userId === props.project.ownerId))
const contactName = computed(() => contact.value?.fullName || contact.value?.email)
const date = computed(() => {
  if (validDate(profile.value.endOn)) return { label: 'Окончание проекта', value: profile.value.endOn }
  if (validDate(profile.value.startOn)) return { label: 'Начало проекта', value: profile.value.startOn }
  return null
})
</script>

<template>
  <article class="board-card">
    <div class="board-card-top">
      <span class="board-card-icon">
        <img v-if="profile.avatar" :src="profile.avatar" alt="" loading="lazy" decoding="async" />
        <UIcon v-else name="i-lucide-columns-3" aria-hidden="true" />
      </span>
      <UBadge v-if="status" :color="statusColors[profile.status]" variant="soft" size="sm" class="board-card-status" :class="{ 'board-card-paused': profile.status === 'paused' }">
        {{ status.label }}
      </UBadge>
    </div>

    <div class="board-card-heading">
      <h2>{{ project.name }}</h2>
      <p v-if="description">{{ description }}</p>
    </div>

    <dl class="board-card-stats">
      <div>
        <dt><UIcon name="i-lucide-list-checks" aria-hidden="true" />Задачи на доске</dt>
        <dd>{{ project.taskCount ?? '—' }}</dd>
      </div>
      <div>
        <dt><UIcon name="i-lucide-calendar-days" aria-hidden="true" />{{ date?.label ?? 'Срок проекта' }}</dt>
        <dd>
          <time v-if="date" :datetime="date.value">{{ dateLabel(date.value) }}</time>
          <span v-else class="board-card-no-date">Не указан</span>
        </dd>
      </div>
    </dl>

    <div v-if="deadlines?.length" class="board-card-deadlines">
      <h3>Ближайшие задачи</h3>
      <ul>
        <li v-for="task in deadlines" :key="task.id">
          <NuxtLink :to="{ path: boardPath, query: { task: task.id } }" class="board-card-task">
            <span :title="task.title">{{ task.title }}</span>
            <time :datetime="task.dueOn">{{ dateLabel(task.dueOn) }}</time>
            <KabanTaskDeadline :task="task" :today="today" compact class="board-card-task-progress" />
          </NuxtLink>
        </li>
      </ul>
    </div>

    <div class="board-card-footer">
      <div v-if="contactName" class="board-card-contact">
        <PersonAvatar :name="contactName" class="board-card-person" aria-hidden="true" />
        <div>
          <small>{{ manager ? 'Менеджер' : 'Владелец' }}</small>
          <span>{{ contactName }}</span>
        </div>
      </div>
      <NuxtLink :to="boardPath" class="board-card-open" :aria-label="`Открыть доску проекта «${project.name}»`">
        Открыть доску <UIcon name="i-lucide-arrow-up-right" aria-hidden="true" />
      </NuxtLink>
    </div>
  </article>
</template>

<style scoped>
.board-card {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 16px;
  padding: clamp(14px, 3vw, 20px);
  color: var(--ui-text);
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 20px;
  box-shadow: 0 3px 10px -6px rgb(15 23 42 / 20%);
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.board-card:hover {
  border-color: var(--ui-border-accented);
  box-shadow: 0 10px 24px -16px rgb(15 23 42 / 40%);
}
.board-card-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.board-card-icon {
  display: grid;
  flex: 0 0 44px;
  height: 44px;
  overflow: hidden;
  place-items: center;
  border-radius: 13px;
  background: var(--ui-bg-elevated);
  color: var(--ui-text-highlighted);
  font-size: 22px;
}
.board-card-icon img { width: 100%; height: 100%; object-fit: cover; }
.board-card-status { white-space: normal; overflow-wrap: anywhere; }
.board-card-paused { color: var(--color-amber-800); }
:global(.dark) .board-card-paused { color: var(--color-amber-300); }
.board-card-heading { flex: 1; overflow-wrap: anywhere; }
.board-card-heading h2 { color: var(--ui-text-highlighted); font-size: 18px; font-weight: 700; line-height: 1.3; }
.board-card-heading p {
  display: -webkit-box;
  margin-top: 6px;
  overflow: hidden;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.board-card-stats {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--ui-bg-muted);
}
.board-card-stats > div + div { border-inline-start: 1px solid var(--ui-border); padding-inline-start: 10px; }
.board-card-stats dt { display: flex; align-items: baseline; gap: 5px; color: var(--ui-text-muted); font-size: 12px; }
.board-card-stats dt .iconify { align-self: center; flex-shrink: 0; }
.board-card-stats dd { margin-top: 4px; font-size: 14px; font-weight: 650; overflow-wrap: anywhere; }
.board-card-no-date { color: var(--ui-text-muted); font-weight: 500; }
.board-card-deadlines h3 { margin-bottom: 4px; font-size: 12px; font-weight: 650; }
.board-card-deadlines li + li { border-top: 1px solid var(--ui-border); }
.board-card-task {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0;
  border-radius: 4px;
  font-size: 12px;
}
.board-card-task > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.board-card-task time { color: var(--ui-text-muted); white-space: nowrap; }
.board-card-task-progress { grid-column: 1 / -1; }
.board-card-task:hover > span { text-decoration: underline; text-underline-offset: 3px; }
.board-card-task:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 2px; }
.board-card-footer { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; min-height: 32px; font-size: 12px; }
.board-card-contact { display: flex; align-items: center; gap: 7px; min-width: 0; overflow-wrap: anywhere; }
.board-card-contact .board-card-person { width: 30px; height: 30px; border-radius: 9px; font-size: 11px; }
.board-card-contact small { display: block; color: var(--ui-text-muted); font-size: 11px; }
.board-card-open { display: flex; align-items: center; gap: 4px; margin-inline-start: auto; color: var(--ui-text-highlighted); font-weight: 650; }
.board-card-open::after { content: ''; position: absolute; inset: 0; border-radius: 20px; }
.board-card-open:focus-visible { outline: none; }
.board-card-open:focus-visible::after { outline: 2px solid var(--ui-primary); outline-offset: 3px; }
.board-card-open:hover { text-decoration: underline; text-underline-offset: 3px; }
@media (prefers-reduced-motion: reduce) {
  .board-card { transition: none; }
}
</style>
