<script setup lang="ts">
import type { KabanBlock } from '~~/shared/types/kaban'
const props = defineProps<{ field: KabanBlock; disabled: boolean; passwords: { label: string; value: string }[] }>()
defineEmits<{ remove: [] }>()
const field = toRef(props, 'field')
const text = computed({ get: () => field.value.type === 'description' || field.value.type === 'link' ? field.value.value : '', set: value => { if (field.value.type === 'description' || field.value.type === 'link') field.value.value = value } })
const password = computed({ get: () => field.value.type === 'password' ? `${field.value.vaultId}/${field.value.entryId}` : '', set: value => { if (field.value.type !== 'password') return; const [vault, entry] = value.split('/'); field.value.vaultId = vault || 'personal'; field.value.entryId = entry || '' } })
function addTodo() { if (field.value.type === 'todo') field.value.items.push({ id: crypto.randomUUID(), text: '', done: false }) }
</script>
<template>
  <section class="space-y-3 rounded-xl border border-default p-3">
    <div class="flex gap-2"><UInput v-model="field.title" aria-label="Название поля задачи" class="flex-1" :disabled="disabled" /><UButton icon="i-lucide-x" aria-label="Убрать поле из задачи" color="neutral" variant="ghost" :disabled="disabled" @click="$emit('remove')" /></div>
    <UTextarea v-if="field.type === 'description'" v-model="text" class="w-full" :disabled="disabled" aria-label="Описание задачи" />
    <UInput v-if="field.type === 'link'" v-model="text" placeholder="Адрес ссылки" class="w-full" :disabled="disabled" aria-label="Ссылка в задаче" />
    <template v-if="field.type === 'todo'">
      <div v-for="todo in field.items" :key="todo.id" class="flex gap-2"><UCheckbox v-model="todo.done" :disabled="disabled" aria-label="Выполнено" /><UInput v-model="todo.text" class="flex-1" :disabled="disabled" aria-label="Пункт чек-листа" /></div>
      <UButton label="Добавить пункт" size="xs" variant="ghost" :disabled="disabled || field.items.length >= 100" @click="addTodo" />
    </template>
    <USelectMenu v-if="field.type === 'password'" v-model="password" :items="passwords" value-key="value" placeholder="Карточка пароля" class="w-full" :disabled="disabled" />
    <p v-if="field.type === 'files'" class="text-sm text-muted">После сохранения прикрепите файлы скрепкой в это поле.</p>
  </section>
</template>
