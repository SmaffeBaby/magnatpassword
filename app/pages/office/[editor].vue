<script setup lang="ts">
import OfficeLocationPicker from '~/components/Editors/OfficeLocationPicker.vue'
import FileUpload from '~/components/Shared/FileUpload.vue'
import { documentEditors } from '~~/shared/utils/project-documents'
import type { OfficeTarget, OfficeSource } from '~~/shared/types/office'
definePageMeta({ layout: 'home' })
const route = useRoute(), office = useOffice(), auth = useAuthStore(), tabs = useServiceTabsStore()
const reopening = computed(() => office.reopening.value?.id === tabs.activeId ? office.reopening.value : null)
const editor = computed(() => documentEditors.find(e => e.key === route.params.editor))
const extensions = { wordcraft:'docx',pdfcraft:'pdf',gridcraft:'xlsx',deckcraft:'pptx',photocraft:'png' }
const name = ref('Новый файл'), target = ref<OfficeTarget | null>(null), error = ref(''), busy = ref(false)
async function create() {
  if (!editor.value || busy.value) return
  const actor = auth.user?.id; busy.value=true;error.value=''
  try { const blob = await sharedRequest<Blob>(`/api/office/blank?kind=${editor.value.key}`,{responseType:'blob'});if(auth.user?.id!==actor)return;const filename=name.value.trim()||'Новый файл';const extension='.'+extensions[editor.value.key];await office.openBlob(blob,filename.toLowerCase().endsWith(extension)?filename:filename+extension,target.value??undefined) }
  catch(failure:any){error.value=failure?.data?.message||failure.message}finally{busy.value=false}
}
async function open(source: OfficeSource) { error.value='';try{await office.openSource(source)}catch(failure:any){error.value=failure?.data?.message||failure.message} }
async function upload(event:Event) { const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;error.value='';try{await office.openBlob(file,file.name,target.value??undefined)}catch(failure:any){error.value=failure.message}input.value='' }
</script>
<template><main v-if="!office.session.value" class="office-workspace"><NuxtLink to="/" class="text-sm text-muted">← На главную</NuxtLink><template v-if="editor"><header class="flex items-center gap-4"><img :src="`/editor-icons/${editor.key}.ico`" alt="" width="64" height="64"/><div><h1>{{editor.label}}</h1><p>Откройте файл, создайте новый и выберите, куда сохранить результат.</p></div></header><p v-if="reopening?.loading" role="status">Открываем сохранённый файл…</p><UAlert v-else-if="reopening?.error" color="error" :description="reopening.error"/><UAlert v-else-if="tabs.active?.editor?.kind === 'local'" color="neutral" title="Откройте локальный файл заново" description="Файл с устройства или несохранённый документ недоступен после перезагрузки."/><UAlert v-if="error" color="error" :description="error"/><div class="office-columns"><section class="space-y-5 rounded-2xl border border-default bg-white p-6"><h2>Создать или открыть с устройства</h2><UFormField label="Название нового файла"><UInput v-model="name" :maxlength="220" class="w-full"/></UFormField><UButton label="Создать и открыть" icon="i-lucide-file-plus" :loading="busy" @click="create"/><FileUpload label="Открыть файл с устройства" :accept="editor.extensions.map(e=>'.'+e).join(',')" hint="До 20 МБ. Файл появится в выбранном разделе после сохранения в редакторе." @change="upload"/><p class="text-sm text-muted">В редакторе можно сохранить изменения, выбрать другой проект или сервис либо скачать файл на устройство.</p></section><section class="space-y-4 rounded-2xl border border-default bg-white p-6"><h2>Файлы проекта или сервиса</h2><OfficeLocationPicker :editor="editor.key" @target="target=$event" @open="open"/></section></div></template><UAlert v-else color="error" title="Редактор не найден"/></main></template>
<style scoped>.office-workspace{width:100%;max-width:1200px;display:grid;gap:24px}.office-workspace h1{font-size:30px;font-weight:650;color:#334155}.office-workspace h2{font-size:18px;font-weight:600;color:#475569}.office-workspace header p{font-size:13px;color:#8292a8}.office-columns{display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start}@media(max-width:760px){.office-columns{grid-template-columns:1fr}}</style>
