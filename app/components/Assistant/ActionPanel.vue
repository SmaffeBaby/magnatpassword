<script setup lang="ts">
import type { AssistantAction, AssistantContext } from '~~/shared/types/assistant'
import type { KabanBlock } from '~~/shared/types/kaban'
import TaskField from './TaskField.vue'
import { kabanBlockSummary } from '~~/shared/utils/kaban'
const props = defineProps<{ action: AssistantAction; context: AssistantContext | null; files: File[]; projectId: string; vaultId: string; contextBusy: boolean }>()
const emit = defineEmits<{ done: [message: string]; cancel: []; uploaded: [file: File]; message: [message: string]; refresh: []; vault: [id: string]; project: [id: string] }>()
let active = true
const requestController = new AbortController()
onBeforeUnmount(() => { active = false; requestController.abort() })
const auth = useAuthStore(), busy = ref(false), error = ref('')
const taskId = ref(''), stageId = ref(''), categoryIds = ref<string[]>([]), participantIds = ref<string[]>([]), closerIds = ref<string[]>([])
const title = ref(''), dueOn = ref(''), blocks = ref<KabanBlock[]>([]), revision = ref(0)
const targetId = ref(''), uploadRevision = ref<number | undefined>()
const board = computed(() => !props.contextBusy && (props.context?.kaban?.board.vaultId || 'personal') === props.vaultId ? props.context?.kaban : undefined)
const vaultOptions = computed(() => props.context?.vaults.map(vault => ({ label: vault.name, value: vault.id, disabled: vault.canEdit === false })) || [])
const projectOptions = computed(() => [{ label: 'Без проекта', value: '' }, ...(props.context?.projects.map(project => ({ label: project.name, value: project.id })) || [])])
const task = computed(() => board.value?.tasks.find(task => task.id === taskId.value))
const creating = computed(() => props.action.kind === 'create_task')
const planningAllowed = computed(() => creating.value || task.value?.creatorId === auth.user?.id)
const editable = computed(() => !!board.value?.canEdit && (creating.value || task.value?.canEdit))
const target = computed(() => props.contextBusy ? undefined : props.context?.uploadTargets.find(target => target.id === targetId.value))
const taskOptions = computed(() => board.value?.tasks.filter(task => task.canEdit && !task.archived).map(task => ({ label: task.title, value: task.id })) || [])
const categoryOptions = computed(() => board.value?.categories.filter(category => !category.archived && (board.value?.categoryIds === null || board.value?.categoryIds.includes(category.id))).map(category => ({ label: category.name, value: category.id })) || [])
const stageOptions = computed(() => board.value?.board.stages.map(stage => ({ label: stage.name, value: stage.id, disabled: stage.done && !creating.value && !planningAllowed.value && !task.value?.closerIds.includes(auth.user?.id || '') })) || [])
const peopleOptions = computed(() => board.value?.people.filter(person => board.value?.eligibleIds.includes(person.id)).map(person => ({ label: person.fullName, value: person.id })) || [])
const fileTargets = computed(() => props.context?.uploadTargets.map(target => ({ label: target.label, value: target.id })) || [])
const fieldTypes = [{ label: 'Описание', value: 'description' }, { label: 'Ссылка', value: 'link' }, { label: 'Чек-лист', value: 'todo' }, { label: 'Пароль', value: 'password' }, { label: 'Вложения', value: 'files' }]
const categoryName = ref('')
async function createCategory() {
  if (!editable.value || !board.value?.canManage || !categoryName.value.trim() || busy.value) return
  busy.value = true; error.value = ''
  try {
    const result = await sharedRequest<{ id: string }>('/api/kaban/categories', { method: 'POST', signal: requestController.signal, body: { boardId: board.value.board.id, revision: 0, data: { name: categoryName.value, color: '#6366f1', parentId: null } } })
    if (!active) return
    categoryIds.value = [result.id]; categoryName.value = ''; emit('refresh')
  } catch (failure: any) { if (active) error.value = failure?.data?.message || 'Не удалось создать категорию.' }
  finally { busy.value = false }
}
const newField = ref<KabanBlock['type']>('description')
function addField() {
  const id = crypto.randomUUID(), type = newField.value, name = fieldTypes.find(field => field.value === type)!.label
  blocks.value.push(type === 'description' || type === 'link' ? { id, type, title: name, value: '' } : type === 'todo' ? { id, type, title: name, items: [] } : type === 'password' ? { id, type, title: name, vaultId: 'personal', entryId: '' } : { id, type, title: name })
}
function fillTask() {
  const value = task.value
  title.value = value?.title || props.action.title
  dueOn.value = value?.dueOn || props.action.dueOn
  revision.value = value?.revision || 0
  stageId.value = value?.stageId || board.value?.board.stages.find(stage => !stage.done)?.id || ''
  categoryIds.value = value ? [...value.categoryIds] : []
  participantIds.value = value ? [...value.participantIds] : []
  closerIds.value = value ? [...value.closerIds] : []
  blocks.value = JSON.parse(JSON.stringify(value?.blocks || []))
  if (props.action.kind === 'edit_task' && props.action.title) title.value = props.action.title
  if (props.action.description && props.action.kind !== 'move_task') {
    const first = blocks.value.find(block => block.type === 'description')
    if (first?.type === 'description') first.value = props.action.description
    else blocks.value.push({ id: crypto.randomUUID(), type: 'description', title: 'Описание', value: props.action.description })
  }
  if (props.action.dueOn && planningAllowed.value) dueOn.value = props.action.dueOn
  const stage = board.value?.board.stages.filter(stage => stage.name.toLocaleLowerCase('ru') === props.action.stageName.toLocaleLowerCase('ru'))
  if (stage?.length === 1) stageId.value = stage[0]!.id
}
watch(taskId, fillTask)
watch(() => props.action, () => {
  const matches = taskOptions.value.filter(task => props.action.taskName && task.label.toLocaleLowerCase('ru') === props.action.taskName.toLocaleLowerCase('ru'))
  taskId.value = creating.value ? '' : matches.length === 1 ? matches[0]!.value : ''
  fillTask()
  if (fileTargets.value.length === 1) targetId.value = fileTargets.value[0]!.value
}, { immediate: true })
watch(() => props.context, () => { if (!target.value) targetId.value = '' })
watch(() => props.context?.kaban?.board.id, (id, previous) => {
  if (!id || id === previous) return
  taskId.value = ''; categoryIds.value = []; participantIds.value = []; closerIds.value = []; revision.value = 0
  stageId.value = board.value?.board.stages.find(stage => !stage.done)?.id || ''
  if (!creating.value) fillTask()
})
watch(target, value => { uploadRevision.value = value?.revision })
async function saveTask() {
  if (!editable.value || busy.value) return
  error.value = ''; busy.value = true
  try {
    const result = await sharedRequest<{ message: string }>('/api/assistant/action', { method: 'POST', signal: requestController.signal, body: { operation: props.action.kind, ...(creating.value ? {} : { taskId: taskId.value }), boardId: board.value!.board.id, stageId: stageId.value, categoryIds: categoryIds.value, participantIds: participantIds.value, closerIds: closerIds.value, revision: revision.value, data: { title: title.value, dueOn: dueOn.value, blocks: blocks.value, ...kabanBlockSummary(blocks.value) } } })
    if (active) emit('done', result.message)
  } catch (failure: any) { error.value = failure?.data?.message || 'Не удалось сохранить задачу.' }
  finally { busy.value = false }
}
async function upload() {
  const destination = target.value
  if (!destination || busy.value) return
  busy.value = true; error.value = ''
  try {
    for (const file of [...props.files]) {
      if (!active) return
      const body = new FormData(); body.append('file', file); body.append('targetId', destination.id); body.append('vaultId', props.vaultId || 'personal')
      if (props.projectId) body.append('projectId', props.projectId)
      if (uploadRevision.value !== undefined) body.append('revision', String(uploadRevision.value))
      const result = await sharedRequest<{ message: string; revision?: number }>('/api/assistant/upload', { method: 'POST', signal: requestController.signal, body })
      if (!active) return
      if (result.revision !== undefined) uploadRevision.value = result.revision
      emit('uploaded', file); emit('message', result.message)
    }
    emit('done', 'Все выбранные файлы прикреплены.')
  } catch (failure: any) { error.value = failure?.data?.message || 'Не удалось прикрепить файл. Уже загруженные файлы сохранены.' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="assistant-action" aria-label="Подготовленное действие">
    <header><strong>{{ action.kind === 'attach_files' ? 'Прикрепить файлы' : creating ? 'Новая задача Кабана' : action.kind === 'move_task' ? 'Переместить задачу' : 'Изменить задачу' }}</strong><UButton icon="i-lucide-x" aria-label="Отменить действие" color="neutral" variant="ghost" :disabled="busy" @click="emit('cancel')" /></header>
    <UFormField label="Хранилище Кабана"><USelect :model-value="vaultId" :items="vaultOptions" placeholder="Выберите хранилище" class="w-full" :disabled="busy || contextBusy" @update:model-value="emit('vault', String($event))" /></UFormField>
    <template v-if="action.kind === 'attach_files'">
      <UFormField label="Проект"><USelect :model-value="projectId" :items="projectOptions" class="w-full" :disabled="busy || contextBusy" @update:model-value="emit('project', String($event))" /></UFormField>
      <p>Куда прикрепить файлы? Выберите договор, карточку входных данных или поле вложений задачи.</p>
      <USelectMenu v-model="targetId" :items="fileTargets" value-key="value" placeholder="Куда прикрепить файлы" aria-label="Место прикрепления файлов" class="w-full" :disabled="busy || contextBusy" />
      <p v-if="!fileTargets.length && !contextBusy">Здесь нет доступных мест загрузки. Создайте договор, карточку входных данных или задачу с правом редактирования.</p>
      <p v-if="!files.length">Добавьте файлы скрепкой или перетащите их в чат.</p>
      <UButton label="Прикрепить выбранные файлы" icon="i-lucide-upload" :loading="busy" :disabled="!target || !files.length || busy" @click="upload" />
    </template>
    <form v-else class="space-y-4" @submit.prevent="saveTask">
      <p v-if="!board?.canEdit && !contextBusy">В выбранном хранилище нет права редактирования задач.</p>
      <UFormField v-if="!creating" label="Задача" required><USelectMenu v-model="taskId" :items="taskOptions" value-key="value" placeholder="Выберите задачу" class="w-full" :disabled="busy" /></UFormField>
      <UFormField label="Название" required><UInput v-model="title" class="w-full" :maxlength="200" :disabled="!editable || busy || action.kind === 'move_task'" /></UFormField>
      <UFormField label="Стадия" required><USelect v-model="stageId" :items="stageOptions" class="w-full" :disabled="!editable || busy" /></UFormField>
      <template v-if="action.kind !== 'move_task'">
        <UFormField label="Категории" required><USelectMenu v-model="categoryIds" :items="categoryOptions" value-key="value" multiple class="w-full" :disabled="!editable || busy" /></UFormField>
        <div v-if="!categoryOptions.length && board?.canManage" class="flex gap-2"><UInput v-model="categoryName" placeholder="Название первой категории" :maxlength="60" :disabled="busy" /><UButton label="Создать категорию" color="neutral" variant="outline" :disabled="busy || !categoryName.trim()" @click="createCategory" /></div><p v-else-if="!categoryOptions.length" class="text-sm text-muted">Сначала создайте доступную категорию на доске Кабана.</p>
        <UFormField label="Срок"><UInput v-model="dueOn" type="date" class="w-full" :disabled="!planningAllowed || !editable || busy" /></UFormField>
        <UFormField label="Ответственные"><USelectMenu v-model="participantIds" :items="peopleOptions" value-key="value" multiple class="w-full" :disabled="!planningAllowed || !editable || busy" /></UFormField>
        <p v-if="!planningAllowed" class="text-sm text-muted">Срок и ответственных меняет только создатель задачи.</p>
        <TaskField v-for="field in blocks" :key="field.id" :field="field" :disabled="!editable || busy" :passwords="context?.relations.map(row => ({ label: `${row.title} · ${row.vault}`, value: row.key })) || []" @remove="blocks = blocks.filter(item => item.id !== field.id)" />
        <div class="flex gap-2"><USelect v-model="newField" :items="fieldTypes" :disabled="!editable || busy" /><UButton label="Добавить поле" variant="outline" color="neutral" :disabled="!editable || busy || blocks.length >= 40" @click="addField" /></div>
      </template>
      <UButton type="submit" :label="creating ? 'Создать задачу' : action.kind === 'move_task' ? 'Переместить' : 'Сохранить изменения'" :loading="busy" :disabled="!editable || !title.trim() || !stageId || !categoryIds.length || busy" />
    </form>
    <UAlert v-if="error" color="error" :description="error" />
  </section>
</template>
<style scoped>
.assistant-action{padding:20px;border:1px solid var(--ui-border);border-radius:18px;display:flex;flex-direction:column;gap:16px;background:var(--ui-bg)}.assistant-action header{display:flex;align-items:center;justify-content:space-between;gap:12px}.assistant-action p{font-size:13px;line-height:1.7;color:var(--ui-text-muted)}.assistant-field{padding:12px;border:1px solid var(--ui-border);border-radius:12px;display:flex;flex-direction:column;gap:10px}
</style>
