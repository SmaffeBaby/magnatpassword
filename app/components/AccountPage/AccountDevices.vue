<script setup lang="ts">
import type { AccountDevice } from '~~/shared/types/account-device'

const auth = useAuthStore()
const devices = ref<AccountDevice[]>([]), loading = ref(false), removing = ref(false), error = ref('')
const selected = ref<AccountDevice | null>(null)
const confirmOpen = computed({ get: () => Boolean(selected.value), set: (open: boolean) => { if (!open && !removing.value) selected.value = null } })
let sequence = 0
const date = (value: string) => new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
async function load() {
  const id = auth.user?.id, attempt = ++sequence
  if (!id) return
  loading.value = true; error.value = ''
  try {
    const result = await sharedRequest<AccountDevice[]>('/api/profile/devices')
    if (attempt === sequence && auth.user?.id === id) devices.value = result
  } catch (failure: any) { if (attempt === sequence) error.value = failure?.data?.message || 'Не удалось загрузить устройства.' }
  finally { if (attempt === sequence) loading.value = false }
}
async function revoke() {
  const device = selected.value
  if (!device || removing.value) return
  removing.value = true; error.value = ''
  try {
    const result = await sharedRequest<{ current: boolean }>(`/api/profile/devices/${device.id}`, { method: 'DELETE' })
    selected.value = null
    if (result.current) await auth.invalidateSession()
    else await load()
  } catch (failure: any) { error.value = failure?.data?.message || 'Не удалось завершить сеанс устройства.' }
  finally { removing.value = false }
}
onMounted(() => { void load() })
onBeforeUnmount(() => { sequence++ })
</script>

<template>
  <UCard class="my-6">
    <template #header><div class="flex items-start justify-between gap-4"><div><h2 class="font-semibold">Мои устройства</h2><p class="mt-1 text-sm text-slate-500">Сеансы аккаунта в браузерах и приложениях, включая сохранённый вход.</p></div><UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" aria-label="Обновить список устройств" :loading="loading" @click="load" /></div></template>
    <UAlert v-if="error" color="error" :description="error" class="mb-4" />
    <p v-if="loading && !devices.length" class="text-sm text-slate-500">Загружаем устройства…</p>
    <ul v-else-if="devices.length" class="divide-y divide-slate-100">
      <li v-for="device in devices" :key="device.id" class="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
        <UIcon :name="['Android','iOS'].includes(device.platform) ? 'i-lucide-smartphone' : 'i-lucide-monitor'" class="size-7 shrink-0 text-slate-400" />
        <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><strong class="text-sm">{{ device.platform }} · {{ device.kind === 'app' ? 'Приложение Magnat' : device.browser }}</strong><UBadge v-if="device.current" color="primary" variant="soft" size="sm">Это устройство</UBadge></div><p class="mt-1 text-xs text-slate-500">{{ device.kind === 'app' ? 'Приложение' : 'Веб-версия' }} · Вход: {{ date(device.createdAt) }}</p><p class="mt-1 text-xs text-slate-500">Последняя связь: {{ date(device.lastSeen) }}</p></div>
        <UButton color="error" variant="soft" icon="i-lucide-log-out" :aria-label="`Завершить сеанс: ${device.platform}, ${device.kind === 'app' ? 'приложение' : device.browser}`" :disabled="removing" @click="selected = device">Завершить сеанс</UButton>
      </li>
    </ul>
    <p v-else class="text-sm text-slate-500">Активных сеансов нет.</p>
    <p class="mt-5 text-xs text-slate-400">После завершения сеанса устройство потеряет доступ и для нового входа потребуется пароль.</p>
    <UModal v-model:open="confirmOpen" title="Завершить сеанс устройства?" :description="selected ? `${selected.platform} · ${selected.kind === 'app' ? 'Приложение Magnat' : selected.browser}. Сохранённый вход на этом устройстве перестанет работать.` : ''" :dismissible="!removing">
      <template #footer><UButton label="Отмена" color="neutral" variant="ghost" :disabled="removing" @click="selected = null" /><UButton label="Завершить сеанс" color="error" :loading="removing" @click="revoke" /></template>
    </UModal>
  </UCard>
</template>
