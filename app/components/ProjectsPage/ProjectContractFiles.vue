<script setup lang="ts">
import ContractLinkedFiles from './ContractLinkedFiles.vue'
import type { RegistryReference } from '~~/shared/types/contract-fields'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { ContractFile } from '~~/shared/types/project-contract-files'

const props = defineProps<{ reference?: RegistryReference | null; projectId: string; contractId?: string; readonly?: boolean; disabled?: boolean }>()
const auth = useAuthStore(), client = useQueryClient()
const pending = ref<{id:string;file:File;kind:'contract'|'supplement'}[]>([]), busy = ref(false), error = ref(''), status = ref('')
const base = (id: string) => `/api/projects/${props.projectId}/contracts/${id}/files`
const key = computed(() => ['account', auth.user?.id, 'contract-files', props.projectId, props.contractId])
const query = useQuery({ queryKey: key, queryFn: ({ signal }) => sharedRequest<ContractFile[]>(base(props.contractId!), { signal }), enabled: computed(() => !!props.contractId), retry: false })
const size = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} МБ` : `${Math.ceil(bytes / 1024)} КБ`
const groups=[{kind:'supplement' as const,title:'Файлы доп. соглашения'},{kind:'contract' as const,title:'Файлы договора'}]
function choose(event: Event,kind:'contract'|'supplement') {
  const input = event.target as HTMLInputElement, files = Array.from(input.files ?? []); input.value = ''; error.value = ''
  if (files.some(file => !file.size || file.size > 20 * 1024 * 1024)) { error.value = 'Выберите непустые файлы до 20 МБ каждый.'; return }
  if ((query.data.value?.length ?? 0) + pending.value.length + files.length > 20) { error.value = 'К договору можно прикрепить до 20 файлов.'; return }
  pending.value.push(...files.map(file=>({id:crypto.randomUUID(),file,kind})))
}
async function invalidate() {
  await Promise.all([client.invalidateQueries({ queryKey: ['account', auth.user?.id, 'contract-files', props.projectId] }), client.invalidateQueries({ queryKey: ['account', auth.user?.id, 'project-contracts', props.projectId] })])
}
async function uploadQueued(id: string) {
  const userId = auth.user?.id
  busy.value = true; error.value = ''
  try {
    while (pending.value.length) {
      const item = pending.value[0]!, file=item.file, form = new FormData(); form.append('file', file);form.append('kind',item.kind)
      status.value = `Загружаем ${file.name}…`
      await sharedRequest<ContractFile>(base(id), { method: 'POST', body: form })
      if (auth.user?.id !== userId) throw Error('Аккаунт изменился. Откройте проект заново.')
      pending.value.shift()
    }
  } finally { busy.value = false; status.value = ''; await invalidate() }
}
async function remove(file: ContractFile) {
  if (busy.value || props.disabled || props.readonly || !props.contractId) return
  busy.value = true; error.value = ''
  try { await sharedRequest(`${base(props.contractId)}/${file.id}`, { method: 'DELETE' }); await invalidate() }
  catch (failure: any) { error.value = failure?.data?.message || 'Не удалось удалить файл' }
  finally { busy.value = false }
}
async function download(file: ContractFile) {
  if (!props.contractId || busy.value) return
  const userId = auth.user?.id
  busy.value = true; error.value = ''
  try {
    const blob = await sharedRequest<Blob>(`${base(props.contractId)}/${file.id}`, { responseType: 'blob' })
    if (auth.user?.id !== userId) return
    await saveFile(blob, file.name)
  } catch (failure: any) { error.value = failure?.data?.message || 'Не удалось скачать файл' }
  finally { busy.value = false }
}
defineExpose({ uploadQueued, busy })
</script>

<template>
  <section class="contract-files" aria-label="Файлы договора">
    <section v-for="group in groups" :key="group.kind" class="grid min-w-0 gap-3"><h3>{{group.title}}</h3>
    <FileUpload v-if="!readonly" :label="group.kind==='supplement'?'Прикрепить доп. соглашения':'Прикрепить файлы договора'" hint="PDF, документы, сканы и другие файлы · до 20 МБ каждый, до 20 файлов. Загрузятся после сохранения договора." multiple :disabled="disabled || busy || (!!contractId && (query.isPending.value || !!query.error.value))" @change="choose($event,group.kind)"/>
    <p v-if="contractId && query.isPending.value" class="contract-files-hint">Загружаем файлы…</p>
    <UAlert v-if="query.error.value" color="error" title="Не удалось загрузить файлы" :actions="[{ label: 'Повторить', onClick: () => query.refetch() }]"/>
    <div v-for="file in query.data.value?.filter(file=>(file.kind||'contract')===group.kind)" :key="file.id" class="contract-file"><UIcon name="i-lucide-file"/><button type="button" :disabled="busy" @click="download(file)">{{ file.name }}<small>{{ size(file.size) }}</small></button><UButton type="button" icon="i-lucide-download" color="neutral" variant="ghost" :aria-label="`Скачать ${file.name}`" :disabled="busy" @click="download(file)"/><UButton v-if="!readonly" type="button" icon="i-lucide-trash-2" color="neutral" variant="ghost" :aria-label="`Удалить ${file.name}`" :disabled="disabled || busy" @click="remove(file)"/></div>
    <div v-for="item in pending.filter(item=>item.kind===group.kind)" :key="item.id" class="contract-file"><UIcon name="i-lucide-upload"/><span>{{ item.file.name }}<small>{{ size(item.file.size) }} · Будет загружен</small></span><UButton type="button" icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="`Убрать ${item.file.name}`" :disabled="disabled || busy" @click="pending=pending.filter(p=>p.id!==item.id)"/></div>
    <p v-if="readonly && !query.isPending.value && !query.error.value && !query.data.value?.some(file=>(file.kind||'contract')===group.kind)" class="contract-files-hint">В этой группе пока нет файлов.</p></section>
    <ContractLinkedFiles v-if="reference" :reference="reference" />
    <p v-if="status" role="status" class="contract-files-hint">{{ status }}</p>
    <UAlert v-if="error" color="error" :description="error"/>
  </section>
</template>

<style scoped>
.contract-files{display:grid;gap:14px;min-width:0;border-top:1px solid #e2e8f0;padding-top:20px}.contract-files h3{font-weight:600;font-size:14px;color:#475569}.contract-file{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #e2e8f0;border-radius:10px;min-width:0}.contract-file>.iconify{flex:0 0 20px;width:20px;color:#94a3b8}.contract-file>button:not([aria-label]),.contract-file>span:not(.iconify){flex:1;min-width:0;text-align:left;font-size:13px;color:#475569;overflow-wrap:anywhere}.contract-file small{display:block;font-size:11px;color:#94a3b8;margin-top:4px}.contract-files-hint{font-size:12px;line-height:1.7;color:#94a3b8}
</style>
