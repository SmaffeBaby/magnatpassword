<script setup lang="ts">
import type { OfficeSource } from '~~/shared/types/office'
import { documentEditor } from '~~/shared/utils/project-documents'
const props = defineProps<{ name: string; source?: OfficeSource; url?: string; disabled?: boolean }>()
const office = useOffice(), auth = useAuthStore(), toast = useToast(), busy = ref(false)
async function open() {
  if (busy.value) return
  const actor = auth.user?.id; busy.value = true
  try {
    if (props.source) await office.openSource(props.source)
    else if (props.url?.startsWith('/api/')) { const blob = await sharedRequest<Blob>(props.url,{responseType:'blob'}); if(auth.user?.id===actor)office.openBlob(blob,props.name) }
  } catch (failure: any) { toast.add({ title: 'Не удалось открыть файл', description: failure?.data?.message || failure.message, color:'error' }) }
  finally { busy.value = false }
}
</script>
<template><UButton v-if="documentEditor(name)" type="button" icon="i-lucide-file-pen-line" color="neutral" variant="ghost" :aria-label="`Открыть в ${documentEditor(name)?.label}: ${name}`" :title="`Открыть в ${documentEditor(name)?.label}`" :loading="busy" :disabled="disabled||busy" @click="open"/></template>
