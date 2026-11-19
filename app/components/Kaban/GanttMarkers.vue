<script setup lang="ts">
import type { GanttMarker, GanttMarkerProject } from '~~/shared/utils/project-task-planning'
import { dateLabel, validDate } from '~~/shared/utils/subscriptions'

const props = defineProps<{ projects: GanttMarkerProject[]; markers: GanttMarker[]; anchor: string }>()
const emit = defineEmits<{ jump: [day: string]; changed: [marker: GanttMarker, deleted: boolean] }>()
const auth = useAuthStore()
const projectsById = computed(() => new Map(props.projects.map(project => [project.id, project])))
const editable = computed(() => props.projects.filter(project => project.canEdit))
const options = computed(() => editable.value.map(project => ({ label: project.name, value: project.id })))
const open = ref(false)
const editing = ref<GanttMarker>()
const confirmingDelete = ref(false)
const busy = ref(false)
const error = ref('')
const formId = useId()
const draft = reactive({ projectId: '', title: '', day: '', color: '#7c3aed' })

function edit(marker?: GanttMarker) {
  editing.value = marker
  confirmingDelete.value = false
  error.value = ''
  Object.assign(draft, {
    projectId: marker?.projectId ?? editable.value[0]?.id ?? '',
    title: marker?.title ?? '',
    day: marker?.day ?? props.anchor,
    color: marker?.color ?? '#7c3aed'
  })
  open.value = true
}

async function save(deleted = false) {
  if (busy.value || !projectsById.value.get(draft.projectId)?.canEdit) return
  const fields = { ...draft, title: draft.title.trim() }
  if (!deleted && (!fields.title || !validDate(fields.day))) {
    error.value = 'Укажите название и дату маркера.'
    return
  }
  const identity = editing.value && { id: editing.value.id, revision: editing.value.revision }
  if (deleted && !identity) return
  const body = deleted ? { action: 'delete', projectId: draft.projectId, ...identity }
    : identity ? { action: 'update', ...fields, ...identity } : { action: 'create', ...fields }
  const account = auth.user?.id
  busy.value = true
  error.value = ''
  try {
    const marker = await sharedRequest<GanttMarker>('/api/kaban/markers', { method: 'POST', body })
    if (account !== auth.user?.id) return
    emit('changed', marker, deleted)
    open.value = false
  } catch (failure) {
    const response = failure as { data?: { message?: string }; statusCode?: number }
    error.value = response.statusCode === 409
      ? 'Маркер уже изменился. Закройте окно и откройте его снова.'
      : response.data?.message || 'Не удалось сохранить изменение.'
  } finally {
    busy.value = false
  }
}
watch(() => auth.user?.id, () => { open.value = false })
</script>

<template>
  <section v-if="markers.length || editable.length" class="marker-panel" aria-label="Маркеры диаграммы Ганта">
    <div class="marker-panel-header">
      <h3>Маркеры</h3>
      <UButton v-if="editable.length" label="Добавить маркер" icon="i-lucide-flag" color="neutral" variant="outline" size="sm" @click="edit()" />
    </div>
    <ul v-if="markers.length" class="marker-list">
      <li v-for="marker in markers" :key="marker.id" class="marker-item">
        <button type="button" class="marker-jump" @click="emit('jump', marker.day)">
          <span class="marker-swatch" :style="{ backgroundColor: marker.color }" aria-hidden="true" />
          <span>{{ marker.title }}<small v-if="projects.length > 1"> · {{ projectsById.get(marker.projectId)?.name }}</small></span>
          <time :datetime="marker.day">{{ dateLabel(marker.day) }}</time>
        </button>
        <UButton v-if="projectsById.get(marker.projectId)?.canEdit" icon="i-lucide-pencil" color="neutral" variant="ghost" size="xs" :aria-label="`Изменить маркер «${marker.title}»`" @click="edit(marker)" />
      </li>
    </ul>
  </section>
  <UModal :open="open" :title="editing ? 'Изменить маркер' : 'Добавить маркер'" description="Маркер отмечает выбранную дату на диаграмме Ганта." :dismissible="!busy" :close="!busy" @update:open="value => { if (!busy) open = value }">
    <template #body>
      <form :id="formId" class="grid gap-4" @submit.prevent="save()">
        <UFormField v-if="!editing && projects.length > 1" label="Проект">
          <USelect v-model="draft.projectId" :items="options" class="w-full" :disabled="busy" />
        </UFormField>
        <UFormField label="Название" required>
          <UInput v-model="draft.title" placeholder="Показать проект заказчику" class="w-full" :maxlength="120" :disabled="busy" required />
        </UFormField>
        <div class="flex flex-wrap items-end gap-4">
          <UFormField label="Дата" required>
            <SharedDatePicker v-model="draft.day" :clearable="false" :disabled="busy" />
          </UFormField>
          <UFormField label="Цвет">
            <input v-model="draft.color" type="color" aria-label="Цвет маркера" class="marker-color" :disabled="busy" />
          </UFormField>
        </div>
        <UAlert v-if="error" color="error" :description="error" />
      </form>
    </template>
    <template #footer>
      <UButton v-if="editing" :label="confirmingDelete ? 'Подтвердить удаление' : 'Удалить'" color="error" variant="ghost" :disabled="busy" @click="confirmingDelete ? save(true) : confirmingDelete = true" />
      <UButton label="Отмена" color="neutral" variant="outline" class="ms-auto" :disabled="busy" @click="open = false" />
      <UButton type="submit" :form="formId" label="Сохранить" :loading="busy" :disabled="!projectsById.get(draft.projectId)?.canEdit" />
    </template>
  </UModal>
</template>

<style scoped>
.marker-panel{display:grid;gap:8px;padding:10px 16px;border:1px solid var(--ui-border);border-radius:12px;background:var(--ui-bg)}
.marker-panel-header,.marker-list,.marker-item,.marker-jump{display:flex;align-items:center;gap:8px}
.marker-panel-header{justify-content:space-between;flex-wrap:wrap}
.marker-panel-header h3{font-size:13px;font-weight:650}
.marker-list{flex-wrap:wrap;max-height:9rem;overflow:auto}
.marker-item{min-width:0;max-width:100%;padding:0 4px 0 8px;border:1px solid var(--ui-border);border-radius:8px;background:var(--ui-bg-muted);gap:2px}
.marker-jump{min-width:0;min-height:28px;text-align:left;font-size:12px;overflow-wrap:anywhere}
.marker-jump:hover>span:nth-child(2){text-decoration:underline;text-underline-offset:2px}
.marker-jump time,.marker-jump small{color:var(--ui-text-muted);font-size:11px}
.marker-jump time{flex-shrink:0}
.marker-swatch{width:8px;height:8px;border-radius:50%;flex-shrink:0;border:1px solid rgb(0 0 0 / 15%)}
.marker-color{display:block;width:44px;height:32px;padding:3px;border:1px solid var(--ui-border);border-radius:6px;cursor:pointer}
</style>
