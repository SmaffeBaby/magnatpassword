<script setup lang="ts">
import type { AssistantChoice } from '~~/shared/types/assistant'
const props = defineProps<{ choice: AssistantChoice; disabled: boolean }>()
const emit = defineEmits<{ select: [option: AssistantChoice['options'][number]] }>()
const selected = ref('')
const options = computed(() => props.choice.options.map(option => ({ label: option.label + (option.disabled ? ' · только просмотр' : ''), value: option.id, disabled: option.disabled })))
watch(() => props.choice, () => { selected.value = '' })
</script>
<template>
  <section class="rounded-2xl border border-default bg-default p-5 my-4 space-y-4" :aria-label="choice.prompt">
    <h3 class="font-medium">{{ choice.prompt }}</h3>
    <div v-if="choice.options.length <= 6" class="flex flex-wrap gap-2"><UButton v-for="option in choice.options" :key="option.id" :label="option.label + (option.disabled ? ' · только просмотр' : '')" color="neutral" variant="outline" :disabled="disabled || option.disabled" @click="emit('select', option)" /></div>
    <template v-else><USelectMenu v-model="selected" :items="options" value-key="value" placeholder="Выберите вариант" class="w-full" :disabled="disabled" /><UButton label="Продолжить" :disabled="disabled || !selected" @click="emit('select', choice.options.find(option => option.id === selected)!)" /></template>
    <p v-if="!choice.options.length" class="text-sm text-muted">Нет доступных вариантов для этого действия.</p>
  </section>
</template>
