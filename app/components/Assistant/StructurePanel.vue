<script setup lang="ts">
import type { AssistantKabanDraft } from '~~/shared/types/assistant-kaban'
import type { AssistantContext } from '~~/shared/types/assistant'
import type { KabanStage } from '~~/shared/types/kaban'
import { kabanCategoryStages } from '~~/shared/utils/kaban-stages'
import StageFields from '~/components/Kaban/StageFields.vue'
const props = defineProps<{ draft: AssistantKabanDraft; context: AssistantContext | null; vaultId: string; contextBusy: boolean }>()
const emit = defineEmits<{ vault: [id: string]; done: [message: string]; cancel: []; refresh: [] }>()
const busy = ref(false), error = ref(''), categoryId = ref(''), name = ref(''), color = ref('#6366f1'), parentId = ref('none'), revision = ref(0), stages = ref<KabanStage[]>([]), inherit = ref(false)
const controller = new AbortController(); onBeforeUnmount(() => controller.abort())
const board = computed(() => !props.contextBusy && (props.context?.kaban?.board.vaultId || 'personal') === (props.vaultId || 'personal') ? props.context?.kaban : undefined)
const stageMode = computed(() => props.draft.operation === 'edit_stages'), creating = computed(() => props.draft.operation === 'create_category')
const categories = computed(() => board.value?.categories.filter(c => !c.archived) || [])
const selected = computed(() => categories.value.find(c => c.id === categoryId.value))
const allowed = computed(() => !!board.value && (stageMode.value ? board.value.canManage : board.value.canEdit))
const parents = computed(() => [{ label: 'Основная категория', value: 'none' }, ...categories.value.filter(c => !c.parentId && c.id !== categoryId.value).map(c => ({ label: c.name, value: c.id }))])
function fill() {
  const value = selected.value
  revision.value = value?.revision || 0
  name.value = props.draft.name || value?.name || ''
  color.value = props.draft.color || value?.color || '#6366f1'
  const parents = categories.value.filter(c => !c.parentId && c.name.toLocaleLowerCase('ru') === props.draft.parentName?.toLocaleLowerCase('ru'))
  parentId.value = creating.value && parents.length === 1 ? parents[0]!.id : value?.parentId || 'none'
  stages.value = JSON.parse(JSON.stringify(kabanCategoryStages(board.value, categoryId.value)))
  inherit.value = false
  if (stageMode.value && props.draft.stageName) {
    const found = stages.value.filter(s => s.name.toLocaleLowerCase('ru') === props.draft.stageName.toLocaleLowerCase('ru'))
    if (props.draft.stageOperation === 'add') stages.value.push({id:crypto.randomUUID(),name:props.draft.stageName,color:props.draft.color||'#64748b',done:false})
    else if (props.draft.stageOperation === 'remove' && found.length === 1) stages.value=stages.value.filter(s=>s.id!==found[0]!.id)
    else if (found.length === 1) { if (props.draft.name) found[0]!.name = props.draft.name; if (props.draft.color) found[0]!.color = props.draft.color }
  }
}
watch(categoryId, fill)
watch(() => [props.draft, board.value?.board.id], () => {
  const matched = categories.value.filter(c => c.name.toLocaleLowerCase('ru') === props.draft.categoryName.toLocaleLowerCase('ru'))
  categoryId.value = creating.value ? '' : matched.length === 1 ? matched[0]!.id : ''
  fill()
}, { immediate: true })
async function save() {
  if (!board.value || !allowed.value || busy.value || !creating.value && !selected.value) return
  busy.value = true; error.value = ''
  try {
    if (stageMode.value) await sharedRequest(`/api/kaban/boards/${board.value.board.id}/stages`, { method: 'PUT', signal: controller.signal, body: { categoryId: categoryId.value, revision: revision.value, inherit: inherit.value, stages: stages.value } })
    else await sharedRequest(creating.value ? '/api/kaban/categories' : `/api/kaban/categories/${encodeURIComponent(categoryId.value)}`, { method: creating.value ? 'POST' : 'PUT', signal: controller.signal, body: { boardId: board.value.board.id, revision: revision.value, data: { name: name.value, color: color.value, parentId: parentId.value === 'none' ? null : parentId.value } } })
    emit('done', stageMode.value ? 'Стадии категории сохранены.' : creating.value ? 'Категория Кабана создана.' : 'Категория Кабана обновлена.')
  } catch (failure: any) { error.value = failure?.data?.message || 'Не удалось сохранить изменения.' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="my-4 space-y-4 rounded-xl border border-default p-5" aria-label="Черновик структуры Кабана"><header class="flex items-center justify-between"><strong>{{ stageMode ? 'Стадии категории Кабана' : creating ? 'Новая категория Кабана' : 'Изменение категории Кабана' }}</strong><UButton icon="i-lucide-x" aria-label="Отменить черновик" color="neutral" variant="ghost" :disabled="busy" @click="emit('cancel')" /></header>
    <UFormField label="Хранилище"><USelect :model-value="vaultId" :items="context?.vaults.map(v => ({label:v.name,value:v.id,disabled:v.canEdit===false})) || []" class="w-full" :disabled="busy || contextBusy" @update:model-value="emit('vault', String($event))" /></UFormField>
    <p v-if="!allowed && !contextBusy" class="text-sm text-muted">{{ stageMode ? 'Для изменения стадий нужен полный доступ управляющего к доске.' : 'Нет прав на изменение категорий.' }}</p>
    <UFormField v-if="!creating" label="Категория" required><USelectMenu v-model="categoryId" :items="categories.map(c => ({label:c.name,value:c.id}))" value-key="value" class="w-full" :disabled="busy || contextBusy" placeholder="Выберите категорию" /></UFormField>
    <template v-if="!stageMode"><UFormField label="Название" required><UInput v-model="name" :maxlength="60" :disabled="!allowed || busy" class="w-full" /></UFormField><UFormField label="Цвет"><input v-model="color" type="color" :disabled="!allowed || busy" /></UFormField><UFormField label="Родительская категория"><USelect v-model="parentId" :items="parents" :disabled="!allowed || busy" class="w-full" /></UFormField><p class="text-sm text-muted">Новая подкатегория наследует стадии родительской категории.</p></template>
    <template v-else-if="selected"><p class="text-sm text-muted">{{ selected.stages ? 'У категории собственные стадии.' : selected.parentId ? 'Сейчас используются стадии родительской категории.' : 'Сейчас используются стандартные стадии доски.' }} Сохранение создаёт собственный набор; подкатегории без своего набора наследуют его. Занятую стадию можно удалить после перемещения задач.</p><UCheckbox v-if="selected.stages" v-model="inherit" :label="selected.parentId ? 'Вернуть наследование стадий родителя' : 'Вернуть стандартные стадии доски'" :disabled="!allowed || busy" /><StageFields v-model="stages" :disabled="!allowed || busy || inherit" /></template>
    <UAlert v-if="error" color="error" :description="error" /><div class="flex gap-2"><UButton :label="creating ? 'Создать категорию' : 'Сохранить изменения'" :loading="busy" :disabled="!allowed || busy || contextBusy || !creating && !selected || !stageMode && !name.trim()" @click="save" /><UButton label="Обновить данные" color="neutral" variant="outline" :disabled="busy || contextBusy" @click="emit('refresh')" /></div>
  </section>
</template>
