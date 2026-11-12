<script setup lang="ts">
import type { KabanStage } from '~~/shared/types/kaban'
const stages = defineModel<KabanStage[]>({ required: true })
defineProps<{ disabled?: boolean }>()
function move(index: number, delta: number) { const to = index + delta; if (to < 0 || to >= stages.value.length) return; const [item] = stages.value.splice(index, 1); stages.value.splice(to, 0, item!) }
function add() { if (stages.value.length < 12) stages.value.push({ id: crypto.randomUUID(), name: 'Новая стадия', color: '#64748b', done: false }) }
</script>
<template>
  <div class="space-y-3"><div v-for="(stage, index) in stages" :key="stage.id" class="flex flex-wrap items-center gap-2 rounded-lg border border-default p-3"><UInput v-model="stage.name" :aria-label="`Название стадии ${index + 1}`" class="min-w-32 flex-1" :maxlength="60" :disabled="disabled" /><input v-model="stage.color" type="color" :aria-label="`Цвет стадии ${index + 1}`" :disabled="disabled" /><UCheckbox v-model="stage.done" label="Готово" :disabled="disabled" /><UButton icon="i-lucide-arrow-up" aria-label="Поднять стадию" variant="ghost" color="neutral" :disabled="disabled || !index" @click="move(index, -1)" /><UButton icon="i-lucide-arrow-down" aria-label="Опустить стадию" variant="ghost" color="neutral" :disabled="disabled || index === stages.length - 1" @click="move(index, 1)" /><UButton icon="i-lucide-trash-2" aria-label="Удалить стадию" variant="ghost" color="error" :disabled="disabled || stages.length === 1" @click="stages.splice(index, 1)" /></div><UButton label="Добавить стадию" icon="i-lucide-plus" variant="outline" color="neutral" :disabled="disabled || stages.length >= 12" @click="add" /></div>
</template>
