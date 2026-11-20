<script setup lang="ts">
import type { ProjectDocument } from '~~/shared/types/project-documents'
import { projectImagePreview } from '~/utils/project-image-preview'

const props = defineProps<{
  file: ProjectDocument | null
  load: (file: ProjectDocument) => Promise<Blob>
  portal?: HTMLElement
}>()
const emit = defineEmits<{ close: [] }>()
const source = ref('')
const error = ref('')

watch(() => props.file, async (file, _, onCleanup) => {
  source.value = ''
  error.value = ''
  if (!file) return

  let active = true
  let url = ''
  onCleanup(() => {
    active = false
    if (url) URL.revokeObjectURL(url)
  })

  try {
    const blob = await props.load(file)
    if (!active) return
    const preview = await projectImagePreview(blob, file.name, file.type)
    if (!active) return
    source.value = url = URL.createObjectURL(preview)
  } catch {
    if (active) error.value = 'Не удалось загрузить изображение для просмотра.'
  }
}, { immediate: true })
</script>

<template>
  <UModal
    :open="!!file"
    :title="file?.name || 'Просмотр изображения'"
    :portal="portal ?? true"
    fullscreen
    :transition="false"
    :ui="{ content: 'z-[1100]', body: 'flex min-h-0 items-center justify-center bg-slate-950 p-2 sm:p-4', wrapper: 'min-w-0 flex-1', title: 'truncate' }"
    @update:open="value => { if (!value) emit('close') }"
  >
    <template #actions>
      <div class="me-10 shrink-0"><slot name="actions" /></div>
    </template>
    <template #body>
      <p v-if="error" role="alert" class="px-4 text-center text-white">{{ error }}</p>
      <img
        v-else-if="source"
        :key="source"
        :src="source"
        :alt="file?.name"
        class="h-full w-full object-contain"
        draggable="false"
        @error="error = 'Не удалось показать изображение. Возможно, браузер не поддерживает этот формат.'"
      >
      <p v-else role="status" class="text-white">Загрузка изображения…</p>
    </template>
  </UModal>
</template>
