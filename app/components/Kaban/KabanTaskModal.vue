<script setup lang="ts">
import type { UnwrapNestedRefs } from 'vue'
import type { useKaban } from '~/composables/useKaban'
import type { KabanFile } from '~~/shared/types/kaban'
import KabanPerson from './KabanPerson.vue'
import FileUpload from '../FileUpload.vue'
const props=defineProps<{controller:UnwrapNestedRefs<ReturnType<typeof useKaban>>}>()
const c=props.controller,formId=useId(),deletingFile=ref<KabanFile|null>(null)
const category=computed({get:()=>c.draft?.categoryIds[0]||'',set:(id:string)=>{if(c.draft)c.draft.categoryIds=id?[id]:[]}})
const writable=computed(()=>!!c.data?.canEdit)
const size=(value:number)=>value>=1048576?`${(value/1048576).toFixed(1)} МБ`:`${Math.ceil(value/1024)} КБ`
</script>
<template>
 <UModal :open="c.editorOpen" :title="c.draft?.id?'Задача':'Новая задача'" description="Сроки, участники, to-do список и материалы задачи." :dismissible="!c.busy" :ui="{content:'sm:max-w-3xl',header:'pe-14',footer:'justify-between flex-wrap'}" @update:open="value=>{if(!value)c.closeEditor()}">
  <template #body><form v-if="c.draft" :id="formId" class="kaban-task-form" @submit.prevent="c.saveTask">
   <UFormField label="Название задачи" required><UInput v-model="c.draft.title" :disabled="!writable||c.busy" :maxlength="200" placeholder="Что нужно сделать?" class="w-full" required/></UFormField>
   <UFormField label="Описание"><UTextarea v-model="c.draft.description" :disabled="!writable||c.busy" :maxlength="20000" :rows="4" placeholder="Контекст, ожидаемый результат и важные детали" class="w-full"/></UFormField>
   <div class="kaban-form-grid">
    <UFormField label="Категория" required><USelectMenu v-model="category" :items="c.categoryOptions" value-key="value" :disabled="!writable||c.busy" placeholder="Выберите категорию" class="w-full"/><UButton v-if="c.canCategorize" type="button" size="xs" variant="link" label="Создать категорию" :disabled="c.busy" @click="c.editCategory()"/></UFormField>
    <UFormField label="Стадия"><USelect v-model="c.draft.stageId" :items="c.data?.board.stages.map(stage=>({label:stage.name,value:stage.id}))" :disabled="!writable||c.busy" class="w-full"/></UFormField>
    <UFormField label="Срок задачи"><UInput v-model="c.draft.dueOn" type="date" :disabled="!writable||c.busy" class="w-full"/></UFormField>
    <UFormField label="Участники задачи"><USelectMenu v-model="c.draft.participantIds" :items="c.peopleOptions" value-key="value" multiple :disabled="!writable||c.busy" placeholder="Выберите участников" class="w-full"/></UFormField>
   </div>
   <p class="kaban-help">{{c.workspaceId==='personal'?'Личная задача видна только вам. Для совместной работы выберите общее хранилище.':'Участники выбираются из людей с доступом к хранилищу и категории задачи.'}} Изменение категории перемещает задачу в неё.</p>
   <section class="kaban-todo"><div class="kaban-section-title"><h3>To-do список</h3><span>{{c.draft.todos.filter(item=>item.done).length}} / {{c.draft.todos.length}}</span></div>
    <progress v-if="c.draft.todos.length" :value="c.draft.todos.filter(item=>item.done).length" :max="c.draft.todos.length" aria-label="Прогресс to-do списка"/>
    <div v-for="(item,index) in c.draft.todos" :key="item.id" class="kaban-todo-row"><UCheckbox v-model="item.done" :aria-label="`Выполнено: ${item.text}`" :disabled="!writable||c.busy"/><UInput v-model="item.text" :aria-label="`Пункт ${index+1}`" :maxlength="500" :disabled="!writable||c.busy" class="flex-1" :class="{'todo-done':item.done}"/><UButton v-if="writable" type="button" icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="`Удалить пункт ${index+1}`" :disabled="c.busy" @click="c.draft.todos.splice(index,1)"/></div>
    <div v-if="writable&&c.draft.todos.length<100" class="kaban-todo-row"><UInput v-model="c.newTodo" aria-label="Новый пункт to-do" placeholder="Добавить пункт…" :maxlength="500" :disabled="c.busy" class="flex-1" @keydown.enter.prevent="c.addTodo"/><UButton type="button" icon="i-lucide-plus" label="Добавить" size="sm" color="neutral" variant="outline" :disabled="c.busy||!c.newTodo.trim()" @click="c.addTodo"/></div>
   </section>
   <section><div class="kaban-section-title"><h3>Файлы и фотографии</h3><span>{{c.files.length+c.pendingFiles.length}} / 20</span></div>
    <FileUpload v-if="writable" label="Прикрепить файлы и фотографии" hint="До 20 файлов, каждый до 20 МБ. Новые файлы загрузятся при сохранении задачи." multiple :disabled="c.busy||c.filesLoading" @change="c.chooseFiles"/>
    <p v-if="c.filesLoading" class="kaban-help" role="status">Загружаем вложения…</p>
    <div v-for="file in c.files" :key="file.id" class="kaban-file"><UIcon :name="file.type.startsWith('image/')?'i-lucide-image':'i-lucide-file'"/><span><strong>{{file.name}}</strong><small>{{size(file.size)}}</small></span><UButton v-if="file.type.startsWith('image/')" type="button" icon="i-lucide-eye" color="neutral" variant="ghost" :aria-label="`Посмотреть ${file.name}`" @click="c.openFile(file,true)"/><UButton type="button" icon="i-lucide-download" color="neutral" variant="ghost" :aria-label="`Скачать ${file.name}`" @click="c.openFile(file)"/><UButton v-if="writable" type="button" icon="i-lucide-trash-2" color="error" variant="ghost" :disabled="c.busy" :aria-label="`Удалить ${file.name}`" @click="deletingFile=file"/></div>
    <div v-for="(file,index) in c.pendingFiles" :key="index" class="kaban-file"><UIcon name="i-lucide-paperclip"/><span><strong>{{file.name}}</strong><small>{{size(file.size)}} · Будет загружен</small></span><UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="`Убрать ${file.name}`" :disabled="c.busy" @click="c.pendingFiles=c.pendingFiles.filter((_,i)=>i!==index)"/></div>
   </section>
   <section v-if="c.data"><h3 class="kaban-section-title">Люди в задаче</h3><KabanPerson :person="c.person(c.draft.creatorId)" :units="c.data.units" label="Создатель задачи"/><div class="kaban-people-list"><KabanPerson v-for="id in c.draft.participantIds" :key="id" :person="c.person(id)" :units="c.data.units" label="Участник"/></div></section>
   <UAlert v-if="c.formError" color="error" :description="c.formError"/>
  </form></template>
  <template #footer><UButton v-if="c.draft?.id&&writable" icon="i-lucide-trash-2" color="error" variant="ghost" label="Удалить задачу" :disabled="c.busy" @click="c.deleteOpen=true"/><span v-else/><div class="flex gap-2"><UButton color="neutral" variant="outline" label="Закрыть" :disabled="c.busy" @click="c.closeEditor"/><UButton v-if="writable" type="submit" :form="formId" label="Сохранить задачу" :loading="c.busy"/></div></template>
 </UModal>
 <UModal v-model:open="c.deleteOpen" title="Удалить задачу?" description="Задача, её список дел и вложения будут удалены." :dismissible="!c.busy"><template #body><p>{{c.draft?.title}}</p><UAlert v-if="c.formError" color="error" :description="c.formError"/></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="c.busy" @click="c.deleteOpen=false"/><UButton label="Удалить задачу" color="error" :loading="c.busy" @click="c.removeTask"/></template></UModal>
 <UModal :open="!!deletingFile" title="Удалить вложение?" :description="deletingFile?.name" :dismissible="!c.busy" @update:open="value=>{if(!value)deletingFile=null}"><template #body><UAlert v-if="c.formError" color="error" :description="c.formError"/></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="c.busy" @click="deletingFile=null"/><UButton label="Удалить файл" color="error" :loading="c.busy" @click="async()=>{if(deletingFile){await c.removeFile(deletingFile);deletingFile=null}}"/></template></UModal>
 <UModal :open="!!c.preview" :title="c.previewName" :ui="{content:'sm:max-w-4xl'}" @update:open="value=>{if(!value)c.clearPreview()}"><template #body><img v-if="c.preview" :src="c.preview" :alt="c.previewName" class="kaban-photo-preview"/></template></UModal>
</template>
