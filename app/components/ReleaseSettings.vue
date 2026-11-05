<script setup lang="ts">
import type { ReleasePlan } from '~~/shared/utils/release-plan'
import { releasePlanSchema } from '~~/shared/utils/release-plan'
const version = ref(''), notes = ref(''), busy = ref(false), loading = ref(true), error = ref(''), saved = ref(false)
onMounted(async () => {
  try {
    const { plan } = await sharedRequest<{ plan: ReleasePlan | null }>('/api/admin/releases')
    if (plan) { version.value = plan.version; notes.value = plan.notes }
  } catch { error.value = 'Не удалось загрузить настройки релиза' }
  finally { loading.value = false }
})
watch([version, notes], () => { saved.value = false })
async function save() {
  error.value = ''; saved.value = false
  const result = releasePlanSchema.safeParse({ version: version.value, notes: notes.value })
  if (!result.success) { error.value = result.error.issues[0]?.message || 'Проверьте данные'; return }
  busy.value = true
  try { await sharedRequest('/api/admin/releases', { method: 'PUT', body: result.data }); saved.value = true }
  catch { error.value = 'Не удалось сохранить настройки релиза' }
  finally { busy.value = false }
}
</script>
<template>
  <div class="grid gap-6 lg:grid-cols-2">
    <UCard><template #header><h2 class="font-semibold">Следующий релиз</h2></template>
      <p class="mb-6 text-sm text-slate-500">Версия и описание относятся к установщику оболочки. Сохраните их перед отдельным запуском сборки установщиков. Интерфейс приложений обновляется вместе с сайтом.</p>
      <form class="space-y-5" @submit.prevent="save">
        <UFormField label="Номер версии" description="Три числа через точку, например 1.2.3. Для каждого релиза — новый номер." required><UInput v-model="version" placeholder="0.1.1" :disabled="loading || busy" class="w-full" /></UFormField>
        <UFormField label="Что изменилось" description="Этот текст увидят пользователи на странице загрузки." required><UTextarea v-model="notes" :rows="10" :maxlength="30000" :disabled="loading || busy" class="w-full" placeholder="Добавили…&#10;Исправили…" /></UFormField>
        <UAlert v-if="error" color="error" :description="error" />
        <UAlert v-if="saved" color="success" description="Сохранено. Данные будут использованы при следующей сборке установщиков." />
        <UButton type="submit" label="Сохранить для следующей сборки" :loading="busy" :disabled="loading" />
      </form>
    </UCard>
    <UCard><template #header><h2 class="font-semibold">Предпросмотр страницы загрузки</h2></template>
      <UIcon name="i-lucide-package-check" class="mb-4 size-10 text-primary-500" />
      <h3 class="text-xl font-semibold">Magnat v{{ version || '0.1.1' }}</h3>
      <p class="mt-2 text-sm text-slate-500">Установщик оболочки для выбранной платформы.</p>
      <p class="my-6 whitespace-pre-wrap break-words text-sm leading-7">{{ notes || 'Здесь появится ваше описание изменений.' }}</p>
      <UButton disabled label="Скачать приложение" icon="i-lucide-download" />
      <UButton to="/downloads" class="mt-6" color="neutral" variant="link" label="Открыть страницу загрузки" />
    </UCard>
  </div>
</template>
