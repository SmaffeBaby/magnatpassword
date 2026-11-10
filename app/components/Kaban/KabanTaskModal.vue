<script setup lang="ts">
import type { UnwrapNestedRefs } from 'vue'
import type { useKaban } from '~/composables/useKaban'
import KabanPerson from './KabanPerson.vue'
import KabanTaskFields from './KabanTaskFields.vue'
import type { KabanTask } from '~~/shared/types/kaban'
import { kabanCanEditPlanning } from '~~/shared/utils/kaban'
import { todayDate } from '~~/shared/utils/subscriptions'
const props=defineProps<{controller:UnwrapNestedRefs<ReturnType<typeof useKaban>>}>()
const c=props.controller,formId=useId()
const category=computed({get:()=>c.draft?.categoryIds[0]||'',set:(id:string)=>{if(c.draft)c.draft.categoryIds=id?[id]:[]}})
const writable=computed(()=>!!c.draft?.canEdit)
const planningWritable=computed(()=>writable.value&&!!c.draft&&kabanCanEditPlanning(c.auth.user?.id,c.draft))
const previousDeadline=ref('')
watch(()=>c.editorOpen,()=>{previousDeadline.value=c.draft?.dueOn||''})
const withoutDeadline=computed({get:()=>!c.draft?.dueOn,set:(value:boolean)=>{
 if(!c.draft||!planningWritable.value||c.busy)return
 if(value){previousDeadline.value=c.draft.dueOn;c.draft.dueOn=''}
 else c.draft.dueOn=previousDeadline.value||todayDate()
}})
const draftVault=computed({get:()=>c.data?.board.vaultId||'personal',set:(id:string)=>{void c.changeDraftVault(id)}})
const targetCategoryChoice=computed({get:()=>c.targetCategory||'__new__',set:(value:string)=>{c.targetCategory=value==='__new__'?'':value}})
const stageOptions=computed(()=>c.data?.board.stages.map(stage=>({label:stage.name,value:stage.id,disabled:stage.done&&!!c.draft&&!c.canComplete(c.draft)&&stage.id!==c.draft.stageId})))
const settingsTab=ref('fields')
const tabs=[{label:'Поля задачи',value:'fields',icon:'i-lucide-layout-list'},{label:'Параметры задачи',value:'parameters',icon:'i-lucide-sliders-horizontal'}]
watch(()=>c.editorOpen,value=>{if(value)settingsTab.value=c.draft?.id?'fields':'parameters'})
const fields=ref<{flushTodos:()=>void}|null>(null)
const snapshot=(task:KabanTask)=>JSON.stringify([task.title,task.dueOn,task.stageId,task.categoryIds,task.participantIds,task.closerIds,task.blocks])
const saved=computed(()=>c.data?.tasks.find(task=>task.id===c.draft?.id))
const dirty=computed(()=>!!c.draft&&(!saved.value||snapshot(c.draft)!==snapshot(saved.value)||c.pendingFiles.length>0))
const stageName=computed(()=>c.data?.board.stages.find(stage=>stage.id===c.draft?.stageId)?.name)
const categoryName=computed(()=>c.data?.categories.filter(category=>c.draft?.categoryIds.includes(category.id)).map(category=>category.name).join(' · '))
async function submit(){fields.value?.flushTodos();if(c.draft?.blocks?.some(field=>!field.title.trim())){c.formError='Укажите названия полей задачи.';settingsTab.value='fields';return}await c.saveTask({keepOpen:true});if(!c.formError)c.taskSettings=false;else if(!c.draft?.title.trim()||!c.draft.categoryIds.length)settingsTab.value='parameters'}
function cancelSettings(){if(!saved.value){c.closeEditor();return}c.draft=JSON.parse(JSON.stringify(saved.value));c.pendingFiles=[];c.formError='';c.taskSettings=false}
function toggleSettings(){if(c.taskSettings)fields.value?.flushTodos();c.taskSettings=!c.taskSettings}
</script>
<template>
 <UModal :open="c.editorOpen" :title="!c.draft?.id?'Новая задача':c.taskSettings?'Настройки задачи':c.draft.title" :description="c.taskSettings?'Параметры, поля и структура задачи.':'Содержание, материалы и люди в задаче.'" :dismissible="!c.busy" :ui="{content:'sm:max-w-3xl',header:'pe-24',footer:'justify-between flex-wrap'}" @update:open="value=>{if(!value)c.closeEditor()}">
  <template #actions><UButton v-if="c.draft?.id&&writable" type="button" :icon="c.taskSettings?'i-lucide-eye':'i-lucide-settings-2'" :aria-label="c.taskSettings?'Просмотр задачи':'Настройки задачи'" :title="c.taskSettings?'Просмотр задачи':'Настройки задачи'" color="neutral" variant="ghost" class="kaban-modal-settings" :disabled="c.busy" @click="toggleSettings"/></template>
  <template #body><form v-if="c.draft" :id="formId" class="kaban-task-form" @submit.prevent="submit">
   <UTabs v-if="c.taskSettings" v-model="settingsTab" :items="tabs" :content="false" class="w-full" aria-label="Настройки задачи"/>
   <template v-if="c.taskSettings&&settingsTab==='parameters'">
    <UFormField label="Название задачи" required><UInput v-model="c.draft.title" :disabled="!writable||c.busy" :maxlength="200" placeholder="Что нужно сделать?" class="w-full" required/></UFormField>
    <section class="kaban-task-parameters"><h3>Параметры задачи</h3><div class="kaban-form-grid">
     <UFormField v-if="!c.draft.id&&c.workspaceId==='all'" label="Хранилище"><USelect v-model="draftVault" :items="c.sources.map(source=>({label:source.name,value:source.id}))" :disabled="c.busy" class="w-full"/></UFormField>
     <UFormField label="Категория" required><USelectMenu v-model="category" :items="c.categoryOptions" value-key="value" :disabled="!writable||c.busy" placeholder="Выберите категорию" class="w-full"/><UButton v-if="c.canCategorize" type="button" size="xs" variant="link" label="Создать категорию" :disabled="c.busy" @click="c.editCategory()"/></UFormField>
     <UFormField label="Стадия"><USelect v-model="c.draft.stageId" :items="stageOptions" :disabled="!writable||c.busy" class="w-full"/></UFormField>
     <div><UFormField label="Срок задачи"><UInput v-model="c.draft.dueOn" type="date" :disabled="!planningWritable||withoutDeadline||c.busy" :required="!withoutDeadline" class="w-full"/></UFormField><UCheckbox v-model="withoutDeadline" label="Без срока" :disabled="!planningWritable||c.busy" class="mt-2"/></div>
     <UFormField label="Ответственные"><USelectMenu v-model="c.draft.participantIds" :items="c.peopleOptions" value-key="value" multiple :disabled="!planningWritable||c.busy" placeholder="Выберите ответственных" class="w-full"/></UFormField>
    </div><UFormField label="Могут завершать" description="Создатель всегда может завершать задачу. Только он может назначить дополнительных пользователей."><USelectMenu v-model="c.draft.closerIds" :items="c.peopleOptions" value-key="value" multiple :disabled="!planningWritable||c.busy" placeholder="Выберите пользователей" class="w-full"/></UFormField>
    <p v-if="c.draft.locations.length" class="kaban-help">Хранилища: {{c.taskSourceNames(c.draft)}}</p><UButton v-if="c.draft.id&&c.canOwn(c.draft)" type="button" label="Хранилища задачи" icon="i-lucide-folder-input" color="neutral" variant="outline" :disabled="c.busy" @click="c.openLocation()"/>
    <p class="kaban-help">Срок, ответственных и право завершения меняет только создатель задачи. Доступ к содержимому определяется хранилищем и категорией.</p></section>
   </template>
   <div v-if="!c.taskSettings" class="kaban-task-overview"><span><UIcon name="i-lucide-folder"/>{{categoryName}}</span><span><UIcon name="i-lucide-columns-3"/>{{stageName}}</span><span><UIcon name="i-lucide-calendar-days"/>{{c.draft.dueOn?c.dateLabel(c.draft.dueOn):'Без срока'}}</span><small>{{c.taskSourceNames(c.draft)}}</small></div>
   <div v-show="!c.taskSettings||settingsTab==='fields'" class="kaban-fields-tab"><KabanTaskFields ref="fields" :controller="c" :editing="c.taskSettings" :active="!c.taskSettings||settingsTab==='fields'"/></div>
   <section v-if="!c.taskSettings&&c.data" class="kaban-task-people"><h3 class="kaban-section-title">Люди в задаче</h3><KabanPerson :person="c.person(c.draft.creatorId)" :units="c.data.units" label="Создатель задачи"/><div class="kaban-people-list"><KabanPerson v-for="id in c.draft.participantIds" :key="id" :person="c.person(id)" :units="c.data.units" label="Ответственный"/></div></section>
   <p v-if="dirty&&c.draft.id" class="kaban-unsaved" role="status">Есть несохранённые изменения.</p><UAlert v-if="c.formError" color="error" :description="c.formError"/>
  </form></template>
  <template #footer><div class="flex flex-wrap gap-2"><UButton v-if="c.taskSettings&&c.draft?.id&&c.canOwn(c.draft)" icon="i-lucide-trash-2" color="error" variant="ghost" label="Удалить задачу" :disabled="c.busy" @click="c.deleteOpen=true"/><UButton v-if="!c.taskSettings&&c.draft?.id&&c.canComplete(c.draft)" :icon="c.draft.archived?'i-lucide-archive-restore':'i-lucide-check-check'" color="neutral" variant="outline" :label="c.draft.archived?'Восстановить задачу':'Завершить задачу'" :disabled="c.busy||dirty" @click="async()=>{if(c.draft){await c.archiveTask(c.draft,!c.draft.archived);c.closeEditor()}}"/></div><div class="flex flex-wrap gap-2"><UButton v-if="c.taskSettings" color="neutral" variant="outline" label="Отмена" :disabled="c.busy" @click="cancelSettings"/><UButton v-else color="neutral" variant="outline" label="Закрыть карточку" :disabled="c.busy" @click="c.closeEditor"/><UButton v-if="writable&&(c.taskSettings||dirty)" type="submit" :form="formId" :label="!c.draft?.id?'Создать задачу':c.taskSettings?'Сохранить настройки':'Сохранить изменения'" :loading="c.busy"/></div></template>
 </UModal>
 <UModal v-model:open="c.locationOpen" title="Хранилища задачи" description="Переместите задачу или добавьте её в другое хранилище. Название, описание, список дел, срок и вложения останутся общими." :dismissible="!c.busy"><template #body><div class="space-y-4"><UAlert color="neutral" description="Задача и её вложения станут доступны пользователям целевого хранилища с доступом к выбранной категории."/><UFormField label="Хранилище"><USelect v-model="c.targetVaultId" :items="c.locationSources.map(source=>({label:source.name,value:source.id}))" placeholder="Выберите хранилище" :disabled="c.busy" class="w-full"/></UFormField><p v-if="c.locationLoading" role="status">Загружаем категории…</p><template v-if="c.targetWorkspace"><UFormField label="Категория"><USelect v-model="targetCategoryChoice" :items="[{label:'Создать категорию',value:'__new__'},...c.targetCategoryOptions]" :disabled="c.busy" class="w-full"/></UFormField><UFormField v-if="!c.targetCategory" label="Название новой категории"><UInput v-model="c.newLocationCategory" :maxlength="60" :disabled="c.busy" class="w-full"/></UFormField><UFormField label="Стадия"><USelect v-model="c.targetStage" :items="c.targetWorkspace.board.stages.map(stage=>({label:stage.name,value:stage.id}))" :disabled="c.busy" class="w-full"/></UFormField><UCheckbox v-model="c.locationMove" label="Переместить: убрать из текущего хранилища" :disabled="c.busy"/><p class="kaban-help">Без галочки задача будет отображаться в обоих хранилищах. Изменения общих полей синхронизируются, категория и стадия задаются отдельно для каждой доски. Перед переносом сохраните изменения задачи.</p></template><UAlert v-if="c.locationError" color="error" :description="c.locationError"/></div></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="c.busy" @click="c.locationOpen=false"/><UButton :label="c.locationMove?'Переместить задачу':'Добавить в хранилище'" :loading="c.busy" :disabled="!c.targetWorkspace||c.locationLoading||(!c.targetCategory&&!c.newLocationCategory.trim())" @click="c.saveLocation()"/></template></UModal>
 <UModal v-model:open="c.deleteOpen" title="Удалить задачу?" description="Задача, её список дел и вложения будут удалены." :dismissible="!c.busy"><template #body><p>{{c.draft?.title}}</p><UAlert v-if="c.formError" color="error" :description="c.formError"/></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="c.busy" @click="c.deleteOpen=false"/><UButton label="Удалить задачу" color="error" :loading="c.busy" @click="c.removeTask"/></template></UModal>
 <UModal :open="!!c.preview" :title="c.previewName" :ui="{content:'sm:max-w-4xl'}" @update:open="value=>{if(!value)c.clearPreview()}"><template #body><img v-if="c.preview" :src="c.preview" :alt="c.previewName" class="kaban-photo-preview"/></template></UModal>
</template>
