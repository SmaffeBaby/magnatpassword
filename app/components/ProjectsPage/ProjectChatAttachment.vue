<script setup lang="ts">
import type { ProjectChatFile } from '~~/shared/types/project-chats'
import { documentSize, documentEditor } from '~~/shared/utils/project-documents'
import type { ProjectDocument } from '~~/shared/types/project-documents'
import type { OfficeEditorAdapter } from '~/composables/office/useOffice'
import ProjectDocumentEditor from './ProjectDocumentEditor.vue'
import { saveFile } from '~/utils/file-download'
const props = defineProps<{ projectId: string; chatId: string; file: ProjectChatFile; previewMode?: 'thumbnail' | 'pinned' }>()
const emit=defineEmits<{saved:[]}>()
const currentFile=ref<ProjectChatFile>({...props.file}),editorFile=ref<ProjectDocument|null>(null),saveMode=ref('source')
const host = ref<HTMLElement | null>(null), preview = ref(''), opened = ref(false), busy = ref(false), error = ref('')
const image = computed(() => ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(currentFile.value.type))
let observer: IntersectionObserver | undefined, stopped = false
async function content() { return sharedRequest<Blob>(`/api/projects/${props.projectId}/chats/${props.chatId}/files/${currentFile.value.id}?revision=${editorFile.value?.revision??currentFile.value.revision??1}`, { responseType: 'blob' }) }
async function loadImage() {
  if (busy.value || preview.value || stopped) return
  busy.value = true; error.value = ''
  try { const bytes = await content(); if (!stopped) preview.value = URL.createObjectURL(new Blob([bytes], { type: currentFile.value.type })) }
  catch (failure: any) { if (!stopped) error.value = failure?.data?.message || 'Не удалось загрузить изображение' }
  finally { busy.value = false }
}
async function download() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await saveFile(await content(), currentFile.value.name) }
  catch { error.value = 'Не удалось скачать вложение' }
  finally { busy.value = false }
}
function openEditor(){if(!documentEditor(currentFile.value.name))return;opened.value=false;saveMode.value='source';editorFile.value={...currentFile.value,folderId:null,permission:currentFile.value.canEdit?'editor':'viewer',canManage:false,createdBy:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}
const adapter:OfficeEditorAdapter={load:content,setDestination:value=>{saveMode.value=value},async save(blob,name,copy){
 const target=editorFile.value!;
 if(!currentFile.value.canEdit||copy||saveMode.value==='download'){await saveFile(blob,name);return target}
 const body=new FormData();body.append('file',blob,name);body.append('revision',String(target.revision));const updated=await sharedRequest<ProjectChatFile>(`/api/projects/${props.projectId}/chats/${props.chatId}/files/${target.id}`,{method:'PUT',body});currentFile.value=updated;editorFile.value={...target,...updated};emit('saved');return editorFile.value
}}
async function openOriginal(){try{await useOffice().openSource({kind:'document',projectId:props.projectId,fileId:currentFile.value.documentId!})}catch(failure:any){error.value=failure?.data?.message||'Документ недоступен'}}
watch(()=>props.file,file=>{const changed=file.revision!==currentFile.value.revision;currentFile.value={...file};if(changed&&preview.value){URL.revokeObjectURL(preview.value);preview.value='';if(image.value)void loadImage()}},{deep:true})
onMounted(() => { if (image.value && host.value) { observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); void loadImage() } }); observer.observe(host.value) } })
onBeforeUnmount(() => { stopped = true; observer?.disconnect(); discardPreview() })
function discardPreview() {
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = ''
}
</script>
<template>
  <span v-if="previewMode" ref="host" class="chat-attachment-preview" :class="{ 'is-thumbnail': previewMode === 'thumbnail', 'is-image': image }">
    <img v-if="preview" :src="preview" alt="" @error="discardPreview"/>
    <UIcon v-else :name="image ? 'i-lucide-image' : 'i-lucide-paperclip'"/>
    <span v-if="previewMode === 'pinned' && !preview">{{ file.name }}</span>
  </span>
  <div v-else ref="host" class="chat-attachment">
    <button v-if="image" class="chat-image" :disabled="busy" :aria-label="`Открыть изображение: ${file.name}`" @click="preview?opened=true:loadImage()"><img v-if="preview" :src="preview" :alt="currentFile.name" loading="lazy"/><span v-else><UIcon :name="busy?'i-lucide-loader-circle':'i-lucide-image'"/>{{busy?'Загрузка…':'Открыть изображение'}}</span></button>
    <button class="chat-file" :disabled="busy" :aria-label="`Открыть файл: ${currentFile.name}`" @click="documentEditor(currentFile.name)?openEditor():download()"><UIcon name="i-lucide-file-down"/><span><strong>{{currentFile.name}}</strong><small>{{documentSize(currentFile.size)}}<template v-if="currentFile.documentId"> · Сохранён в документах проекта</template></small></span></button>
    <div class="chat-file-actions"><UButton v-if="documentEditor(currentFile.name)" size="xs" color="neutral" variant="ghost" :label="currentFile.canEdit?'Открыть / изменить':'Предпросмотр'" icon="i-lucide-external-link" @click="openEditor"/><UButton size="xs" icon="i-lucide-download" :aria-label="`Скачать: ${currentFile.name}`" color="neutral" variant="ghost" :disabled="busy" @click="download"/><UButton v-if="currentFile.documentId&&projectId!=='personal'" size="xs" label="Оригинал в документах" color="neutral" variant="ghost" @click="openOriginal"/></div>
    <p v-if="error" class="chat-file-error" role="alert">{{error}}</p>
    <UModal v-model:open="opened" :title="currentFile.name" :ui="{content:'sm:max-w-3xl'}"><template #body><img v-if="preview" :src="preview" :alt="currentFile.name" class="chat-image-full"/></template><template #footer><UButton label="Скачать" icon="i-lucide-download" :loading="busy" @click="download"/></template></UModal>
    <ProjectDocumentEditor v-if="editorFile" :key="editorFile.id" :file="editorFile" :can-upload="false" :adapter="adapter" :allow-choose-destination="false" @close="editorFile=null"/>
  </div>
</template>
<style scoped>
.chat-attachment{display:grid;gap:6px;min-width:0}.chat-image{display:grid;place-items:center;min-width:160px;min-height:110px;max-width:280px;background:#e9eef3;border-radius:12px;overflow:hidden;color:#64748b}.chat-image img{width:100%;max-height:240px;object-fit:cover}.chat-image>span{display:grid;gap:8px;justify-items:center;font-size:12px;padding:12px}.chat-file{display:flex;align-items:center;gap:10px;min-width:0;text-align:left;padding:8px 0}.chat-file>.iconify{flex:0 0 24px;width:24px;height:24px;color:#64748b}.chat-file>span{display:grid;gap:4px;min-width:0}.chat-file strong{font-size:12px;overflow-wrap:anywhere}.chat-file small{font-size:10px;color:#8292a8}.chat-file-error{font-size:11px;color:#dc2626}.chat-image-full{max-width:100%;max-height:75vh;margin:auto;object-fit:contain}
.chat-file-actions{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.chat-attachment-preview{display:flex;min-width:0;align-items:center;gap:8px;font-size:12px;color:#526781;overflow-wrap:anywhere}
.chat-attachment-preview>.iconify{width:18px;height:18px;flex-shrink:0}
.chat-attachment-preview.is-image{display:grid;place-content:center;justify-items:center;padding:8px;width:min(210px,100%);aspect-ratio:4/3;border-radius:9px;background:#dce7f2;overflow:hidden;text-align:center}
.chat-attachment-preview img{display:block;width:100%;height:100%;object-fit:cover}
.chat-attachment-preview.is-image:has(img){display:block;padding:0}
.chat-attachment-preview.is-thumbnail{display:grid;place-content:center;justify-items:center;flex:0 0 34px;width:34px;height:34px;aspect-ratio:auto;padding:0;border-radius:7px;background:#dce7f2}
</style>
