<script setup lang="ts">
import type { AccountDevice } from '~~/shared/types/account-device'

const auth = useAuthStore(), toast = useToast()
const devices = ref<AccountDevice[]>([]), loading = ref(false), removing = ref(false), error = ref('')
const confirmation = ref<AccountDevice | 'others' | null>(null)
const confirmOpen = computed({ get: () => confirmation.value !== null, set: (open: boolean) => { if (!open && !removing.value) confirmation.value = null } })
const hasOtherDevices = computed(() => devices.value.some(device => !device.current))
const confirmationDescription = computed(() => {
  const target = confirmation.value
  if (target === 'others') return 'Текущий сеанс останется активным. На остальных устройствах потребуется войти заново.'
  if (!target) return ''
  return `${target.platform} · ${target.kind === 'app' ? 'Приложение Magnat' : target.browser}. Сохранённый вход на этом устройстве перестанет работать.`
})
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
  const target = confirmation.value, account = auth.user?.id
  if (!target || !account || removing.value) return
  removing.value = true; error.value = ''
  try {
    if (target === 'others') {
      await sharedRequest('/api/profile/devices/others', { method: 'DELETE' })
      if (auth.user?.id !== account) return
      confirmation.value = null
      toast.add({ title: 'Вы вышли с других устройств', color: 'success' })
    } else {
      const result = await sharedRequest<{ current: boolean }>(`/api/profile/devices/${target.id}`, { method: 'DELETE' })
      if (auth.user?.id !== account) return
      confirmation.value = null
      if (result.current) {
        await auth.invalidateSession()
        return
      }
    }
    await load()
  } catch (failure: any) {
    if (auth.user?.id === account) error.value = failure?.data?.message
      || (target === 'others' ? 'Не удалось выйти с других устройств.' : 'Не удалось завершить сеанс устройства.')
  }
  finally { removing.value = false }
}
onMounted(() => { void load() })
onBeforeUnmount(() => { sequence++ })
</script>

<template>
  <UCard class="my-6">
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-4">
        <div><h2 class="font-semibold">Мои устройства</h2><p class="mt-1 text-sm text-slate-500">Сеансы аккаунта в браузерах и приложениях, включая сохранённый вход.</p></div>
        <div class="flex flex-wrap items-center gap-2">
          <UButton label="Выйти с других устройств" color="error" variant="soft" icon="i-lucide-log-out" :disabled="loading || removing || !hasOtherDevices" @click="confirmation = 'others'; error = ''" />
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" aria-label="Обновить список устройств" :loading="loading" :disabled="removing" @click="load" />
        </div>
      </div>
    </template>
    <UAlert v-if="error && !confirmOpen" color="error" :description="error" class="mb-4" />
    <p v-if="loading && !devices.length" class="text-sm text-slate-500">Загружаем устройства…</p>
    <ul v-else-if="devices.length" class="divide-y divide-slate-100">
      <li v-for="device in devices" :key="device.id" class="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
        <UIcon :name="['Android','iOS'].includes(device.platform) ? 'i-lucide-smartphone' : 'i-lucide-monitor'" class="size-7 shrink-0 text-slate-400" />
        <div class="min-w-0 flex-1"><div class="flex flex-wrap items-center gap-2"><strong class="text-sm">{{ device.platform }} · {{ device.kind === 'app' ? 'Приложение Magnat' : device.browser }}</strong><UBadge v-if="device.current" color="primary" variant="soft" size="sm">Это устройство</UBadge></div><p class="mt-1 text-xs text-slate-500">{{ device.kind === 'app' ? 'Приложение' : 'Веб-версия' }} · Вход: {{ date(device.createdAt) }}</p><p class="mt-1 text-xs text-slate-500">Последняя связь: {{ date(device.lastSeen) }}</p></div>
        <UButton color="error" variant="soft" icon="i-lucide-log-out" :aria-label="`Завершить сеанс: ${device.platform}, ${device.kind === 'app' ? 'приложение' : device.browser}`" :disabled="removing" @click="confirmation = device; error = ''">Завершить сеанс</UButton>
      </li>
    </ul>
    <p v-else class="text-sm text-slate-500">Активных сеансов нет.</p>
    <p class="mt-5 text-xs text-slate-400">После завершения сеанса устройство потеряет доступ и для нового входа потребуется пароль.</p>
    <UModal v-model:open="confirmOpen" :title="confirmation === 'others' ? 'Выйти с других устройств?' : 'Завершить сеанс устройства?'" :description="confirmationDescription" :dismissible="!removing">
      <template v-if="error" #body><UAlert color="error" :description="error" /></template>
      <template #footer>
        <UButton label="Отмена" color="neutral" variant="ghost" :disabled="removing" @click="confirmation = null" />
        <UButton :label="confirmation === 'others' ? 'Выйти с других устройств' : 'Завершить сеанс'" color="error" :loading="removing" @click="revoke" />
      </template>
    </UModal>
  </UCard>
</template>
