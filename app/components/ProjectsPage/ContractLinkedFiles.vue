<script setup lang="ts">
import type { RegistryReference } from '~~/shared/types/contract-fields'
import type { RegisterFile } from '~~/shared/types/contract-register'
import { saveFile } from '~/utils/file-download'
const props=defineProps<{reference:RegistryReference}>(),auth=useAuthStore(),files=ref<RegisterFile[]>([]),loading=ref(false),busy=ref(false),error=ref('')
let controller:AbortController|undefined,generation=0,active=true
onBeforeUnmount(()=>{active=false;generation++;controller?.abort()})
watch(()=>[props.reference.origin,props.reference.id],async()=>{const current=++generation;controller?.abort();controller=new AbortController();loading.value=true;error.value='';files.value=[];try{const result=await sharedRequest<{files:RegisterFile[]}>(`/api/contract-register/${props.reference.origin}/${props.reference.id}/files`,{signal:controller.signal});if(current===generation)files.value=result.files}catch(e:any){if(current===generation)error.value=e?.data?.message||'Не удалось загрузить файлы из реестра.'}finally{if(current===generation)loading.value=false}},{immediate:true})
async function download(file:RegisterFile){if(busy.value)return;busy.value=true;error.value='';const actor=auth.user?.id;try{const blob=await sharedRequest<Blob>(`/api/contract-register/${file.origin}/${file.contractId}/files/${file.id}`,{responseType:'blob',signal:controller?.signal});if(active&&auth.user?.id===actor)await saveFile(blob,file.name)}catch(e:any){if(active)error.value=e?.data?.message||'Не удалось скачать файл.'}finally{if(active)busy.value=false}}
</script>
<template>
 <section class="space-y-3" aria-label="Связанные файлы из реестра"><h4 class="text-sm font-semibold">Файлы из реестра договоров</h4><p class="text-xs text-muted">Исходные файлы доступны по связи. Управлять ими можно в исходном договоре.</p><p v-if="loading" class="text-sm text-muted">Загружаем файлы…</p><article v-for="file in files" :key="file.origin+file.contractId+file.id" class="flex items-center gap-3 rounded-lg border border-default p-3"><UIcon name="i-lucide-file"/><span class="min-w-0 flex-1 break-words text-sm">{{file.name}}<small class="block text-xs text-muted">{{Math.ceil(file.size/1024)}} КБ</small></span><UButton icon="i-lucide-download" :aria-label="`Скачать ${file.name}`" color="neutral" variant="ghost" :disabled="busy" @click="download(file)"/></article><p v-if="!loading&&!error&&!files.length" class="text-xs text-muted">В исходном договоре нет файлов.</p><UAlert v-if="error" color="error" :description="error"/></section>
</template>
