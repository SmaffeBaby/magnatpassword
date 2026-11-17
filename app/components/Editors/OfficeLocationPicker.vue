<script setup lang="ts">
import type { OfficeSource, OfficeTarget } from '~~/shared/types/office'
import { canEditProjectSection } from '~~/shared/utils/project-permissions'
import { documentEditor, documentSize } from '~~/shared/utils/project-documents'
const props = defineProps<{ saving?: boolean; editor?: string }>()
const emit = defineEmits<{ target: [target: OfficeTarget | null]; choose: [target: OfficeTarget]; open: [source: OfficeSource] }>()
const projects = useProjectsData(), auth = useAuthStore()
const projectId = ref('personal'), kind = ref('task'), recordId = ref(''), folderId = ref('root')
const records = ref<any[]>([]), folders = ref<any[]>([]), files = ref<any[]>([]), data = ref<any>(null), busy = ref(false), error = ref('')
let generation = 0, fileGeneration = 0
const project = computed(() => projects.data.value?.find(p => p.id === projectId.value))
const services = computed(() => projectId.value === 'personal' ? [{ label: 'Кабан', value: 'task' },{ label: 'Реестр договоров', value: 'registry' }] : [{ label: 'Документы проекта', value: 'document' },{ label: 'Входные данные', value: 'input' },{ label: 'Файлы договоров', value: 'contract' },{ label: 'Задачи · Кабан', value: 'task' }])
const record = computed(() => records.value.find(r => r.id === recordId.value))
const canSave = computed(() => kind.value === 'document' ? !!project.value && canEditProjectSection(project.value,'documents') : kind.value === 'input' || kind.value === 'contract' ? !!project.value && canEditProjectSection(project.value,'economy') && !!record.value : !!record.value?.canEdit)
const target = computed<OfficeTarget | null>(() => canSave.value ? { kind: kind.value as OfficeTarget['kind'], ...(project.value ? { projectId: project.value.id } : {}), ...(recordId.value ? { recordId: recordId.value } : {}), folderId: folderId.value === 'root' ? null : folderId.value, revision: data.value?.revision, label: `${project.value?.name ?? 'Сервисы'} / ${services.value.find(s=>s.value===kind.value)?.label} / ${record.value?.title || record.value?.number || ''}` } : null)
watch(target, value => emit('target', value), { immediate: true })
function folderLabel(id: string) { const names: string[] = []; while (id && names.length < 20) { const folder = folders.value.find(f => f.id === id); if (!folder) break; names.unshift(folder.name); id = folder.parentId } return '/ ' + names.join(' / ') }
async function loadFiles() {
  const attempt = ++fileGeneration; files.value = []
  try {
    let result: any = []
    if (kind.value === 'document') result = (data.value ?? []).filter((f: any) => f.folderId === (folderId.value === 'root' ? null : folderId.value))
    else if (kind.value === 'input') result = record.value?.attachments ?? []
    else if (recordId.value) result = await sharedRequest<any>(kind.value === 'task' ? `/api/kaban/tasks/${recordId.value}/files` : kind.value === 'contract' ? `/api/projects/${projectId.value}/contracts/${recordId.value}/files` : `/api/contract-register/standalone/${recordId.value}/files`)
    if (attempt === fileGeneration) files.value = Array.isArray(result) ? result : result.files
  } catch (failure: any) { if (attempt === fileGeneration) error.value = failure?.data?.message || 'Не удалось загрузить файлы' }
}
async function load() {
  const attempt = ++generation; ++fileGeneration; busy.value = true; error.value = ''; records.value = []; folders.value = []; files.value = []; data.value = null; recordId.value = ''; folderId.value = 'root'
  try {
    const id = projectId.value
    const result: any = await sharedRequest(kind.value === 'document' ? `/api/projects/${id}/documents` : kind.value === 'input' ? `/api/projects/${id}/input-data` : kind.value === 'contract' ? `/api/projects/${id}/contracts` : kind.value === 'task' ? `/api/kaban?${id === 'personal' ? 'vault=personal' : 'project='+id}` : '/api/contract-register?pageSize=100')
    if (attempt !== generation) return
    data.value = result
    if (kind.value === 'document') { const nextFolders = await sharedRequest<any[]>(`/api/projects/${id}/documents/folders`); if (attempt !== generation) return; folders.value = nextFolders }
    else records.value = kind.value === 'input' ? result.cards : kind.value === 'task' ? result.tasks : kind.value === 'registry' ? result.contracts.filter((r: any) => r.origin === 'standalone') : result.contracts
    recordId.value = records.value[0]?.id ?? ''; await loadFiles()
  } catch (failure: any) { if (attempt === generation) error.value = failure?.data?.message || 'Раздел недоступен' }
  finally { if (attempt === generation) busy.value = false }
}
function open(file: any) { emit('open', { kind: kind.value as OfficeSource['kind'], fileId: file.id, ...(project.value ? { projectId: project.value.id } : {}), ...(recordId.value ? { recordId: recordId.value } : {}) }) }
watch(projectId, () => { kind.value = projectId.value === 'personal' ? 'task' : 'document' })
watch([projectId, kind], () => { void load() }, { immediate: true })
watch([recordId, folderId], () => { if (!busy.value) void loadFiles() })
watch(() => auth.user?.id, () => { generation++; fileGeneration++; records.value=[];files.value=[];data.value=null;recordId.value=''; emit('target',null) })
onBeforeUnmount(() => { generation++;fileGeneration++ })
</script>
<template>
  <section class="office-picker space-y-4">
    <UFormField label="Проект или сервис"><USelect :ui="{content:'z-[130]'}" v-model="projectId" :items="[{label:'Сервисы без проекта',value:'personal'},...(projects.data.value??[]).map(p=>({label:p.name,value:p.id}))]" class="w-full"/></UFormField>
    <UFormField label="Раздел"><USelect :ui="{content:'z-[130]'}" v-model="kind" :items="services" class="w-full"/></UFormField>
    <UFormField v-if="kind==='document'" label="Папка"><USelect :ui="{content:'z-[130]'}" v-model="folderId" :items="[{label:'/ Документы проекта',value:'root'},...folders.map(f=>({label:folderLabel(f.id),value:f.id}))]" class="w-full"/></UFormField>
    <UFormField v-else label="Задача, договор или карточка"><USelect :ui="{content:'z-[130]'}" v-model="recordId" :items="records.map(r=>({label:r.title||r.number||r.name||r.code||r.id,value:r.id}))" placeholder="Выберите запись" class="w-full"/></UFormField>
    <p v-if="busy" role="status" class="text-sm text-muted">Загружаем файлы…</p>
    <UAlert v-if="error" color="error" :description="error"/>
    <template v-if="saving"><p v-if="!busy&&!target" class="text-sm text-muted">Выберите запись с правами на добавление файлов. Новые задачи, договоры и карточки создаются в соответствующем сервисе.</p><UButton label="Сохранить здесь" :disabled="busy||!target" @click="target&&emit('choose',target)"/></template>
    <div v-else class="space-y-2"><p v-if="!busy&&!files.length" class="text-sm text-muted">В этом разделе пока нет файлов.</p><div v-for="file in files.filter(f=>documentEditor(f.name)&&(!editor||documentEditor(f.name)?.key===editor))" :key="file.id" class="flex items-center gap-3 rounded-lg border border-default p-3"><span class="min-w-0 flex-1 break-words text-sm">{{file.name}}<small class="block text-muted">{{documentSize(file.size)}}</small></span><UButton label="Открыть" size="sm" color="neutral" variant="outline" @click="open(file)"/></div></div>
    <UButton label="Обновить список" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="busy" @click="load"/>
  </section>
</template>
