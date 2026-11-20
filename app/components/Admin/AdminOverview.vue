<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { AdminMetrics } from '~~/shared/types/admin-metrics'
import { measuredModuleIds, type AdminModuleStorage } from '~~/shared/types/admin-module-storage'
import { homeApps } from '~~/shared/utils/home-layout'

const props = defineProps<{
  accountId: string
  totals: { totalUsers: number; vaults: number } | null
}>()

const { data, isPending, isFetching, isError, refetch } = useQuery({
  queryKey: computed(() => ['account', props.accountId, 'admin-metrics']),
  queryFn: ({ signal }) => sharedRequest<AdminMetrics>('/api/admin/metrics', { signal }),
  refetchInterval: 15_000,
  retry: false,
})
const { data: moduleStorage, isPending: modulesPending, isFetching: modulesFetching, refetch: refetchModules } = useQuery({
  queryKey: computed(() => ['account', props.accountId, 'admin-module-storage']),
  queryFn: ({ signal }) => sharedRequest<AdminModuleStorage>('/api/admin/module-storage', { signal }),
  refetchInterval: 120_000,
  retry: false,
})

const moduleRows = computed(() => {
  const storage = moduleStorage.value
  const shared = storage?.modules?.sharedVaults
  const sharedBytes = shared ? shared.databaseBytes + shared.fileBytes : null
  const releaseBytes = storage?.releaseBytes
  return [
    ...measuredModuleIds.map(id => {
      const bytes = storage?.modules?.[id]
      const usesSharedVaults = id === 'passwords' || id === 'finances' || id === 'relationships'
      const ownBytes = bytes ? bytes.databaseBytes + bytes.fileBytes : null
      return {
        id,
        label: id === 'chat' ? 'Чат' : id === 'sharedVaults' ? 'Общие хранилища и карточки' : homeApps[id].label,
        shared: usesSharedVaults,
        databaseBytes: id === 'relationships' ? null : bytes?.databaseBytes,
        fileBytes: id === 'relationships' ? null : bytes?.fileBytes,
        ownBytes: id === 'sharedVaults' ? null : ownBytes,
        totalBytes: usesSharedVaults && ownBytes != null && sharedBytes != null ? ownBytes + sharedBytes : ownBytes,
      }
    }),
    { id: 'applications', label: homeApps.applications.label, shared: false, databaseBytes: null,
      fileBytes: releaseBytes, ownBytes: releaseBytes, totalBytes: releaseBytes },
  ]
})

const moduleTotals = computed(() => {
  const storage = moduleStorage.value
  if (!storage?.modules) return null

  let databaseBytes = 0
  let fileBytes = 0
  for (const { databaseBytes: database, fileBytes: files } of Object.values(storage.modules)) {
    databaseBytes += database
    fileBytes += files
  }

  if (storage.releaseBytes == null) return { databaseBytes, fileBytes: null, ownBytes: null, totalBytes: null }

  fileBytes += storage.releaseBytes
  const totalBytes = databaseBytes + fileBytes
  const shared = storage.modules.sharedVaults
  return { databaseBytes, fileBytes, ownBytes: totalBytes - shared.databaseBytes - shared.fileBytes, totalBytes }
})

async function refresh() {
  await Promise.all([refetch(), refetchModules()])
}

const docker = computed(() => data.value?.docker)
const disk = computed(() => docker.value?.disk)
const releasesDisk = computed(() => data.value?.releasesDisk)
const memory = computed(() => docker.value?.memory)
const services = computed(() => docker.value?.services)
const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
const timeFormat = new Intl.DateTimeFormat('ru-RU', { timeStyle: 'medium' })
const states: Record<string, string> = {
  running: 'Работает', exited: 'Остановлен', created: 'Создан', restarting: 'Перезапускается',
  paused: 'Приостановлен', dead: 'Недоступен', removing: 'Удаляется',
}

function formatBytes(value?: number | null) {
  if (value == null) return '—'
  const units = ['Б', 'КиБ', 'МиБ', 'ГиБ', 'ТиБ']
  const unit = Math.min(units.length - 1, Math.floor(Math.log(Math.max(1, value)) / Math.log(1024)))
  return `${numberFormat.format(value / 1024 ** unit)} ${units[unit]}`
}

function usedPercent(capacity?: { totalBytes: number; availableBytes: number } | null) {
  if (!capacity?.totalBytes) return undefined
  return 100 * Math.max(0, capacity.totalBytes - capacity.availableBytes) / capacity.totalBytes
}
</script>

<template>
  <div class="space-y-6 pb-10">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">Состояние сервера</h1>
        <p v-if="docker" class="mt-1 text-sm text-slate-500">
          Среда Docker · замер в {{ timeFormat.format(new Date(docker.sampledAt)) }}
        </p>
      </div>
      <UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" label="Обновить" :loading="isFetching || modulesFetching" @click="refresh()" />
    </div>

    <UAlert v-if="isError" color="error" variant="soft" title="Не удалось обновить показатели" />
    <UAlert v-else-if="!isPending && !docker" color="warning" variant="soft" title="Сборщик метрик Docker недоступен" />

    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <UCard>
        <p class="text-sm font-medium text-slate-600">Пользователи онлайн</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums">{{ data?.onlineUsers ?? '—' }}</p>
        <p class="mt-2 text-xs text-slate-500">Активность за последние 75 секунд</p>
      </UCard>
      <UCard>
        <p class="text-sm font-medium text-slate-600">CPU</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums">{{ docker?.cpuPercent == null ? '—' : `${numberFormat.format(docker.cpuPercent)} %` }}</p>
        <UProgress v-if="docker?.cpuPercent != null" :model-value="docker.cpuPercent" aria-label="Загрузка CPU" size="sm" class="mt-3" />
        <p v-if="docker" class="mt-2 text-xs text-slate-500">
          Средняя нагрузка за 1 / 5 / 15 мин · {{ docker.loadAverage.map(value => numberFormat.format(value)).join(' / ') }}
        </p>
      </UCard>
      <UCard>
        <p class="text-sm font-medium text-slate-600">Оперативная память</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums">{{ memory ? formatBytes(memory.totalBytes - memory.availableBytes) : '—' }}</p>
        <UProgress v-if="memory" :model-value="usedPercent(memory)" aria-label="Использование оперативной памяти" size="sm" class="mt-3" />
        <p v-if="memory" class="mt-2 text-xs text-slate-500">Занято из {{ formatBytes(memory.totalBytes) }}</p>
      </UCard>
      <UCard>
        <p class="text-sm font-medium text-slate-600">Свободно на диске Docker</p>
        <p class="mt-2 text-2xl font-semibold tabular-nums">{{ formatBytes(disk?.availableBytes) }}</p>
        <UProgress v-if="disk" :model-value="usedPercent(disk)" aria-label="Использование диска Docker" size="sm" class="mt-3" />
        <p v-if="disk" class="mt-2 text-xs text-slate-500">Свободно из {{ formatBytes(disk.totalBytes) }}</p>
        <p v-if="releasesDisk" class="mt-2 text-xs text-slate-500">Диск релизов · {{ formatBytes(releasesDisk.availableBytes) }} из {{ formatBytes(releasesDisk.totalBytes) }}</p>
      </UCard>
    </div>

    <UCard>
      <template #header><h2 class="font-semibold">Размеры разделов Magnat</h2></template>
      <p v-if="modulesPending" class="text-sm text-slate-500">Загружаем размеры разделов…</p>
      <UAlert v-else-if="!moduleStorage?.modules" variant="soft" color="warning" title="Замер данных разделов недоступен" class="mb-3" />
      <div class="overflow-x-auto">
        <table class="admin-table whitespace-nowrap">
          <thead>
            <tr><th scope="col">Раздел</th><th scope="col">База данных</th><th scope="col">Файлы</th><th scope="col">Собственный объём</th><th scope="col">С учётом общих данных</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in moduleRows" :key="row.id">
              <th scope="row" class="font-medium! text-slate-700!">
                {{ row.label }}
                <span v-if="row.shared" class="ml-1 text-xs font-normal text-slate-500">· есть общие данные</span>
              </th>
              <td class="tabular-nums">{{ formatBytes(row.databaseBytes) }}</td>
              <td class="tabular-nums">{{ formatBytes(row.fileBytes) }}</td>
              <td class="tabular-nums">{{ formatBytes(row.ownBytes) }}</td>
              <td class="font-medium tabular-nums">{{ formatBytes(row.totalBytes) }}</td>
            </tr>
          </tbody>
          <tfoot v-if="moduleTotals" class="bg-slate-50 font-semibold tabular-nums">
            <tr>
              <th scope="row" class="font-semibold! text-slate-700!">Итого по всем разделам</th>
              <td>{{ formatBytes(moduleTotals.databaseBytes) }}</td>
              <td>{{ formatBytes(moduleTotals.fileBytes) }}</td>
              <td>{{ formatBytes(moduleTotals.ownBytes) }}</td>
              <td>{{ formatBytes(moduleTotals.totalBytes) }}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p v-if="moduleTotals && moduleStorage?.releaseBytes == null" class="mt-3 text-xs text-slate-500">Полный итог появится, когда станет доступен размер пакетов приложений.</p>
      <p class="mt-3 text-xs leading-5 text-slate-500">Пароли, финансы и взаимосвязи используют одно общее хранилище. Его полный объём показан в каждой из этих строк и учтён один раз в итоге. База данных включает индексы, а «Приложения» — установщики и пакеты обновлений.</p>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="font-semibold">Размеры контейнеров Docker</h2>
          <p v-if="docker?.servicesSampledAt" class="text-xs text-slate-500">
            Замер в {{ timeFormat.format(new Date(docker.servicesSampledAt)) }} · каждые 2 мин
          </p>
        </div>
      </template>
      <div v-if="services?.length" class="overflow-x-auto">
        <table class="admin-table whitespace-nowrap">
          <thead><tr><th scope="col">Сервис</th><th scope="col">Состояние</th><th scope="col">Размер с образом</th><th scope="col">Изменения контейнера</th></tr></thead>
          <tbody>
            <tr v-for="service in services" :key="service.name">
              <td><div class="font-medium">{{ service.service }}</div><div class="text-xs text-slate-500">{{ service.name }}</div></td>
              <td><UBadge :color="service.state === 'running' ? 'success' : 'neutral'" variant="soft">{{ states[service.state] ?? service.state }}</UBadge></td>
              <td class="tabular-nums">{{ formatBytes(service.totalBytes) }}</td>
              <td class="tabular-nums">{{ formatBytes(service.writableBytes) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-sm text-slate-500">{{ isPending ? 'Загружаем размеры…' : 'Размеры сервисов пока недоступны.' }}</p>
      <p class="mt-3 text-xs text-slate-500">Размер включает образ и изменения контейнера. Подключённые тома в эти значения не входят.</p>
    </UCard>

    <div class="grid gap-4 sm:grid-cols-3">
      <UCard><p class="text-sm text-slate-500">Всего пользователей</p><p class="mt-2 text-xl font-semibold">{{ totals?.totalUsers ?? '—' }}</p></UCard>
      <UCard><p class="text-sm text-slate-500">Зашифрованных хранилищ</p><p class="mt-2 text-xl font-semibold">{{ totals?.vaults ?? '—' }}</p></UCard>
      <UCard><p class="text-sm text-slate-500">Шифрование хранилищ</p><p class="mt-2 text-xl font-semibold">AES-256-GCM</p></UCard>
    </div>
  </div>
</template>
