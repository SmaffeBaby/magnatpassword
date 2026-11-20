<script setup lang="ts">
import FileUpload from '~/components/Shared/FileUpload.vue'
import ProjectImageViewer from './ProjectImageViewer.vue'
import type { Project } from '~~/shared/types/projects'
import type { ProjectDocument, ProjectDocumentChange, ProjectDocumentFolder } from '~~/shared/types/project-documents'
import { canEditProjectSection } from '~~/shared/utils/project-permissions'
import { documentEditor, documentEditors, documentExtension, documentSize, documentMaxSize } from '~~/shared/utils/project-documents'
import { saveFile } from '~/utils/file-download'
import { canPreviewProjectImage } from '~/utils/project-image-preview'
const props = defineProps<{ project: Project }>()
const auth = useAuthStore(), route = useRoute(), router = useRouter(), { query, folders, base, refresh, content } = useProjectDocuments(() => props.project.id)
const office = useOffice()
const previewFile = ref<ProjectDocument | null>(null)
const canUpload = computed(() => canEditProjectSection(props.project, 'documents'))
const search = ref(''), kind = ref('all'), accessFilter = ref('all'), sort = ref('updated'), direction = ref<'asc'|'desc'>('desc')
const busy = ref(false), error = ref(''), uploadStatus = ref('')
const editing = ref<ProjectDocument | null>(null), deleting = ref<ProjectDocument | null>(null), accessFile = ref<ProjectDocument | null>(null), replacing = ref<ProjectDocument | null>(null)
const form = reactive({ name: '', description: '', tags: '' })
const access = reactive({ defaultPermission: 'inherit', members: {} as Record<string,string> })
const permissions = [{ label: 'Не показывать', value: 'hidden' },{ label: 'Просмотр', value: 'viewer' },{ label: 'Редактирование', value: 'editor' }]
const defaults = [{ label: 'Как в разделе «Документы»', value: 'inherit' }, ...permissions]
const fileMemberOptions = [{ label: 'Как для всех участников', value: 'inherit' }, ...permissions]
const files = computed(() => {
  const term = search.value.trim().toLocaleLowerCase('ru')
  const rows = (query.data.value ?? []).filter(file => file.folderId === folderId.value && !missingFolder.value && (!term || `${file.name} ${file.description} ${file.tags.join(' ')}`.toLocaleLowerCase('ru').includes(term)) && (kind.value === 'all' || (documentEditor(file.name)?.key ?? 'other') === kind.value) && (accessFilter.value === 'all' || (accessFilter.value === 'editable' ? file.permission !== 'viewer' : file.createdBy === auth.user?.id)))
  return rows.sort((a,b) => {
    const comparison = sort.value === 'name' ? a.name.localeCompare(b.name, 'ru', { numeric: true }) : sort.value === 'size' ? a.size - b.size : sort.value === 'type' ? documentExtension(a.name).localeCompare(documentExtension(b.name)) : a.updatedAt.localeCompare(b.updatedAt)
    return (comparison || a.name.localeCompare(b.name,'ru')) * (direction.value === 'asc' ? 1 : -1)
  })
})
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
function editable(file: ProjectDocument) { return file.permission === 'owner' || file.permission === 'editor' }
function icon(file: ProjectDocument) { return ({ wordcraft: 'i-lucide-file-text', pdfcraft: 'i-lucide-file-type', gridcraft: 'i-lucide-sheet', deckcraft: 'i-lucide-presentation', photocraft: 'i-lucide-image' } as Record<string,string>)[documentEditor(file.name)?.key ?? ''] || 'i-lucide-file' }
async function run(action: () => Promise<void>) {
  if (busy.value) return
  const actor = auth.user?.id
  busy.value = true; error.value = ''
  try { await action(); if (auth.user?.id === actor) await refresh() }
  catch (failure: any) { if (auth.user?.id === actor) { error.value = failure?.data?.message || failure?.message || 'Не удалось выполнить действие'; if ([403,404,409].includes(failure?.statusCode)) await refresh() } }
  finally { busy.value = false; uploadStatus.value = '' }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, selected = Array.from(input.files ?? []), actor = auth.user?.id
  if (!selected.length) return
  await run(async () => {
    const failures: string[] = []
    for (const [index,file] of selected.entries()) {
      if (auth.user?.id !== actor) break
      uploadStatus.value = `${index+1} из ${selected.length}: ${file.name}`
      if (!file.size || file.size > documentMaxSize) { failures.push(`${file.name}: нужен непустой файл до 20 МБ`); continue }
      try { const body = new FormData(); body.append('file', file); if (folderId.value) body.append('folderId', folderId.value); await sharedRequest(base.value, { method: 'POST', body }) }
      catch (failure: any) { failures.push(`${file.name}: ${failure?.data?.message || 'не удалось загрузить'}`) }
    }
    if (failures.length) { await refresh(); throw new Error(failures.join('\n')) }
  })
  input.value = ''
}
async function download(file: ProjectDocument) { await run(async () => { await saveFile(await content(file), file.name) }) }
function edit(file: ProjectDocument) { editing.value = file; Object.assign(form, { name: file.name, description: file.description, tags: file.tags.join(', ') }); error.value = '' }
function saveMetadata() { const file = editing.value; if (!file) return; void run(async () => { await sharedRequest(`${base.value}/${file.id}`, { method: 'PUT', body: { revision: file.revision, name: form.name.trim(), description: form.description, tags: [...new Set(form.tags.split(',').map(tag => tag.trim()).filter(Boolean))] } }); editing.value = null }) }
function showAccess(file: ProjectDocument) { accessFile.value = file; access.defaultPermission = file.defaultPermission ?? 'inherit'; access.members = Object.fromEntries((file.members ?? []).map(m => [m.userId,m.permission])); error.value = '' }
function saveAccess() { const file = accessFile.value; if (!file) return; void run(async () => { await sharedRequest(`${base.value}/${file.id}/access`, { method: 'PUT', body: { revision: file.revision, defaultPermission: access.defaultPermission, members: Object.entries(access.members).filter(([,permission]) => permission !== 'inherit').map(([userId,permission]) => ({userId,permission})) } }); accessFile.value = null }) }
function remove() { const file = deleting.value; if (!file) return; void run(async () => { await sharedRequest(`${base.value}/${file.id}`, { method: 'DELETE', body: { revision: file.revision } }); deleting.value = null }) }
async function replace(event: Event) {
  const input = event.target as HTMLInputElement, selected = input.files?.[0], file = replacing.value
  if (!selected || !file) return
  await run(async () => { const body = new FormData(); body.append('file', selected); body.append('revision', String(file.revision)); await sharedRequest(`${base.value}/${file.id}/content`, { method: 'PUT', body }); replacing.value = null })
  input.value = ''
}
const historyFile = ref<ProjectDocument | null>(null)
const history = ref<ProjectDocumentChange[]>([]), historyLoading = ref(false), historyError = ref('')
const changeLabels: Record<ProjectDocumentChange['action'], string> = {
  create: 'Создание файла', replace: 'Сохранение содержимого', metadata: 'Изменение названия, описания или меток',
  move: 'Перемещение файла', access: 'Изменение доступа', legacy: 'Изменение до появления истории'
}
let historyRequest = 0
async function showHistory(file: ProjectDocument) {
  const request = ++historyRequest
  historyFile.value = file; history.value = []; historyError.value = ''; historyLoading.value = true
  try {
    const result = await sharedRequest<ProjectDocumentChange[]>(`${base.value}/${file.id}/history`)
    if (request === historyRequest) history.value = result
  } catch {
    if (request === historyRequest) historyError.value = 'Не удалось загрузить историю файла.'
  } finally {
    if (request === historyRequest) historyLoading.value = false
  }
}
function closeHistory() { historyRequest++; historyFile.value = null; history.value = [] }
function actions(file: ProjectDocument) {
  const editor = documentEditor(file.name)
  const previewable = canPreviewProjectImage(file.name)
  return [
    ...(previewable ? [{ label: 'На весь экран', icon: 'i-lucide-maximize', onSelect: () => openFile(file) }] : []),
    ...(editor ? [{ label: previewable ? 'Открыть в PhotoCraft' : 'Открыть', icon: 'i-lucide-external-link', onSelect: () => openDocument(file) }] : []),
    ...(canUpload.value ? [{ label: 'Копировать в папку', icon: 'i-lucide-copy', onSelect: () => showOperation('copy', file) }] : []),
    ...(editable(file) ? [{ label: 'Переместить', icon: 'i-lucide-folder-input', onSelect: () => showOperation('move', file) }] : []),
    ...(canUpload.value && documentExtension(file.name) === 'zip' ? [{ label: 'Распаковать ZIP', icon: 'i-lucide-archive-restore', onSelect: () => showOperation('extract', file) }] : []),
    { label: 'История изменений', icon: 'i-lucide-history', onSelect: () => showHistory(file) },
    { label: 'Скачать', icon: 'i-lucide-download', onSelect: () => download(file) },
    ...(editable(file) ? [{ label: 'Название и метки', icon: 'i-lucide-pencil', onSelect: () => edit(file) }, { label: 'Заменить файл', icon: 'i-lucide-file-up', onSelect: () => { replacing.value = file; error.value = '' } }] : []),
    ...(file.canManage ? [{ label: 'Доступ участников', icon: 'i-lucide-users-round', onSelect: () => showAccess(file) }] : []),
    ...(editable(file) ? [{ label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleting.value = file; error.value = '' } }] : [])
  ]
}
watch(() => [auth.user?.id, props.project.id], () => { previewFile.value = null; closeHistory(); operation.value = null; editing.value = null; accessFile.value = null; deleting.value = null; replacing.value = null })

const folderId = computed(() => typeof route.query.folder === 'string' ? route.query.folder : null)
const view = ref<'list'|'tiles'>('list')
const sidebarOpen = ref(true)
const expandedFolders = ref(new Set<string>())
const folderList = computed(() => folders.data.value ?? [])
function folderPath(id: string | null) {
  const path: ProjectDocumentFolder[] = []
  while (id && path.length < 20) { const folder = folderList.value.find(f => f.id === id); if (!folder || path.some(f => f.id === id)) break; path.unshift(folder); id = folder.parentId }
  return path
}
const breadcrumbs = computed(() => folderPath(folderId.value))
const missingFolder = computed(() => !!folderId.value && !folders.isPending.value && !folderList.value.some(f => f.id === folderId.value))
const childFolders = computed(() => folderList.value.filter(f => f.parentId === folderId.value && (!search.value || f.name.toLocaleLowerCase('ru').includes(search.value.toLocaleLowerCase('ru')))).sort((a,b) => a.name.localeCompare(b.name, 'ru', { numeric: true })))
const folderOptions = computed(() => [{ label: '/ Документы проекта', value: 'root' }, ...folderList.value.map(f => ({ label: '/ ' + folderPath(f.id).map(p => p.name).join(' / '), value: f.id })).sort((a,b) => a.label.localeCompare(b.label, 'ru'))])
const parentFolderId = computed(() => breadcrumbs.value.at(-1)?.parentId ?? null)
const treeRows = computed(() => {
  type TreeRow = { id: string; name: string; depth: number; folder?: ProjectDocumentFolder; file?: ProjectDocument }
  const rows: TreeRow[] = []
  const visited = new Set<string>()
  const children = new Map<string | null, ProjectDocumentFolder[]>()
  const documents = new Map<string | null, ProjectDocument[]>()
  for (const folder of folderList.value) {
    const siblings = children.get(folder.parentId) ?? []
    siblings.push(folder); children.set(folder.parentId, siblings)
  }
  for (const file of query.data.value ?? []) {
    const siblings = documents.get(file.folderId) ?? []
    siblings.push(file); documents.set(file.folderId, siblings)
  }
  function append(parentId: string | null, depth: number) {
    for (const folder of (children.get(parentId) ?? []).sort((a,b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))) {
      if (visited.has(folder.id)) continue
      visited.add(folder.id)
      rows.push({ id: folder.id, name: folder.name, depth, folder })
      if (expandedFolders.value.has(folder.id)) append(folder.id, depth + 1)
    }
    for (const file of (documents.get(parentId) ?? []).sort((a,b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))) {
      rows.push({ id: file.id, name: file.name, depth, file })
    }
  }
  append(null, 0)
  return rows
})
function toggleFolder(id: string) {
  const expanded = new Set(expandedFolders.value)
  if (expanded.has(id)) expanded.delete(id)
  else expanded.add(id)
  expandedFolders.value = expanded
}
watch(breadcrumbs, path => {
  expandedFolders.value = new Set([...expandedFolders.value, ...path.map(folder => folder.id)])
}, { immediate: true })
watch(() => props.project.id, () => { expandedFolders.value = new Set() })
async function openDocument(file: ProjectDocument) {
  previewFile.value = null
  error.value = ''
  try { await office.openSource({ kind: 'document', projectId: props.project.id, fileId: file.id }) }
  catch (failure: any) { error.value = failure?.data?.message || failure?.message || 'Не удалось открыть документ' }
}
function openFile(file: ProjectDocument) {
  if (canPreviewProjectImage(file.name)) previewFile.value = file
  else if (documentEditor(file.name)) void openDocument(file)
  else void download(file)
}
function openTreeFile(file: ProjectDocument) {
  navigateFolder(file.folderId)
  openFile(file)
}
function navigateFolder(id: string | null) { void router.push({ query: { ...route.query, folder: id || undefined } }) }
type Operation = 'folder'|'rename-folder'|'delete-folder'|'create'|'copy'|'move'|'extract'|'import'
const operation = ref<Operation | null>(null), operationFile = ref<ProjectDocument | null>(null), operationFolder = ref<ProjectDocumentFolder | null>(null)
const operationName = ref(''), destination = ref('root'), newKind = ref('wordcraft'), archive = shallowRef<File | null>(null), notice = ref('')
const operationTitles: Record<Operation,string> = { folder: 'Создать папку', 'rename-folder': 'Переименовать папку', 'delete-folder': 'Удалить папку и её содержимое?', create: 'Создать файл', copy: 'Копировать файл', move: 'Переместить файл', extract: 'Распаковать ZIP', import: 'Импорт документов из ZIP' }
function showOperation(action: Operation, file?: ProjectDocument, folder?: ProjectDocumentFolder) {
  operation.value = action; operationFile.value = file ?? null; operationFolder.value = folder ?? null
  operationName.value = folder?.name ?? ''; destination.value = folderId.value ?? 'root'; archive.value = null; folderDeletion.value = null; error.value = ''; notice.value = ''
  if (action === 'delete-folder') void loadFolderDeletion()
}
async function submitOperation() {
  const action = operation.value; if (!action) return
  await run(async () => {
    const target = destination.value === 'root' ? null : destination.value
    if (action === 'delete-folder') {
      const folder = operationFolder.value, plan = folderDeletion.value
      if (!folder || !plan) throw new Error('Сначала обновите информацию о содержимом папки')
      try { await sharedRequest(`${base.value}/folders/${folder.id}/deletion`, { method: 'DELETE', body: { revision: folder.revision, token: plan.token } }) }
      catch (failure: any) { folderDeletion.value = null; throw failure }
      notice.value = `Удалено файлов: ${plan.filesCount}, папок: ${plan.foldersCount}.`
    } else if (['folder','rename-folder'].includes(action)) {
      const folder = operationFolder.value
      await sharedRequest(`${base.value}/folders`, { method: 'POST', body: { action: action === 'folder' ? 'create' : 'rename', ...(folder ? { id: folder.id, revision: folder.revision } : {}), name: operationName.value.trim(), parentId: action === 'folder' ? target : folder?.parentId ?? null } })
    } else if (action === 'create') {
      const result = await sharedRequest<{ id: string }>(`${base.value}/create`, { method: 'POST', body: { name: operationName.value.trim(), kind: newKind.value, folderId: target } })
      await office.openSource({ kind: 'document', projectId: props.project.id, fileId: result.id })
    } else if (action === 'import') {
      if (!archive.value) throw new Error('Выберите ZIP-архив')
      const body = new FormData(); body.append('file', archive.value); if (target) body.append('folderId', target)
      const result = await sharedRequest<{ files: number; folders: number }>(`${base.value}/import`, { method: 'POST', body })
      notice.value = `Импортировано файлов: ${result.files}, новых папок: ${result.folders}.`
    } else {
      const file = operationFile.value; if (!file) return
      const result = await sharedRequest<{ files?: number; folders?: number }>(`${base.value}/${file.id}/${action === 'extract' ? 'extract' : 'transfer'}`, { method: 'POST', body: { ...(action === 'extract' ? {} : { action }), folderId: target, revision: file.revision } })
      if (action === 'extract') notice.value = `Распаковано файлов: ${result.files}, новых папок: ${result.folders}.`
      else notice.value = action === 'copy' ? 'Копия создана. Права доступа к файлу сохранены.' : 'Файл перемещён.'
    }
    operation.value = null
  })
}
function chooseArchive(event: Event) { archive.value = (event.target as HTMLInputElement).files?.[0] ?? null }
function exportDocuments(all = false) { void run(async () => { const data = await sharedRequest<Blob>(`${base.value}/export`, { method: 'POST', body: { folderId: all ? null : folderId.value }, responseType: 'blob' }); await saveFile(data, 'Документы проекта.zip') }) }
onMounted(() => { try { view.value = localStorage.getItem(`project-documents-view:${auth.user?.id}`) === 'tiles' ? 'tiles' : 'list' } catch {} })
watch(view, value => { try { localStorage.setItem(`project-documents-view:${auth.user?.id}`, value) } catch {} })

type FolderDeletePlan = { filesCount: number; foldersCount: number; token: string }
const selectedIds = ref<string[]>([]), selectedFolderIds = ref<string[]>([])
const bulkDeletion = ref<{ files: ProjectDocument[]; folders: (ProjectDocumentFolder & FolderDeletePlan)[]; filesCount: number; foldersCount: number } | null>(null)
const selectableFiles = computed(() => files.value.filter(editable))
const selectedFiles = computed(() => selectableFiles.value.filter(file => selectedIds.value.includes(file.id)))
const selectableFolders = computed(() => canUpload.value ? childFolders.value : [])
const selectedFolders = computed(() => selectableFolders.value.filter(folder => selectedFolderIds.value.includes(folder.id)))
const selectedCount = computed(() => selectedFiles.value.length + selectedFolders.value.length)
const allSelected = computed(() => selectedCount.value > 0 && selectedCount.value === selectableFiles.value.length + selectableFolders.value.length)
const folderDeletion = ref<{ filesCount: number; foldersCount: number; token: string } | null>(null)
function selectFile(file: ProjectDocument, checked: boolean) {
  if (!editable(file) || busy.value) return
  selectedIds.value = checked ? [...new Set([...selectedIds.value, file.id])] : selectedIds.value.filter(id => id !== file.id)
}
function selectFolder(folder: ProjectDocumentFolder, checked: boolean) {
  if (!canUpload.value || busy.value) return
  selectedFolderIds.value = checked ? [...new Set([...selectedFolderIds.value, folder.id])] : selectedFolderIds.value.filter(id => id !== folder.id)
}
function clearSelection() { selectedIds.value = []; selectedFolderIds.value = [] }
function selectAll(checked: boolean) { selectedIds.value = checked ? selectableFiles.value.map(file => file.id) : []; selectedFolderIds.value = checked ? selectableFolders.value.map(folder => folder.id) : [] }
async function confirmBulkDeletion() {
  const files = selectedFiles.value.map(file => ({ ...file })), folders = selectedFolders.value.map(folder => ({ ...folder })), actor = auth.user?.id
  if (!files.length && !folders.length) return
  await run(async () => {
    const plans: (ProjectDocumentFolder & FolderDeletePlan)[] = []
    for (const folder of folders) plans.push({ ...folder, ...await sharedRequest<FolderDeletePlan>(`${base.value}/folders/${folder.id}/deletion`) })
    if (auth.user?.id === actor) bulkDeletion.value = { files, folders: plans, filesCount: files.length + plans.reduce((sum,p) => sum + p.filesCount, 0), foldersCount: plans.reduce((sum,p) => sum + p.foldersCount, 0) }
  })
}
async function deleteSelected() {
  const snapshot = bulkDeletion.value; if (!snapshot) return
  await run(async () => {
    try {
      const result = await sharedRequest<{ deleted: number; deletedFolders: number }>(`${base.value}/delete`, { method: 'POST', body: { files: snapshot.files.map(file => ({ id: file.id, revision: file.revision })), folders: snapshot.folders.map(folder => ({ id: folder.id, revision: folder.revision, token: folder.token })) } }); notice.value = `Удалено файлов: ${result.deleted}, папок: ${result.deletedFolders}.`
    } catch (failure: any) { if ([403,404,409].includes(failure?.statusCode)) bulkDeletion.value = null; throw failure }
    clearSelection(); bulkDeletion.value = null
  })
}
async function loadFolderDeletion() {
  const folder = operationFolder.value; if (!folder || operation.value !== 'delete-folder') return
  operationFolder.value = folderList.value.find(f => f.id === folder.id) ?? folder
  folderDeletion.value = null
  await run(async () => {
    const plan = await sharedRequest<{ filesCount: number; foldersCount: number; token: string }>(`${base.value}/folders/${folder.id}/deletion`)
    if (operation.value === 'delete-folder' && operationFolder.value?.id === folder.id) folderDeletion.value = plan
  })
}
watch([folderId, search, kind, accessFilter, () => props.project.id, () => auth.user?.id], () => { clearSelection(); bulkDeletion.value = null; folderDeletion.value = null })
watch(selectableFolders, visible => { selectedFolderIds.value = selectedFolderIds.value.filter(id => visible.some(folder => folder.id === id)) })
watch(files, visible => { selectedIds.value = selectedIds.value.filter(id => visible.some(file => file.id === id && editable(file))) })
</script>
<template>
  <div class="project-documents">
    <p class="documents-intro">Общие файлы проекта. Word, PDF, таблицы, презентации и изображения открываются во встроенных редакторах. Изменения сохраняются в проект при сохранении в редакторе.</p>
    <UAlert v-if="missingFolder" color="warning" title="Папка не найдена" description="Возможно, папка удалена. Вернитесь в корень документов."/>
    <div class="documents-actions">
      <UButton :icon="sidebarOpen?'i-lucide-panel-left-close':'i-lucide-panel-left-open'" :label="sidebarOpen?'Скрыть дерево':'Показать дерево'" color="neutral" variant="outline" :aria-expanded="sidebarOpen" aria-controls="project-documents-tree" @click="sidebarOpen=!sidebarOpen"/>
      <UButton v-if="canUpload" label="Создать файл" icon="i-lucide-file-plus-2" :disabled="busy||missingFolder" @click="showOperation('create')"/>
      <UButton v-if="canUpload" label="Создать папку" icon="i-lucide-folder-plus" color="neutral" variant="outline" :disabled="busy||missingFolder" @click="showOperation('folder')"/>
      <UButton v-if="canUpload" label="Импорт ZIP" icon="i-lucide-import" color="neutral" variant="outline" :disabled="busy||missingFolder" @click="showOperation('import')"/>
      <UDropdownMenu :items="[{label:'Экспорт текущей папки',onSelect:()=>exportDocuments()},{label:'Экспорт всех документов проекта',onSelect:()=>exportDocuments(true)}]"><UButton label="Экспорт ZIP" icon="i-lucide-download" color="neutral" variant="outline" :disabled="busy||missingFolder"/></UDropdownMenu>
      <div class="documents-view"><UButton icon="i-lucide-list" aria-label="Вид списком" :aria-pressed="view==='list'" color="neutral" :variant="view==='list'?'soft':'ghost'" @click="view='list'"/><UButton icon="i-lucide-layout-grid" aria-label="Вид плитками" :aria-pressed="view==='tiles'" color="neutral" :variant="view==='tiles'?'soft':'ghost'" @click="view='tiles'"/></div>
    </div>
    <FileUpload v-if="canUpload&&!missingFolder" label="Загрузить документы в текущую папку" hint="Любые файлы, включая архивы, до 20 МБ каждый. ZIP можно распаковать через меню файла." multiple :disabled="busy" @change="upload"/>
    <UAlert v-if="notice" color="success" :description="notice"/>
    <p v-if="uploadStatus" class="documents-status" role="status">{{uploadStatus}}</p>
    <UAlert v-if="error" color="error" :description="error"/>
    <div class="documents-toolbar">
      <UInput v-model="search" icon="i-lucide-search" placeholder="Поиск в текущей папке" aria-label="Поиск документов"/>
      <USelect v-model="kind" :items="[{label:'Все форматы',value:'all'},...documentEditors.map(editor=>({label:editor.label,value:editor.key})),{label:'Другие файлы',value:'other'}]" aria-label="Формат документа"/>
      <USelect v-model="accessFilter" :items="[{label:'Все доступные',value:'all'},{label:'Могу редактировать',value:'editable'},{label:'Загруженные мной',value:'mine'}]" aria-label="Доступ к документам"/>
      <USelect v-model="sort" :items="[{label:'По дате изменения',value:'updated'},{label:'По названию',value:'name'},{label:'По размеру',value:'size'},{label:'По расширению',value:'type'}]" aria-label="Сортировка документов"/>
      <UButton :icon="direction==='asc'?'i-lucide-arrow-up-narrow-wide':'i-lucide-arrow-down-wide-narrow'" :aria-label="direction==='asc'?'Сортировать по убыванию':'Сортировать по возрастанию'" color="neutral" variant="outline" @click="direction=direction==='asc'?'desc':'asc'"/>
      <UButton icon="i-lucide-refresh-cw" aria-label="Обновить документы" color="neutral" variant="ghost" :loading="query.isFetching.value||folders.isFetching.value" @click="refresh"/>
    </div>
    <UAlert v-if="query.error.value" color="error" title="Не удалось загрузить документы" :description="(query.error.value as any)?.data?.message" :actions="[{label:'Повторить',onClick:()=>query.refetch()}]"/>
    <UAlert v-else-if="folders.error.value" color="error" title="Не удалось загрузить папки" :description="(folders.error.value as any)?.data?.message" :actions="[{label:'Повторить',onClick:()=>refresh()}]"/>
    <p v-else-if="query.isPending.value||folders.isPending.value" class="documents-status">Загружаем документы…</p>
    <template v-else>
      <div class="documents-result"><span>Найдено: {{files.length}} из {{query.data.value?.length ?? 0}}</span><span>Доступ к файлам настраивает владелец проекта</span></div>
      <div v-if="selectableFiles.length||selectableFolders.length" class="documents-selection"><UCheckbox :model-value="allSelected?true:selectedCount?'indeterminate':false" label="Выбрать всё в списке" :disabled="busy" @update:model-value="value=>selectAll(value===true)"/><span v-if="selectedCount">Выбрано: {{selectedCount}}</span><UButton v-if="selectedCount" label="Удалить выбранные" icon="i-lucide-trash-2" color="error" variant="soft" :disabled="busy" @click="confirmBulkDeletion"/><UButton v-if="selectedCount" label="Снять выделение" color="neutral" variant="ghost" :disabled="busy" @click="clearSelection"/></div>
    <nav class="documents-path" aria-label="Путь внутри проекта"><UButton label="Документы проекта" icon="i-lucide-folder-root" color="neutral" variant="ghost" @click="navigateFolder(null)"/><template v-for="folder in breadcrumbs" :key="folder.id"><span>/</span><UButton :label="folder.name" color="neutral" variant="ghost" @click="navigateFolder(folder.id)"/></template></nav>
    <div class="documents-workspace" :class="{'documents-workspace-expanded':sidebarOpen}">
      <Transition name="documents-sidebar">
        <div v-if="sidebarOpen" class="documents-sidebar-slot">
        <aside id="project-documents-tree" class="documents-sidebar" aria-label="Дерево файлов проекта">
          <div class="documents-sidebar-heading"><strong>Файлы проекта</strong><UButton icon="i-lucide-panel-left-close" aria-label="Скрыть дерево файлов" color="neutral" variant="ghost" @click="sidebarOpen=false"/></div>
          <nav class="documents-tree" aria-label="Папки и файлы">
            <button class="documents-tree-link documents-tree-root" :class="{'is-current':!folderId}" :aria-current="!folderId?'location':undefined" @click="navigateFolder(null)"><UIcon name="i-lucide-folder-root"/><span>Документы проекта</span></button>
            <p v-if="query.isPending.value||folders.isPending.value" class="documents-status">Загружаем дерево…</p>
            <p v-else-if="query.error.value||folders.error.value" class="documents-status">Не удалось загрузить дерево</p>
            <template v-else>
              <div v-for="row in treeRows" :key="`${row.folder?'folder':'file'}-${row.id}`" class="documents-tree-row" :style="{paddingLeft:`${row.depth*16}px`}">
                <button v-if="row.folder" class="documents-tree-toggle" :aria-label="`${expandedFolders.has(row.id)?'Свернуть':'Раскрыть'} папку: ${row.name}`" :aria-expanded="expandedFolders.has(row.id)" @click="toggleFolder(row.id)"><UIcon :name="expandedFolders.has(row.id)?'i-lucide-chevron-down':'i-lucide-chevron-right'"/></button>
                <span v-else class="documents-tree-spacer"/>
                <button class="documents-tree-link" :class="{'is-current':row.folder&&folderId===row.id}" :title="row.name" :aria-current="row.folder&&folderId===row.id?'location':undefined" :disabled="!!row.file&&busy" @click="row.folder?navigateFolder(row.id):row.file&&openTreeFile(row.file)"><UIcon :name="row.folder?(expandedFolders.has(row.id)?'i-lucide-folder-open':'i-lucide-folder'):icon(row.file!)"/><span>{{row.name}}</span></button>
              </div>
              <p v-if="!treeRows.length" class="documents-status">Пока нет файлов и папок</p>
            </template>
          </nav>
        </aside>
        </div>
      </Transition>
      <div class="documents-content">
      <div v-if="folderId||files.length||childFolders.length" class="documents-list" :class="{'documents-tiles':view==='tiles'}">
        <article v-if="folderId" class="document-row document-parent"><span class="document-select-placeholder"/><button class="document-main" aria-label="На папку вверх" title="На папку вверх" @click="navigateFolder(parentFolderId)"><UIcon name="i-lucide-corner-left-up"/><span><strong>...</strong></span></button></article>
        <article v-for="folder in childFolders" :key="folder.id" class="document-row document-folder" :class="{'document-selected':selectedFolderIds.includes(folder.id)}"><UCheckbox class="document-select" :model-value="selectedFolderIds.includes(folder.id)" :disabled="busy||!canUpload" :aria-label="`Выбрать папку: ${folder.name}`" @update:model-value="value=>selectFolder(folder,value===true)"/><button class="document-main" @click="navigateFolder(folder.id)"><UIcon name="i-lucide-folder"/><span><strong>{{folder.name}}</strong><small>Папка</small></span></button><UDropdownMenu v-if="canUpload" :items="[{label:'Переименовать',icon:'i-lucide-pencil',onSelect:()=>showOperation('rename-folder',undefined,folder)},{label:'Удалить папку',icon:'i-lucide-trash-2',onSelect:()=>showOperation('delete-folder',undefined,folder)}]"><UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" :disabled="busy" :aria-label="`Действия с папкой: ${folder.name}`"/></UDropdownMenu></article>
        <article v-for="file in files" :key="file.id" class="document-row" :class="{'document-selected':selectedIds.includes(file.id)}">
          <UCheckbox class="document-select" :model-value="selectedIds.includes(file.id)" :disabled="busy||!editable(file)" :aria-label="`Выбрать файл: ${file.name}`" @update:model-value="value=>selectFile(file,value===true)"/>
          <button class="document-main" :disabled="busy" @click="openFile(file)"><UIcon :name="icon(file)"/><span><strong>{{file.name}}</strong><small v-if="file.description">{{file.description}}</small><span v-if="file.tags.length" class="document-tags"><UBadge v-for="tag in file.tags" :key="tag" color="neutral" variant="soft" size="sm">{{tag}}</UBadge></span></span></button>
          <div class="document-meta"><span>{{documentSize(file.size)}}</span><small>{{date(file.updatedAt)}}</small><small>{{editable(file)?'Редактирование':'Просмотр'}} · версия {{file.revision}} · {{ file.lastChangedBy || 'Автор версии неизвестен' }}</small></div>
          <UDropdownMenu :items="actions(file)"><UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" :aria-label="`Действия: ${file.name}`" :disabled="busy"/></UDropdownMenu>
        </article>
      </div>
      <div v-if="!files.length&&!childFolders.length" class="documents-empty"><UIcon name="i-lucide-folder-open"/><h2>{{search||kind!=='all'||accessFilter!=='all'?'Файлы не найдены':'Папка пуста'}}</h2><p>{{canUpload?'Создайте файл, загрузите документы или импортируйте ZIP.':'Документы появятся, когда владелец проекта предоставит доступ.'}}</p></div>
      </div>
    </div>
    </template>
    <ProjectImageViewer :file="previewFile" :load="content" @close="previewFile = null">
      <template #actions>
        <UButton v-if="previewFile && documentEditor(previewFile.name)" label="Открыть в PhotoCraft" icon="i-lucide-external-link" color="neutral" variant="soft" @click="openDocument(previewFile)" />
      </template>
    </ProjectImageViewer>
    <UModal :open="!!bulkDeletion" title="Удалить выбранные файлы и папки?" :description="`Всего будет удалено файлов: ${bulkDeletion?.filesCount??0}, папок: ${bulkDeletion?.foldersCount??0}`" :dismissible="!busy" @update:open="value=>{if(!value)bulkDeletion=null}"><template #body><p class="text-sm text-slate-500">Выбранные файлы и папки со всем вложенным содержимым будут удалены из проекта для всех участников. Восстановить их будет невозможно.</p><ul class="documents-delete-preview"><li v-for="folder in bulkDeletion?.folders" :key="`folder-${folder.id}`">Папка «{{folder.name}}» — со всем содержимым</li><li v-for="file in bulkDeletion?.files" :key="file.id">{{file.name}}</li></ul><UAlert v-if="error" color="error" :description="error"/></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="busy" @click="bulkDeletion=null"/><UButton label="Удалить выбранное" color="error" :loading="busy" @click="deleteSelected"/></template></UModal>
    <UModal :open="!!editing" title="Название и метки" :dismissible="!busy" @update:open="value=>{if(!value)editing=null}"><template #body><form class="space-y-4" @submit.prevent="saveMetadata"><UFormField label="Название файла" required><UInput v-model="form.name" :maxlength="240" required class="w-full"/></UFormField><UFormField label="Описание"><UTextarea v-model="form.description" :maxlength="4000" class="w-full"/></UFormField><UFormField label="Метки через запятую"><UInput v-model="form.tags" class="w-full" placeholder="Договор, согласовано"/></UFormField><UAlert v-if="error" color="error" :description="error"/><UButton type="submit" label="Сохранить" :loading="busy"/></form></template></UModal>
    <UModal :open="!!accessFile" title="Доступ к файлу" :description="accessFile?.name" :dismissible="!busy" @update:open="value=>{if(!value)accessFile=null}"><template #body><form class="space-y-5" @submit.prevent="saveAccess"><p class="text-sm text-slate-500">Владелец проекта всегда имеет полный доступ. Скрытый проект или раздел «Документы» закрывает доступ ко всем его файлам.</p><UFormField label="Для всех участников"><USelect v-model="access.defaultPermission" :items="defaults" class="w-full"/></UFormField><UFormField v-for="member in project.members.filter(m=>m.permission!=='owner')" :key="member.userId" :label="member.fullName||member.email" :description="member.permission==='hidden'?'Проект скрыт от участника':undefined"><USelect :model-value="access.members[member.userId]??'inherit'" :items="fileMemberOptions" class="w-full" @update:model-value="value=>access.members[member.userId]=String(value)"/></UFormField><UAlert v-if="error" color="error" :description="error"/><UButton type="submit" label="Сохранить доступ" :loading="busy"/></form></template></UModal>
    <UModal :open="!!replacing" title="Заменить файл" :description="replacing?.name" :dismissible="!busy" @update:open="value=>{if(!value)replacing=null}"><template #body><p class="text-sm text-slate-500 mb-4">Будет сохранена новая версия. Права участников, описание и метки сохранятся.</p><FileUpload label="Выбрать новую версию" hint="Непустой файл до 20 МБ" :disabled="busy" @change="replace"/><UAlert v-if="error" color="error" :description="error" class="mt-4"/></template></UModal>
    <UModal :open="!!deleting" title="Удалить файл?" :description="deleting?.name" :dismissible="!busy" @update:open="value=>{if(!value)deleting=null}"><template #body><p class="text-sm text-slate-500">Файл будет удалён из проекта для всех участников. Восстановить его будет невозможно.</p><UAlert v-if="error" color="error" :description="error" class="mt-4"/></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="busy" @click="deleting=null"/><UButton label="Удалить" color="error" :loading="busy" @click="remove"/></template></UModal>
    <UModal :open="!!operation" :title="operation?operationTitles[operation]:''" :description="operationFile?.name||operationFolder?.name" :dismissible="!busy" @update:open="value=>{if(!value)operation=null}"><template #body><form class="space-y-4" @submit.prevent="submitOperation">
      <UFormField v-if="operation==='create'" label="Тип файла"><USelect v-model="newKind" :items="[{label:'Текстовый документ · WordCraft (.docx)',value:'wordcraft'},{label:'PDF · PdfCraft (.pdf)',value:'pdfcraft'},{label:'Таблица · GridCraft (.xlsx)',value:'gridcraft'},{label:'Презентация · DeckCraft (.pptx)',value:'deckcraft'},{label:'Изображение · PhotoCraft (.png)',value:'photocraft'}]" class="w-full"/></UFormField>
      <UFormField v-if="operation==='folder'||operation==='rename-folder'||operation==='create'" label="Название" required><UInput v-model="operationName" required :maxlength="operation==='create'?230:240" class="w-full" :placeholder="operation==='create'?'Новый документ':'Новая папка'"/></UFormField>
      <UFormField v-if="operation!=='rename-folder'&&operation!=='delete-folder'" label="Папка назначения"><USelect v-model="destination" :items="folderOptions" class="w-full"/></UFormField>
      <template v-if="operation==='import'"><FileUpload label="Выбрать ZIP-архив" accept=".zip" hint="ZIP до 100 МБ; после распаковки до 100 МБ, до 20 МБ на файл, до 500 файлов и 500 папок." :disabled="busy" @change="chooseArchive"/><p v-if="archive" class="text-sm">{{archive.name}}</p></template>
      <p v-if="operation==='copy'" class="text-sm text-slate-500">Копия сохранит описание, метки и права доступа к исходному файлу.</p>
      <p v-if="operation==='extract'||operation==='import'" class="text-sm text-slate-500">Вложенные папки сохраняются. Файлы добавляются как новые и наследуют доступ к разделу «Документы». Существующие файлы не перезаписываются. Архивы с паролем не поддерживаются.</p>
      <template v-if="operation==='delete-folder'"><p v-if="folderDeletion" class="text-sm text-slate-500">Папка будет удалена вместе со всем содержимым: файлов — {{folderDeletion.filesCount}}, вложенных папок — {{Math.max(0,folderDeletion.foldersCount-1)}}. Действие затронет всех участников проекта. Восстановить удалённое будет невозможно.</p><p v-else-if="busy" class="text-sm text-slate-500" role="status">Проверяем содержимое и права доступа…</p><UButton v-else label="Обновить информацию о содержимом" color="neutral" variant="outline" @click="loadFolderDeletion"/></template>
      <UAlert v-if="error" color="error" :description="error"/>
      <div class="flex gap-3"><UButton type="submit" :label="operation==='create'?'Создать и открыть':operation==='delete-folder'?'Удалить':'Выполнить'" :color="operation==='delete-folder'?'error':'primary'" :loading="busy" :disabled="operation==='delete-folder'&&!folderDeletion"/><UButton label="Отмена" color="neutral" variant="outline" :disabled="busy" @click="operation=null"/></div>
    </form></template></UModal>
    <UModal :open="!!historyFile" title="История изменений" :description="historyFile?.name" @update:open="value => { if (!value) closeHistory() }">
      <template #body>
        <p v-if="historyLoading" role="status">Загружаем историю…</p>
        <UAlert v-else-if="historyError" color="error" :description="historyError"/>
        <template v-else>
          <p v-if="history.some(change => change.action === 'legacy')" class="mb-3 text-sm text-muted">Для прежних версий доступны только дата создания и дата последнего изменения до появления истории.</p>
          <ol v-if="history.length" class="max-h-[55vh] divide-y divide-default overflow-auto" aria-label="Версии файла">
            <li v-for="change in history" :key="change.revision" class="py-3">
              <p class="text-sm font-medium">Версия {{ change.revision }} · {{ changeLabels[change.action] }}</p>
              <p class="text-sm text-muted">{{ change.actorName || 'Автор неизвестен' }} · {{ date(change.changedAt) }}</p>
            </li>
          </ol>
          <p v-else class="text-sm text-muted">История пока пуста.</p>
        </template>
      </template>
    </UModal>
  </div>
</template>
<style scoped>
.project-documents{display:grid;gap:20px}.documents-intro,.documents-status{font-size:13px;line-height:1.8;color:#8292a8}.documents-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.documents-toolbar>:first-child{flex:1;min-width:230px}.documents-result{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;font-size:12px;color:#94a3b8}.documents-list{border:1px solid #e2e8f0;border-radius:18px;overflow:hidden;background:#fff}.document-row{display:flex;align-items:center;gap:20px;padding:20px 24px}.document-row+.document-row{border-top:1px solid #e8edf3}.document-main{display:flex;gap:16px;align-items:center;min-width:0;flex:1;text-align:left}.document-main>.iconify{width:30px;height:30px;flex-shrink:0;color:#8292a8}.document-main>span{display:grid;gap:8px;min-width:0}.document-main strong{font-size:14px;color:#475569;overflow-wrap:anywhere}.document-main small{font-size:12px;color:#8292a8;white-space:pre-wrap}.document-tags{display:flex;gap:6px;flex-wrap:wrap}.document-meta{display:grid;gap:5px;text-align:right;flex-shrink:0;color:#64748b;font-size:12px}.document-meta small{font-size:11px;color:#94a3b8}.documents-empty{padding:50px 20px;text-align:center;border:1px dashed #dce2ea;border-radius:20px;color:#8292a8}.documents-empty>.iconify{font-size:36px}.documents-empty h2{font-size:20px;margin:16px 0 10px;color:#475569}.documents-empty p{font-size:13px;line-height:1.7}@media(max-width:650px){.document-row{padding:16px 12px;gap:12px;flex-wrap:wrap}.document-main{flex-basis:70%}.document-meta{text-align:left;padding-left:46px;flex:1;order:2}.documents-toolbar>*{max-width:100%}}
.documents-actions,.documents-path{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.documents-path{gap:2px;font-size:13px;color:#8292a8;overflow-wrap:anywhere}.documents-view{margin-left:auto;display:flex;gap:4px}.documents-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:14px;border:0;background:transparent;overflow:visible}.documents-tiles .document-row{position:relative;display:grid;grid-template-columns:1fr auto;align-content:start;align-items:start;gap:16px;border:1px solid #e2e8f0;border-radius:16px;padding:20px;background:white}.documents-tiles .document-main{align-items:start;min-height:64px}.documents-tiles .document-meta{grid-row:2;grid-column:1/-1;text-align:left;padding-left:0}.documents-tiles .document-row>.document-meta+*{grid-column:2;grid-row:1}.document-folder .document-main>.iconify{color:#c69838}
.documents-selection{display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:13px;color:#64748b}.document-select,.document-select-placeholder{flex:0 0 16px;align-self:center}.document-select-placeholder{width:16px;height:16px}.document-selected{background:#f0f5ff}.documents-delete-preview{max-height:230px;overflow:auto;margin:16px 0;padding-left:20px;list-style:disc;font-size:13px;line-height:1.8;overflow-wrap:anywhere}.documents-tiles .document-row{grid-template-columns:16px minmax(0,1fr) auto}.documents-tiles .document-main{grid-column:2;grid-row:1}.documents-tiles .document-meta{grid-column:2/-1}.documents-tiles .document-row>.document-meta+*{grid-column:3}.documents-tiles .document-folder>button+*{grid-column:3;grid-row:1}.documents-tiles .document-selected{background:#f0f5ff}
.documents-workspace{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;align-items:stretch}.documents-workspace-expanded{grid-template-columns:260px minmax(0,1fr)}.documents-content{display:grid;align-content:start;gap:20px;min-width:0}.documents-sidebar-slot{display:flex;min-width:0}.documents-sidebar{width:100%;display:flex;flex-direction:column;min-width:0;border:1px solid #e2e8f0;border-radius:16px;background:#fff;overflow:hidden}.documents-sidebar-heading{flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 10px 12px 16px;border-bottom:1px solid #e8edf3;font-size:13px;color:#475569}.documents-tree{flex:1;min-height:0;max-height:min(560px,65dvh);overflow:auto;padding:8px}.documents-tree-row{display:flex;align-items:center;min-width:0}.documents-tree-link{display:flex;align-items:center;gap:8px;min-width:0;flex:1;padding:8px 6px;border-radius:6px;text-align:left;font-size:12px;color:#64748b}.documents-tree-link span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.documents-tree-link>.iconify{flex-shrink:0;width:16px;height:16px}.documents-tree-link:hover,.documents-tree-toggle:hover{background:#f1f5f9}.documents-tree-link.is-current{background:#eef2ff;color:#312e81}.documents-tree-root{width:100%;margin-bottom:4px}.documents-tree-toggle,.documents-tree-spacer{display:flex;align-items:center;justify-content:center;width:24px;height:30px;flex-shrink:0;border-radius:6px;color:#8292a8}.documents-tree-toggle:focus-visible,.documents-tree-link:focus-visible,.document-parent button:focus-visible{outline:2px solid #6366f1;outline-offset:-2px}.documents-sidebar-enter-active,.documents-sidebar-leave-active{transition:opacity .15s ease,transform .15s ease}.documents-sidebar-enter-from,.documents-sidebar-leave-to{opacity:0;transform:translateX(-12px)}.document-parent{padding-top:12px;padding-bottom:12px}.documents-tiles .document-parent .document-main{min-height:0}@media(max-width:900px){.documents-workspace-expanded{grid-template-columns:210px minmax(0,1fr)}}@media(max-width:650px){.documents-workspace-expanded{grid-template-columns:minmax(0,1fr)}.documents-tree{max-height:280px}}@media(prefers-reduced-motion:reduce){.documents-sidebar-enter-active,.documents-sidebar-leave-active{transition:none}}
</style>
