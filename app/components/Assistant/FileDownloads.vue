<script setup lang="ts">
import type { AssistantDownload } from '~~/shared/types/assistant'
import { assistantDownloadPath } from '~~/shared/utils/assistant-files'
import { saveFile } from '~/utils/file-download'
const props = defineProps<{ files: AssistantDownload[] }>()
const auth = useAuthStore(), vault = useVaultStore()
const busy = ref<AssistantDownload | null>(null), error = ref('')
let controller: AbortController | undefined, active = true
watch(() => auth.user?.id, () => { controller?.abort(); error.value = '' })
onBeforeUnmount(() => { active = false; controller?.abort() })
function size(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.ceil(bytes / 1024))} КБ` : `${(bytes / (1024 * 1024)).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ` }
async function download(file: AssistantDownload) {
  if (busy.value || !auth.user || !vault.unlocked) return
  const userId = auth.user.id
  controller = new AbortController(); busy.value = file; error.value = ''
  try {
    const blob = await sharedRequest<Blob>(assistantDownloadPath(file), { responseType: 'blob', signal: controller.signal })
    if (!active || auth.user?.id !== userId || !vault.unlocked || controller.signal.aborted) return
    await saveFile(blob, file.name)
  } catch (failure: any) {
    if (!active || auth.user?.id !== userId || controller.signal.aborted) return
    const status = failure?.statusCode ?? failure?.status ?? failure?.response?.status
    error.value = status === 403 ? 'Доступ к файлу больше не разрешён.' : status === 404 ? 'Файл удалён или больше недоступен. Запросите список файлов заново.' : failure?.data?.message || 'Не удалось скачать файл. Повторите попытку.'
  } finally { if (active) busy.value = null }
}
</script>
<template>
  <section v-if="props.files.length" class="my-4 space-y-2 whitespace-normal" aria-label="Файлы для скачивания">
    <article v-for="(file, index) in files" :key="index" class="flex items-center gap-3 rounded-xl border border-default p-3">
      <UIcon name="i-lucide-file" class="size-5 shrink-0 text-muted" />
      <div class="min-w-0 flex-1"><p class="break-words text-sm font-medium">{{ file.name }}</p><p class="break-words text-xs text-muted">{{ file.source }} · {{ size(file.size) }}</p></div>
      <UButton label="Скачать" :aria-label="`Скачать ${file.name}`" icon="i-lucide-download" color="neutral" variant="outline" size="sm" :loading="busy === file" :disabled="!!busy" @click="download(file)" />
    </article>
    <UAlert v-if="error" color="error" :description="error" />
  </section>
</template>
