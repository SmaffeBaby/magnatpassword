<script setup lang="ts">
import { invoke, isTauri } from '@tauri-apps/api/core'
const store = useNotificationsStore()
const enabled = ref(store.settings.pushEnabled), saving = ref(false), error = ref(''), status = ref('')
const native = ref(false)
onMounted(() => { native.value = isTauri() })
watch(() => store.settings.pushEnabled, value => { enabled.value = value })
async function allow() {
  error.value = ''; status.value = ''
  try {
    const granted = await invoke<boolean>('notification_permission', { request: true })
    status.value = granted ? 'Уведомления разрешены на этом устройстве.' : 'Разрешите уведомления для Magnat в настройках устройства.'
  } catch { error.value = 'Для системных уведомлений установите обновлённое приложение.' }
}
async function save() {
  saving.value = true; error.value = ''; status.value = ''
  try {
    if (await store.saveSettings({ ...store.settings, pushEnabled: enabled.value })) status.value = 'Настройка сохранена для всех устройств.'
  } finally { saving.value = false }
}
</script>
<template>
  <UCard class="my-6">
    <template #header><h2 class="font-semibold">Уведомления</h2><p class="mt-1 text-sm text-slate-500">Общие настройки аккаунта на всех устройствах.</p></template>
    <form class="max-w-xl space-y-4" @submit.prevent="save">
      <USwitch v-model="enabled" label="Push-уведомления" description="Показывать системные уведомления о новых событиях. Уведомления внутри приложения и счётчик непрочитанных остаются доступны при отключении." :disabled="saving" />
      <p class="text-xs text-slate-500">Системные уведомления работают, пока приложение запущено. Доставка при полностью закрытом приложении ещё не подключена.</p>
      <UButton v-if="native && enabled" type="button" label="Разрешить уведомления на этом устройстве" color="neutral" variant="outline" icon="i-lucide-bell" @click="allow" />
      <UAlert v-if="error || store.error" color="error" :description="error || store.error" />
      <p v-if="status" role="status" class="text-sm text-slate-600">{{ status }}</p>
      <div><UButton type="submit" label="Сохранить настройки уведомлений" icon="i-lucide-check" :loading="saving" /></div>
    </form>
  </UCard>
</template>
