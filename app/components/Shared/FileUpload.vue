<script setup lang="ts">
const props = withDefaults(defineProps<{ label?: string; hint?: string; accept?: string; multiple?: boolean; disabled?: boolean }>(), { label: 'Выбрать файл' })
const emit = defineEmits<{ change: [event: Event] }>()
const input = ref<HTMLInputElement | null>(null), depth = ref(0), error = ref('')
function enter(event: DragEvent) { if (!props.disabled && event.dataTransfer?.types.includes('Files')) depth.value++ }
function drop(event: DragEvent) {
  depth.value = 0; error.value = ''
  if (props.disabled || !input.value || !event.dataTransfer?.files.length) return
  if (!props.multiple && event.dataTransfer.files.length > 1) { error.value = 'Перетащите один файл.'; return }
  input.value.files = event.dataTransfer.files
  input.value.dispatchEvent(new Event('change', { bubbles: true }))
}
watch(() => props.disabled, () => { depth.value = 0 })
</script>

<template>
  <div class="file-upload" :class="{ 'is-dragging': depth > 0, 'is-disabled': disabled }" @dragenter.prevent="enter" @dragover.prevent @dragleave.prevent="depth = Math.max(0, depth - 1)" @drop.prevent.stop="drop">
    <button type="button" class="file-upload-trigger" :disabled="disabled" @click="input?.click()"><UIcon name="i-lucide-cloud-upload"/><span><strong>{{ label }}</strong><small>или перетащите {{ multiple ? 'файлы' : 'файл' }} сюда</small></span></button>
    <input ref="input" type="file" class="sr-only" :aria-label="label" :accept="accept" :multiple="multiple" :disabled="disabled" @change="error = ''; emit('change', $event)"/>
    <small v-if="hint" class="file-upload-hint">{{ hint }}</small>
    <p v-if="error" class="file-upload-error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.file-upload{width:100%;min-width:0;padding:18px;border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc;transition:background .15s,border-color .15s}.file-upload.is-dragging{border-color:var(--ui-primary);background:color-mix(in srgb,var(--ui-primary) 7%,white)}.file-upload.is-disabled{opacity:.55}.file-upload-trigger{display:flex;align-items:center;justify-content:flex-start;gap:12px;width:100%;text-align:left;color:#475569}.file-upload-trigger>.iconify{flex:0 0 26px;width:26px;height:26px;color:#8292a8}.file-upload-trigger>span:not(.iconify){display:grid;gap:5px}.file-upload-trigger strong{font-size:13px;font-weight:600}.file-upload-trigger small,.file-upload-hint{font-size:11px;line-height:1.6;color:#94a3b8}.file-upload-hint{display:block;margin-top:10px}.file-upload-error{margin-top:8px;font-size:12px;color:#dc2626}
</style>
