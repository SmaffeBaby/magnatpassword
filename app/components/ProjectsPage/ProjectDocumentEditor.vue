<script setup lang="ts">
import { documentEditor, documentExtension, documentMaxSize } from '~~/shared/utils/project-documents'
import type { ProjectDocument } from '~~/shared/types/project-documents'
import { saveFile, downloadFilename } from '~/utils/file-download'
import { photoPsdToPng } from '~/utils/photo-psd'
import type { OfficeEditorAdapter } from '~/composables/office/useOffice'
const props = defineProps<{ projectId?: string; file: ProjectDocument; canUpload: boolean; adapter?: OfficeEditorAdapter; allowChooseDestination?: boolean }>()
const emit = defineEmits<{ saved: []; close: [] }>()
const router = useRouter()
const auth = useAuthStore(), actor = auth.user?.id
const target = ref<ProjectDocument>({ ...props.file }), frame = ref<HTMLIFrameElement | null>(null)
const editor = computed(() => documentEditor(props.file.name))
const source = computed(() => editor.value ? `/editors/${editor.value.key}/index.html?host=parent&webgl&author=${encodeURIComponent(auth.user?.email || '')}` : '')
const loading = ref(true), saving = ref(false), dirty = ref(false), error = ref(''), status = ref(''), confirmClose = ref(false)
const bytes = shallowRef<ArrayBuffer>(), opened = ref(false)
type Output = { name: string; bytes: ArrayBuffer; id?: string | number; saveAs: boolean; type: string }
type SaveAction = 'replace' | 'png' | 'copy' | 'download' | 'download-png'
const outputs = shallowRef<Output[]>([]), outputName = ref('')
const editorName = ref(downloadFilename(props.file.name))
const pending = computed(() => outputs.value[0])
const photo = computed(() => editor.value?.key === 'photocraft')
const layered = computed(() => ['psd', 'psb'].includes(documentExtension(pending.value?.name || '')))
const choosePng = computed(() => photo.value && layered.value && documentExtension(target.value.name) === 'png')
const matchesOriginal = computed(() => !!pending.value && (pending.value.name === downloadFilename(target.value.name) || pending.value.name === editorName.value))
const canReplace = computed(() => editable.value && (choosePng.value || (matchesOriginal.value && !pending.value?.saveAs)))
const extension = computed(() => documentExtension(pending.value?.name || ''))
const isCopyAllowed = computed(() => props.canUpload || (!!props.adapter && props.allowChooseDestination !== false))
watch(pending, output => { outputName.value = output?.name || '' }, { flush: 'sync' })
let timeout: ReturnType<typeof setTimeout> | undefined
let detachActivity = () => {}
function bindFrameActivity() {
  detachActivity()
  const child = frame.value?.contentWindow
  if (!child) return
  try {
    if (child.location.origin !== location.origin) return
    // Events inside an iframe do not reach the account's idle timer in the parent.
    // Only real input extends the session; rendering and bridge messages do not.
    const touch = (event: Event) => {
      if (!event.isTrusted || auth.user?.id !== actor) return
      if (auth.idleExpired()) void auth.logout()
      else auth.touchActivity()
    }
    const events = ['pointerdown', 'keydown', 'wheel']
    events.forEach(name => child.addEventListener(name, touch, { capture: true, passive: true }))
    detachActivity = () => events.forEach(name => child.removeEventListener(name, touch, true))
    if (editor.value?.key === 'photocraft' && !child.document.querySelector('[data-magnat-photo-bridge]')) {
      const adapter = child.document.createElement('script')
      adapter.src = '/editor-bridges/photocraft.js'
      adapter.dataset.magnatPhotoBridge = 'true'
      adapter.onerror = () => { error.value = 'Не удалось загрузить интеграцию PhotoCraft'; loading.value = false }
      child.document.head.appendChild(adapter)
    }
  } catch { /* A blocked or failed frame has no readable same-origin window. */ }
}
const editable = computed(() => ['owner','editor'].includes(target.value.permission))
function destination(value: string) { props.adapter?.setDestination?.(value) }
const unsaved = computed(() => dirty.value || !!pending.value || saving.value)
function post(kind: string, data: Record<string, unknown>) { if (editor.value) frame.value?.contentWindow?.postMessage({ type: `${editor.value.key}:${kind}`, ...data }, location.origin) }
async function load() {
  loading.value = true; error.value = ''; opened.value = false
  try {
    const data = props.adapter ? await props.adapter.load() : await sharedRequest<Blob>(`/api/projects/${props.projectId}/documents/${target.value.id}/content?revision=${target.value.revision}`, { responseType: 'blob' })
    if (auth.user?.id !== actor) return
    bytes.value = await data.arrayBuffer()
    timeout = setTimeout(() => { if (loading.value) error.value = 'Редактор загружается дольше обычного. Проверьте соединение и поддержку WebGL2.' }, 60000)
  } catch (failure: any) { error.value = failure?.data?.message || failure?.message || 'Не удалось открыть файл'; loading.value = false }
}
async function receive(event: MessageEvent) {
  if (event.origin !== location.origin || event.source !== frame.value?.contentWindow || auth.user?.id !== actor || !editor.value) return
  const data = event.data
  if (!data || typeof data.type !== 'string') return
  if (data.type === `${editor.value.key}:ready` && bytes.value && !opened.value) {
    opened.value = true
    post('host', { version: '1', handoff: false })
    post('open', { name: target.value.name, bytes: bytes.value })
    loading.value = false; clearTimeout(timeout)
  } else if (data.type === `${editor.value.key}:dirty`) {
    dirty.value = data.dirty === true; if (dirty.value) status.value = ''
  } else if (data.type === `${editor.value.key}:failed`) {
    error.value = typeof data.error === 'string' ? data.error.slice(0,500) : 'Редактор не смог открыть файл'; loading.value = false
  } else if (data.type === `${editor.value.key}:save`) {
    const outputBytes = data.bytes instanceof ArrayBuffer ? data.bytes : ArrayBuffer.isView(data.bytes) ? new Uint8Array(data.bytes.buffer, data.bytes.byteOffset, data.bytes.byteLength).slice().buffer : undefined
    if (!outputBytes?.byteLength || typeof data.name !== 'string') { error.value = 'Редактор вернул некорректный файл'; return }
    const output = {
      name: downloadFilename(data.name), bytes: outputBytes, id: data.id, saveAs: data.saveAs === true,
      type: typeof data.mime === 'string' ? data.mime : ''
    }
    const first = !outputs.value.length
    outputs.value = [...outputs.value, output]
    if (first) { error.value = ''; status.value = '' }
    // The native PhotoCraft web bridge can't distinguish Save As from Save.
    // Its output always gets a choice; a normal Office save goes straight to the source.
    if (first && !photo.value && matchesOriginal.value && canReplace.value) await saveOutput('replace')
  }
}
function finishOutput(output: Output, saved: boolean, clean = false) {
  if (output.id !== undefined) post(saved ? 'saved' : 'failed', { id: output.id, clean, error: saved ? undefined : 'Сохранение отменено' })
  outputs.value = outputs.value.filter(item => item !== output)
  if (clean) dirty.value = false
}
function cancelOutput() {
  if (!pending.value || saving.value) return
  finishOutput(pending.value, false)
  error.value = ''; status.value = ''
}
async function saveOutput(action: SaveAction) {
  const output = pending.value
  if (!output || saving.value || auth.user?.id !== actor) return
  const local = action === 'download' || action === 'download-png'
  const replace = action === 'replace' || action === 'png'
  if ((replace && !canReplace.value) || (action === 'copy' && !isCopyAllowed.value)) return
  const png = action === 'png' || action === 'download-png'
  let name = replace ? target.value.name : png ? downloadFilename(target.value.name) : downloadFilename(outputName.value.trim() || output.name)
  const ext = output.name.includes('.') ? documentExtension(output.name) : ''
  if (!replace && !png && ext && documentExtension(name) !== ext) {
    name = downloadFilename(`${name.replace(/\.[^.]+$/, '').slice(0, 175 - ext.length)}.${ext}`)
  }
  saving.value = true; error.value = ''; status.value = ''
  try {
    const blob = png ? await photoPsdToPng(output.bytes) : new Blob([output.bytes], { type: output.type || (ext === 'png' ? 'image/png' : '') })
    if (auth.user?.id !== actor) return
    const adopt = !replace && (output.saveAs || (photo.value && layered.value) || (editor.value?.key === 'gridcraft' && documentEditor(name)?.key === 'gridcraft'))
    if (local) {
      if (!await saveFile(blob, name)) return
      status.value = 'Файл скачан на устройство.'
    } else if (props.adapter) {
      const result = await props.adapter.save(blob, name, !replace, adopt)
      if (auth.user?.id !== actor) return
      target.value = result; status.value = 'Файл сохранён.'; emit('saved')
    } else {
      if (blob.size > documentMaxSize) throw new Error('Результат больше 20 МБ. Сохраните копию на устройство.')
      const body = new FormData(); body.append('file', blob, name)
      if (!replace && target.value.folderId) body.append('folderId', target.value.folderId)
      if (replace) body.append('revision', String(target.value.revision))
      const result = await sharedRequest<{ id: string }>(replace ? `/api/projects/${props.projectId}/documents/${target.value.id}/content` : `/api/projects/${props.projectId}/documents`, { method: replace ? 'PUT' : 'POST', body })
      if (auth.user?.id !== actor) return
      if (replace || adopt) target.value = { ...target.value, id: result.id, name, size: blob.size, revision: replace ? target.value.revision + 1 : 1 }
      status.value = replace ? 'Изменения сохранены в проекте.' : 'Копия сохранена в документах проекта.'
      emit('saved')
    }
    if (!local && adopt && downloadFilename(target.value.name) === name) editorName.value = output.name
    finishOutput(output, true, replace || (!local && adopt))
  } catch (failure: any) {
    error.value = failure?.data?.message || failure?.message || 'Не удалось сохранить файл. Ваша копия остаётся в редакторе.'
  } finally { saving.value = false }
}
function close() { if (unsaved.value) confirmClose.value = true; else emit('close') }
function unload(event: BeforeUnloadEvent) { if (unsaved.value) { event.preventDefault(); event.returnValue = '' } }
function key(event: KeyboardEvent) { if (event.key === 'Escape' && !saving.value && !confirmClose.value && !pending.value) { event.preventDefault(); close() } }
watch(() => auth.user?.id, id => { if (id !== actor) emit('close') })
const removeRouteGuard = router.beforeEach(() => !unsaved.value || window.confirm('Есть несохранённые изменения. Покинуть редактор?'))
onMounted(() => { window.addEventListener('message', receive); window.addEventListener('beforeunload', unload); window.addEventListener('keydown', key); void load() })
onBeforeUnmount(() => { removeRouteGuard(); detachActivity(); clearTimeout(timeout); window.removeEventListener('message', receive); window.removeEventListener('beforeunload', unload); window.removeEventListener('keydown', key) })
</script>
<template>
  <UModal :open="true" fullscreen :dismissible="false" :close="false" :title="`${editor?.label}: ${target.name}`" :ui="{overlay:'z-[100]',content:'z-[101] rounded-none',header:'sr-only',body:'p-0 sm:p-0 flex min-h-0 flex-1'}"><template #body><section class="document-editor" data-state="open" :aria-label="`${editor?.label}: ${target.name}`">
    <header><div><strong>{{ target.name }}</strong><span>{{ editor?.label }} · {{ editable ? 'Редактирование' : 'Просмотр · сохранение копии только на устройство' }}</span></div><select v-if="adapter" aria-label="При сохранении в редакторе" class="editor-destination" @change="destination(($event.target as HTMLSelectElement).value)"><option value="source">{{editable?'Сохранить изменения':'Скачать копию'}}</option><option v-if="allowChooseDestination!==false" value="choose">Сохранить в другой раздел…</option><option value="download">Скачать на устройство</option></select><span v-if="saving" role="status">Сохраняем…</span><span v-else-if="dirty||pending" class="editor-unsaved">Есть изменения</span><UButton label="Закрыть" icon="i-lucide-x" color="neutral" variant="outline" :disabled="saving" @click="close"/></header>
    <UAlert v-if="error" color="error" :description="error" class="editor-message"/>
    <UAlert v-if="status" color="success" :description="status" class="editor-message"/>
    <section v-if="pending" class="editor-recovery" aria-label="Параметры сохранения">
      <div class="editor-output-heading">
        <strong>{{ choosePng ? 'Сохранить изменения в PNG или создать PSD?' : 'Сохранить или скачать файл' }}</strong>
        <p v-if="choosePng" class="text-sm text-muted">PNG сохраняет итоговое изображение. PSD также сохраняет слои.</p>
        <p v-else class="text-sm text-muted">{{ pending.name }}<span v-if="outputs.length > 1"> · файлов к сохранению: {{ outputs.length }}</span></p>
      </div>
      <UInput v-model="outputName" aria-label="Имя копии для сохранения или скачивания" :disabled="saving" class="editor-output-name"/>
      <UButton v-if="canReplace" :label="choosePng ? 'Сохранить в PNG' : 'Обновить исходный файл'" :disabled="saving" @click="saveOutput(choosePng ? 'png' : 'replace')"/>
      <UButton v-if="isCopyAllowed" :label="choosePng ? `Создать ${extension.toUpperCase()}` : (adapter ? 'Сохранить копию…' : 'Сохранить копию в проекте')" :disabled="saving" color="neutral" variant="outline" @click="saveOutput('copy')"/>
      <UButton :label="choosePng ? `Скачать ${extension.toUpperCase()}` : 'Скачать на устройство'" :disabled="saving" color="neutral" variant="outline" @click="saveOutput('download')"/>
      <UButton v-if="choosePng" label="Скачать PNG" :disabled="saving" color="neutral" variant="outline" @click="saveOutput('download-png')"/>
      <UButton label="Отмена" :disabled="saving" color="neutral" variant="ghost" @click="cancelOutput"/>
    </section>
    <p v-if="loading" class="editor-loading" role="status"><UIcon name="i-lucide-loader-circle" class="animate-spin"/>Загружаем {{editor?.label}}… При первом открытии это может занять некоторое время.</p>
    <iframe v-if="bytes&&source" ref="frame" :src="source" @load="bindFrameActivity" :title="`${editor?.label} — ${target.name}`" allow="clipboard-read; clipboard-write; fullscreen"/>
    <p v-if="!loading&&!bytes" class="editor-loading">Закройте редактор и откройте файл заново.</p>
    <UModal v-model:open="confirmClose" :ui="{ overlay: 'z-[110]', content: 'z-[111]' }" title="Закрыть без сохранения?" description="Несохранённые изменения будут потеряны. Вернитесь в редактор и сохраните файл либо скачайте вашу копию."><template #footer><UButton label="Вернуться" color="neutral" variant="outline" @click="confirmClose=false"/><UButton label="Закрыть без сохранения" color="error" @click="emit('close')"/></template></UModal>
  </section></template></UModal>
</template>
<style scoped>
.document-editor{position:fixed;inset:0;z-index:100;display:flex;flex-direction:column;background:#f1f5f9}.document-editor>header{display:flex;align-items:center;gap:16px;padding:12px 20px;background:#fff;border-bottom:1px solid #e2e8f0;flex-shrink:0}.document-editor>header>div{min-width:0;flex:1}.document-editor strong{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.document-editor header span{font-size:12px;color:#64748b}.document-editor iframe{width:100%;flex:1;border:0;min-height:0;background:#e6e6e6}.editor-message{margin:8px 16px;flex-shrink:0}.editor-loading{padding:18px;display:flex;gap:10px;font-size:13px;color:#64748b}.editor-recovery{display:flex;align-items:center;gap:10px;padding:12px 16px;flex-wrap:wrap;background:white;border-bottom:1px solid #e2e8f0}.editor-output-heading{width:100%;min-width:0}.editor-output-name{min-width:180px;max-width:360px;flex:1}.document-editor header .editor-unsaved{color:#b45309}@media(max-width:600px){.document-editor>header{padding:10px;gap:8px}.document-editor header>span{display:none}}
.editor-destination{max-width:220px;border:1px solid #cbd5e1;border-radius:8px;padding:7px;background:white;font-size:12px;color:#475569}
</style>
