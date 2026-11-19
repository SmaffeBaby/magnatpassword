<script setup lang="ts">
import ProjectTasksPlanner from './ProjectTasksPlanner.vue'
import KabanWorkspace from './KabanWorkspace.vue'
import type { KabanTask } from '~~/shared/types/kaban'
import type { KabanTaskFeed } from '~~/shared/utils/kaban-task-feed'
import { kabanCanEditPlanning, kabanTaskBody } from '~~/shared/utils/kaban'
import { kabanProjectPlanningStages, kabanTaskScope } from '~~/shared/utils/kaban-stages'

const props = defineProps<{
  mode: 'calendar' | 'gantt'
  boards: KabanTaskFeed['boards']
  reload: () => Promise<unknown>
}>()
const auth = useAuthStore()
const search = ref(''), busy = ref(false)
const editor = ref<{ projectId: string; id: string; edit: boolean }>()
watch(() => props.mode, () => { editor.value = undefined })
const byBoard = computed(() => new Map(props.boards.map(entry => [entry.workspace.board.id, entry])))
const planProjects = computed(() => props.boards.map(({ project, workspace }) => ({
  boardId: workspace.board.id, name: project.name, startOn: project.profile?.startOn, endOn: project.profile?.endOn
})))
const stages = computed(() => props.boards.flatMap(({ workspace }) =>
  kabanProjectPlanningStages(workspace).map(stage => ({ ...stage, boardId: workspace.board.id }))
))
const categories = computed(() => props.boards.flatMap(({ workspace }) => workspace.categories.filter(category => !category.archived).map(category => ({ ...category, boardId: workspace.board.id }))))
const people = computed(() => [...new Map(props.boards.flatMap(({ workspace }) => workspace.people).map(person => [person.id, person])).values()])
const tasks = computed(() => {
  const tokens = search.value.trim().toLocaleLowerCase('ru').split(/\s+/).filter(Boolean)
  return props.boards.flatMap(({ project, workspace }) => workspace.tasks.filter(task => {
    if (task.archived) return false
    const text = `${task.title} ${task.description} ${project.name}`.toLocaleLowerCase('ru')
    return tokens.every(token => text.includes(token))
  }))
})
function categoryContains(selected: string, ids: string[], boardId: string) {
  if (!selected.startsWith(boardId + ':')) return false
  const id = selected.slice(boardId.length + 1)
  return ids.includes(id) || !!byBoard.value.get(boardId)?.workspace.categories.some(category => category.parentId === id && ids.includes(category.id))
}
function openTask(task: KabanTask, edit = false) {
  const board = byBoard.value.get(task.boardId)
  if (!board) return
  if (props.mode === 'gantt') {
    editor.value = { projectId: board.project.id, id: task.id, edit }
    return
  }
  void navigateTo({ path: `/projects/${board.project.id}/tasks`, query: { view: props.mode, task: task.id } })
}
function canReschedule(task: KabanTask) {
  return !!byBoard.value.get(task.boardId)?.workspace.canEdit && task.canEdit && !task.archived && kabanCanEditPlanning(auth.user?.id, task)
}
async function reschedule(task: KabanTask, startOn: string, dueOn: string) {
  const board = byBoard.value.get(task.boardId)
  if (!board || !canReschedule(task) || busy.value) throw new Error('Даты задачи недоступны для редактирования.')
  busy.value = true
  try {
    const scope = kabanTaskScope(board.workspace, task.categoryIds)
    await sharedRequest(`/api/kaban/tasks/${task.id}`, { method: 'PUT', body: kabanTaskBody({ ...task, startOn, dueOn }, scope) })
  } catch (failure: unknown) {
    const error = failure as { data?: { message?: string }; message?: string }
    throw new Error(error.data?.message || error.message || 'Не удалось изменить даты задачи.')
  } finally {
    try { await props.reload() } finally { busy.value = false }
  }
}
</script>

<template>
  <div class="grid min-w-0 gap-4">
    <UInput v-model="search" icon="i-lucide-search" placeholder="Найти задачу…" aria-label="Поиск задач" class="w-full max-w-md" />
    <ProjectTasksPlanner :mode="mode" :project-boards="planProjects" :tasks="tasks" :stages="stages" :categories="categories" :people="people"
      :marker-projects="boards.map(({project, workspace}) => ({ id: project.id, name: project.name, canEdit: workspace.canEdit }))"
      :category-contains="categoryContains" :can-create="false" :can-reschedule="canReschedule" :reschedule="reschedule" :busy="busy"
      @open="openTask" />
  </div>
  <KabanWorkspace v-if="editor" :key="`${editor.projectId}:${editor.id}`" :project-id="editor.projectId" :editor-task="editor" @editor-closed="editor = undefined" />
</template>
