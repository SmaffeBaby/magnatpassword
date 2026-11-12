<script setup lang="ts">
import type { AssistantEdit, AssistantEditTarget } from '~~/shared/types/assistant-edit'
const props = defineProps<{ edit: AssistantEdit; projectId: string; projects: { id: string; name: string }[] }>()
const emit = defineEmits<{ done: [message: string]; cancel: [] }>()
const selectedProject = ref(props.projectId)
watch(() => props.projectId, id => { selectedProject.value = id })
const targets = ref<AssistantEditTarget[]>([]), subscriptions = ref<AssistantEditTarget[]>([])
const targetId = ref(''), fieldId = ref(''), value = ref(props.edit.value), operation = ref<'primary' | 'add' | 'remove'>(/удал|убер|отвяж/iu.test(props.edit.target) ? 'remove' : /добав/iu.test(props.edit.target) ? 'add' : 'primary')
const loading = ref(false), busy = ref(false), error = ref('')
const controller = new AbortController(); onBeforeUnmount(() => controller.abort())
const relation = computed(() => props.edit.kind === 'relation')
const target = computed(() => (relation.value ? subscriptions.value : targets.value).find(t => t.id === targetId.value))
const fields = computed(() => target.value?.fields.map(f => ({ label: f.label, value: f.id })) || [])
const selectedField = computed(() => target.value?.fields.find(f => f.id === fieldId.value))
const options = computed(() => (relation.value ? subscriptions.value : targets.value).map(t => ({ label: t.label, value: t.id })))
function match(rows: AssistantEditTarget[]) {
  const found = rows.filter(t => props.edit.target.toLocaleLowerCase('ru').includes(t.label.split(' · ')[0]!.toLocaleLowerCase('ru')))
  return found.length === 1 ? found[0]!.id : rows.length === 1 ? rows[0]!.id : ''
}
let generation = 0
async function load() {
  const current = ++generation
  loading.value = true; error.value = ''; targetId.value = ''; fieldId.value = ''
  try {
    const data = await sharedRequest<{ targets: AssistantEditTarget[]; subscriptions: AssistantEditTarget[] }>(`/api/assistant/edit-targets?${new URLSearchParams({ kind: props.edit.kind, projectId: selectedProject.value })}`, { signal: controller.signal })
    if (current !== generation) return
    targets.value = data.targets; subscriptions.value = data.subscriptions
    targetId.value = match(relation.value ? data.subscriptions : data.targets)
    if (relation.value) value.value = match(data.targets)
  } catch (e: any) { if (current === generation) error.value = e?.data?.message || 'Не удалось загрузить записи.' }
  finally { if (current === generation) loading.value = false }
}
watch(targetId, () => { fieldId.value = target.value?.fields.find(f => f.id === props.edit.field || f.label.toLocaleLowerCase('ru') === props.edit.field.toLocaleLowerCase('ru') || props.edit.field === 'title' && f.id === 'name')?.id || ''; if (relation.value) fieldId.value = targetId.value.split('/').at(-1)!; else value.value = props.edit.value || selectedField.value?.value || '' })
watch(fieldId, () => { if (!relation.value) value.value = props.edit.value || selectedField.value?.value || '' })
watch(() => [props.edit, selectedProject.value], load, { immediate: true })
async function save() {
  if (!target.value || busy.value) return
  busy.value = true; error.value = ''
  try {
    const id = relation.value ? targetId.value.slice(0, targetId.value.lastIndexOf('/')) : targetId.value
    const result = await sharedRequest<{ message: string }>('/api/assistant/edit', { method: 'POST', signal: controller.signal, body: { kind: props.edit.kind, targetId: id, revision: target.value.revision, field: fieldId.value, value: value.value, ...(relation.value ? { operation: operation.value } : {}) } })
    await useAccountQueries().invalidate('personal', 'workspace', 'projects', 'notifications')
    await useVaultStore().check(); await useSharedVaultsStore().refresh(true)
    emit('done', result.message)
  } catch (e: any) { error.value = e?.data?.message || 'Не удалось сохранить изменение.' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="my-4 space-y-4 rounded-xl border border-default p-5" aria-label="Черновик изменения">
    <div class="flex items-center justify-between"><strong>{{ relation ? 'Связь подписки с паролем' : 'Изменение поля' }}</strong><UButton icon="i-lucide-x" aria-label="Отменить черновик" variant="ghost" color="neutral" :disabled="busy" @click="emit('cancel')" /></div>
    <p class="text-sm text-muted">{{ relation ? 'Выберите подписку, пароль и действие. Существующие оплаты сохраняются.' : 'Изменится только выбранное поле. Остальные данные записи сохраняются.' }}</p>
    <UFormField v-if="edit.kind === 'project'" label="Проект"><USelect v-model="selectedProject" :items="projects.map(p => ({label:p.name,value:p.id}))" placeholder="Выберите проект для работы со сметой и входными данными" class="w-full" :disabled="busy" /></UFormField>
    <UFormField :label="relation ? 'Подписка' : 'Запись'"><USelectMenu v-model="targetId" :items="options" value-key="value" class="w-full" :disabled="loading || busy" placeholder="Выберите запись" /></UFormField>
    <template v-if="relation">
      <UFormField label="Пароль"><USelectMenu v-model="value" :items="targets.map(t => ({ label: t.label, value: t.id }))" value-key="value" class="w-full" :disabled="loading || busy" /></UFormField>
      <UFormField label="Действие"><USelect v-model="operation" :items="[{label:'Назначить основным (заменить прежний)',value:'primary'},{label:'Добавить связанный пароль',value:'add'},{label:'Удалить связь с этим паролем',value:'remove'}]" class="w-full" :disabled="busy" /></UFormField>
    </template>
    <template v-else>
      <UFormField label="Поле"><USelect v-model="fieldId" :items="fields" class="w-full" :disabled="loading || busy" /></UFormField>
      <p v-if="selectedField && !selectedField.secret" class="whitespace-pre-wrap break-words text-sm text-muted">Сейчас: {{ selectedField.value || 'Пусто' }}</p>
      <UFormField label="Новое значение"><UInput v-if="selectedField?.secret" v-model="value" type="password" autocomplete="new-password" class="w-full" :disabled="busy" /><UTextarea v-else v-model="value" class="w-full" :disabled="busy" /></UFormField>
    </template>
    <UAlert v-if="error" :description="error" color="error" />
    <div class="flex gap-2"><UButton label="Сохранить изменение" :loading="busy" :disabled="loading || busy || !target || !fieldId || relation && !value" @click="save" /><UButton label="Обновить записи" variant="outline" color="neutral" :disabled="busy || loading" @click="load" /></div>
  </section>
</template>
