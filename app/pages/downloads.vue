<script setup lang="ts">
import type { AppRelease } from '~~/shared/types/releases'
import { backendFetch, backendUrl } from '~/utils/backend'
definePageMeta({ layout: false })
useHead({ title: 'Скачать Magnat' })
const release = ref<AppRelease | null>(null), loading = ref(true), error = ref(''), selected = ref('windows')
const platforms = [
  { label: 'Windows', value: 'windows' }, { label: 'macOS', value: 'macos' },
  { label: 'Android', value: 'android' }, { label: 'iPhone / iPad', value: 'ios' }
]
const signingExpired = computed(() => Boolean(download.value?.signingExpiresAt && Date.parse(download.value.signingExpiresAt) < Date.now()))
const signingExpiry = computed(() => download.value?.signingExpiresAt ? new Date(download.value.signingExpiresAt).toLocaleDateString('ru-RU', {timeZone:'Europe/Moscow'}) : '')
const download = computed(() => release.value?.downloads.find(item => item.platform === selected.value))
async function load() {
  loading.value = true; error.value = ''
  try { release.value = await backendFetch<AppRelease>('/api/releases/latest', { timeout: 15000, retry: 0 }) }
  catch (failure: any) { error.value = failure?.statusCode === 404 ? 'Первый релиз ещё не опубликован.' : 'Не удалось загрузить список установщиков. Повторите попытку.' }
  finally { loading.value = false }
}
onMounted(() => {
  const agent = navigator.userAgent
  selected.value = /Android/i.test(agent) ? 'android' : /iPhone|iPad/i.test(agent) || (/Mac/i.test(agent) && navigator.maxTouchPoints > 1) ? 'ios' : /Mac/i.test(agent) ? 'macos' : 'windows'
  void load()
})
</script>
<template>
  <main class="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-5 py-12 sm:py-20">
    <NuxtLink to="/" class="flex items-center gap-3 font-semibold"><img src="/favicon.svg" alt="" class="size-9" />Magnat</NuxtLink>
    <div><p class="text-sm text-primary-600">ПРИЛОЖЕНИЕ ДЛЯ ВАШЕГО УСТРОЙСТВА</p><h1 class="mt-3 text-4xl font-semibold tracking-tight">Скачать Magnat</h1><p class="mt-4 text-slate-500">Выберите платформу и установите актуальную версию приложения.</p></div>
    <UCard>
      <UFormField label="Платформа"><USelect v-model="selected" :items="platforms" class="mt-2 w-full" size="lg" /></UFormField>
      <p v-if="loading" class="mt-6" role="status">Проверяем доступные версии…</p>
      <UAlert v-else-if="error" class="mt-6" color="neutral" :description="error" :actions="[{label:'Повторить',onClick:load}]" />
      <template v-else>
        <p class="mt-6 text-sm text-slate-500">Версия оболочки <strong class="text-slate-900">v{{ release?.version }}</strong></p>
        <UButton v-if="download?.url" class="mt-4" size="lg" icon="i-lucide-download" :href="backendUrl(download.url)" :label="`Скачать · ${download.label}`" :disabled="signingExpired" />
        <UAlert v-else class="mt-4" color="neutral" :description="selected === 'ios' ? 'Версия для iPhone и iPad готовится. Публичная установка пока недоступна.' : 'Установщик для этой платформы пока не опубликован.'" />
        <p v-if="selected === 'ios' && download" class="mt-4 text-xs text-slate-500">IPA предназначен для зарегистрированных iPhone и устанавливается через инструменты разработчика. Это не версия из App Store. <span v-if="signingExpiry">Подпись действует до {{ signingExpiry }}.</span><span v-if="signingExpired"> Срок подписи истёк; требуется новый подписанный пакет.</span></p>
        <p v-if="selected === 'android'" class="mt-4 text-xs text-slate-500">Android запросит разрешение на установку APK. Для обновления сохраните установленное приложение и его данные.</p>
      </template>
    </UCard>
    <section v-if="release"><h2 class="text-xl font-semibold">Что нового в v{{ release.version }}</h2><p class="mt-4 whitespace-pre-wrap break-words leading-7 text-slate-600">{{ release.notes }}</p></section>
    <NuxtLink to="/" class="text-sm text-primary-600">Открыть Magnat в браузере →</NuxtLink>
  </main>
</template>
