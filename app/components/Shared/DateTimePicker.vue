<script setup lang="ts">
import DatePicker from './DatePicker.vue'

const props = defineProps<{ label: string; required?: boolean; disabled?: boolean }>()
const model = defineModel<string>({ default: '' })
const [initialDate, initialTime] = model.value.split('T')
const date = ref(initialDate ?? ''), time = ref(initialTime ?? '')
const combined = computed(() => date.value && time.value ? `${date.value}T${time.value}` : '')

watch(model, value => {
  if (value === combined.value) return
  const [nextDate, nextTime] = value.split('T')
  date.value = nextDate ?? ''
  time.value = nextTime ?? ''
})
watch(combined, value => { model.value = value })
</script>

<template>
  <fieldset class="min-w-0">
    <legend class="mb-1 text-sm font-medium">{{ label }}</legend>
    <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
      <DatePicker v-model="date" :required="props.required" :disabled="props.disabled" :aria-label="`${label}, дата`" class="w-full" />
      <UInput v-model="time" type="time" :required="props.required" :disabled="props.disabled" :aria-label="`${label}, время`" />
    </div>
  </fieldset>
</template>
