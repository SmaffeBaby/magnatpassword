<script setup lang="ts">
const props = defineProps<{
  label: string
  emojis: readonly string[]
  editable: boolean
  busy: boolean
}>()
const score = defineModel<number | null>({ required: true })
const group = useId()
const emoji = computed(() => score.value === null ? '' : props.emojis[score.value - 1])
</script>

<template>
  <fieldset class="rounded-xl border border-default bg-elevated/40 p-4" :disabled="busy">
    <legend class="px-1 text-sm font-medium">{{ label }}</legend>
    <div class="mb-3 flex items-center gap-2 text-sm" aria-live="polite">
      <span class="text-2xl" aria-hidden="true">{{ emoji }}</span>
      <span v-if="score !== null" class="font-semibold tabular-nums">{{ score }} / 10</span>
      <span v-else class="text-muted">Не указано</span>
    </div>
    <div v-if="editable" class="grid grid-cols-10 gap-0.5 sm:gap-1">
      <label v-for="value in 10" :key="value" class="min-w-0">
        <input v-model="score" type="radio" :name="group" :value="value" class="peer sr-only" />
        <span class="flex min-h-9 cursor-pointer items-center justify-center rounded-md border border-default bg-default text-xs tabular-nums hover:bg-accented peer-checked:border-primary peer-checked:bg-primary peer-checked:text-inverted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary peer-disabled:cursor-default">{{ value }}</span>
      </label>
    </div>
  </fieldset>
</template>
