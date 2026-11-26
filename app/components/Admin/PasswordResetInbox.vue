<script setup lang="ts">
type ResetRequest = { email: string; code: string; createdAt: string; expiresAt: string }
const requests = ref<ResetRequest[]>([])
const pending = ref(true)
const error = ref('')
const toast = useToast()
const formatDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
const controller = new AbortController()
let timer: ReturnType<typeof setInterval>

async function load() {
  pending.value = true
  try {
    const result = await sharedRequest<ResetRequest[]>('/api/admin/password-resets', { signal: controller.signal })
    if (controller.signal.aborted) return
    requests.value = result
    error.value = ''
  } catch (failure: any) {
    if (controller.signal.aborted) return
    requests.value = []
    error.value = failure?.data?.message || 'Не удалось загрузить запросы.'
  } finally {
    pending.value = false
  }
}

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    toast.add({ title: 'Код скопирован', color: 'success' })
  } catch {
    toast.add({ title: 'Выделите и скопируйте код вручную', color: 'warning' })
  }
}

onMounted(() => {
  void load()
  timer = setInterval(() => {
    if (!pending.value && document.visibilityState === 'visible') void load()
  }, 20_000)
})
onBeforeUnmount(() => {
  controller.abort()
  clearInterval(timer)
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="font-semibold">Активные запросы</h2>
        <UButton label="Обновить" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="pending" @click="load" />
      </div>
    </template>
    <p class="mb-4 text-sm text-slate-500">Перед передачей кода проверьте личность пользователя. Код действует 30 минут.</p>
    <UAlert v-if="error" color="error" variant="soft" :description="error" />
    <p v-else-if="!requests.length" class="py-4 text-sm text-slate-500" role="status">{{ pending ? 'Загружаем запросы…' : 'Активных запросов пока нет.' }}</p>
    <div v-else class="overflow-x-auto">
      <table class="admin-table">
        <thead><tr><th>Email</th><th>Получен</th><th>Действует до</th><th>Код сброса</th></tr></thead>
        <tbody>
          <tr v-for="request in requests" :key="request.email">
            <td>{{ request.email }}</td>
            <td>{{ formatDate.format(new Date(request.createdAt)) }}</td>
            <td>{{ formatDate.format(new Date(request.expiresAt)) }}</td>
            <td>
              <div class="flex items-center gap-2">
                <code class="select-all rounded bg-slate-100 px-2 py-1">{{ request.code }}</code>
                <UButton icon="i-lucide-copy" color="neutral" variant="ghost" size="xs" label="Скопировать" @click="copyCode(request.code)" />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </UCard>
</template>
