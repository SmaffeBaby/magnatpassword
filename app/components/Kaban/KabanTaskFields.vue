<script setup lang="ts">
import type { UnwrapNestedRefs } from 'vue'
import type { useKaban } from '~/composables/useKaban'
import type { KabanBlock, KabanFile } from '~~/shared/types/kaban'
import { createId } from '~/utils/browser'
import KabanTaskField from './KabanTaskField.vue'
const props=defineProps<{controller:UnwrapNestedRefs<ReturnType<typeof useKaban>>;editing:boolean;active?:boolean}>()
const c=props.controller,kind=ref<KabanBlock['type']>('description'),deletingFile=ref<KabanFile|null>(null)
const writable=computed(()=>!!c.draft?.canEdit&&!c.busy&&props.active!==false)
const blocks=computed(()=>c.draft?.blocks||[])
const types=[{label:'Описание',value:'description'},{label:'Ссылка',value:'link'},{label:'Карточка пароля',value:'password'},{label:'To-do список',value:'todo'},{label:'Файлы и фотографии',value:'files'}]
const orphanFiles=computed(()=>blocks.value.some(field=>field.type==='files')?[]:c.files)
function addBlock(){if(!writable.value||!c.draft||blocks.value.length>=40)return;const id=createId(),type=kind.value,title=types.find(item=>item.value===type)!.label;let field:KabanBlock;if(type==='description'||type==='link')field={id,type,title,value:''};else if(type==='password')field={id,type,title,vaultId:c.data?.board.vaultId||'personal',entryId:''};else if(type==='todo')field={id,type,title,items:[]};else field={id,type,title};(c.draft.blocks??=[]).push(field)}
const editors=ref<{flushTodos:()=>void}[]>([])
defineExpose({flushTodos:()=>{for(const editor of editors.value)editor.flushTodos()}})
</script>
<template>
 <div class="kaban-fields" :class="{'is-editing':editing}">
  <div v-if="editing" class="kaban-fields-heading"><h3>Поля задачи</h3><span>{{blocks.length}} / 40</span><p>Добавляйте нужные блоки и располагайте их в удобном порядке.</p></div>
  <template v-for="(field,index) in blocks" :key="field.id"><KabanTaskField ref="editors" :controller="c" :field="field" :index="index" :editing="editing" :active="active"/></template>
  <section v-if="orphanFiles.length" class="kaban-field"><h3>Другие вложения</h3><div v-for="file in orphanFiles" :key="file.id" class="kaban-file"><span>{{file.name}}</span><UButton type="button" icon="i-lucide-download" variant="ghost" :aria-label="`Скачать ${file.name}`" @click="c.openFile(file)"/><UButton v-if="editing" type="button" icon="i-lucide-trash-2" color="error" variant="ghost" :disabled="!writable" :aria-label="`Удалить ${file.name}`" @click="deletingFile=file"/></div></section>
  <div v-if="editing" class="kaban-add-field"><USelect v-model="kind" :items="types" aria-label="Тип нового поля" :disabled="!writable||blocks.length>=40"/><UButton type="button" icon="i-lucide-plus" label="Добавить поле" color="neutral" variant="outline" :disabled="!writable||blocks.length>=40" @click="addBlock"/></div>
  <p v-if="!editing&&!blocks.length" class="kaban-help">Содержимое задачи пока не добавлено.</p>
 </div>
 <UModal :open="!!deletingFile" title="Удалить вложение?" :description="deletingFile?.name" :dismissible="!c.busy" @update:open="value=>{if(!value)deletingFile=null}"><template #body><UAlert v-if="c.formError" color="error" :description="c.formError"/></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="c.busy" @click="deletingFile=null"/><UButton label="Удалить файл" color="error" :loading="c.busy" @click="async()=>{if(deletingFile){await c.removeFile(deletingFile);deletingFile=null}}"/></template></UModal>
</template>
