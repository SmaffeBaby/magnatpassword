<script setup lang="ts">
import type { AssistantUpdate, AssistantUpdates } from '~~/shared/types/assistant-updates'
import { updatesCsv, parseUpdatesCsv } from '~~/shared/utils/assistant-updates'
const props = defineProps<{ admin?: boolean }>()
const posts = ref<AssistantUpdate[]>([]), revision = ref(1), busy = ref(false), error = ref(''), notice = ref('')
const title = ref(''), body = ref(''), date = ref(new Date().toISOString().slice(0, 10)), kind = ref<'feature' | 'fix'>('feature'), editing = ref('')
const file = ref<HTMLInputElement | null>(null)
const sorted = computed(() => [...posts.value].sort((a,b) => b.date.localeCompare(a.date)))
const controller = new AbortController(); onBeforeUnmount(() => controller.abort())
async function load() {
  busy.value = true; error.value = ''
  try { const data = await sharedRequest<AssistantUpdates>('/api/assistant/updates', { signal: controller.signal }); posts.value = data.posts; revision.value = data.revision }
  catch (e: any) { error.value = e?.data?.message || 'Не удалось загрузить историю.' }
  finally { busy.value = false }
}
async function save(next: AssistantUpdate[]) {
  busy.value = true; error.value = ''; notice.value = ''
  try { const data = await sharedRequest<AssistantUpdates>('/api/admin/assistant/updates', { method: 'PUT', signal: controller.signal, body: { revision: revision.value, posts: next } }); posts.value = data.posts; revision.value = data.revision; notice.value = 'Изменения опубликованы.'; return true }
  catch (e: any) { error.value = e?.data?.message || 'Не удалось сохранить историю.'; return false }
  finally { busy.value = false }
}
async function publish() { const post = { id: editing.value || crypto.randomUUID(), title: title.value, body: body.value, date: date.value, kind: kind.value }; if (await save([...posts.value.filter(p => p.id !== post.id), post])) { editing.value = ''; title.value = ''; body.value = '' } }
function edit(post: AssistantUpdate) { editing.value = post.id; title.value = post.title; body.value = post.body; date.value = post.date; kind.value = post.kind }
async function importCsv(event: Event) {
  const input = event.target as HTMLInputElement, selected = input.files?.[0]; input.value = ''
  if (!selected) return
  try {
    if (selected.size > 5_000_000) throw new Error('Максимальный размер CSV — 5 МБ.')
    const imported = parseUpdatesCsv(await selected.text()), merged = new Map(posts.value.map(p => [p.id,p]))
    for (const post of imported) merged.set(post.id, post)
    await save([...merged.values()])
  } catch (e: any) { error.value = e.message || 'Не удалось импортировать CSV.' }
}
function exportCsv() { return saveFile(new Blob([updatesCsv(posts.value)], { type: 'text/csv;charset=utf-8' }), 'assistant-updates.csv') }
onMounted(load)
</script>
<template>
  <div class="space-y-5">
    <template v-if="admin">
      <p class="text-sm text-muted">Публикуйте нововведения и исправления помощника. CSV: id,date,kind,title,body; kind — feature или fix. Импорт добавляет посты и обновляет совпадающие id.</p>
      <div class="flex flex-wrap gap-2"><UButton label="Экспорт CSV" variant="outline" color="neutral" :disabled="busy" @click="exportCsv" /><UButton label="Импорт CSV" variant="outline" color="neutral" :disabled="busy" @click="file?.click()" /><UButton label="Обновить" variant="ghost" color="neutral" :disabled="busy" @click="load" /><input ref="file" type="file" accept=".csv,text/csv" class="hidden" @change="importCsv" /></div>
      <form class="space-y-3 rounded-xl border border-default p-4" @submit.prevent="publish">
        <UFormField label="Заголовок" required><UInput v-model="title" :maxlength="200" class="w-full" :disabled="busy" /></UFormField>
        <UFormField label="Дата" required><UInput v-model="date" type="date" :disabled="busy" /></UFormField>
        <USelect v-model="kind" :items="[{label:'Нововведение',value:'feature'},{label:'Исправление',value:'fix'}]" :disabled="busy" />
        <UFormField label="Текст" required><UTextarea v-model="body" :maxlength="10000" class="w-full" :rows="5" :disabled="busy" /></UFormField>
        <UButton type="submit" :label="editing ? 'Сохранить пост' : 'Опубликовать пост'" :loading="busy" :disabled="busy || !title.trim() || !body.trim() || !date" />
        <UButton v-if="editing" label="Отменить редактирование" variant="ghost" color="neutral" :disabled="busy" @click="editing=''; title=''; body=''" />
      </form>
    </template>
    <UAlert v-if="error" :description="error" color="error" /><p v-if="notice" role="status" class="text-sm text-success">{{ notice }}</p>
    <p v-if="busy" role="status">Загрузка…</p><p v-else-if="!posts.length" class="text-sm text-muted">Пока нет опубликованных обновлений.</p>
    <article v-for="post in sorted" :key="post.id" class="space-y-2 rounded-xl border border-default p-4"><div class="flex flex-wrap gap-3 text-xs text-muted"><time :datetime="post.date">{{ post.date.split('-').reverse().join('.') }}</time><span>{{ post.kind === 'fix' ? 'Исправление' : 'Нововведение' }}</span></div><h3 class="font-semibold break-words">{{ post.title }}</h3><p class="whitespace-pre-wrap break-words text-sm leading-7">{{ post.body }}</p><div v-if="admin" class="flex gap-2"><UButton label="Редактировать" variant="ghost" color="neutral" :disabled="busy" @click="edit(post)" /><UButton label="Удалить" variant="ghost" color="error" :disabled="busy" @click="save(posts.filter(p => p.id !== post.id))" /></div></article>
  </div>
</template>
