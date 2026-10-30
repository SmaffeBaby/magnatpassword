<script setup lang="ts">
import { executionMoney } from '~~/shared/utils/project-execution'
const props = defineProps<{ projectId: string }>()
const query = useProjectProcessData(() => props.projectId)
const metrics = computed(() => {
  const data = query.data.value
  return [
    { label: 'Затраты по смете', icon: 'i-lucide-calculator', value: data ? executionMoney(data.estimate.cost) : '—' },
    { label: 'Выручка по смете', icon: 'i-lucide-chart-no-axes-combined', value: data ? executionMoney(data.estimate.revenue) : '—' },
    { label: 'Прибыль с проекта', icon: 'i-lucide-wallet', value: data ? executionMoney(data.estimate.difference) : '—' },
    { label: 'Участников-компаний', icon: 'i-lucide-building-2', value: data ? data.parties.length : '—' },
    { label: 'Документов в комплектах', icon: 'i-lucide-files', value: data ? data.documentCount : '—' }
  ]
})
</script>
<template>
  <UAlert v-if="query.error.value" title="Не удалось загрузить показатели проекта" color="error" :actions="[{ label: 'Повторить', onClick: () => query.refetch() }]" class="mb-5"/>
  <div v-else class="project-overview project-financial-overview" aria-label="Показатели проекта" :aria-busy="query.isFetching.value">
    <div v-for="metric in metrics" :key="metric.label"><UIcon :name="metric.icon"/><small>{{ metric.label }}</small><strong>{{ query.isPending.value ? 'Загрузка…' : metric.value }}</strong></div>
  </div>
</template>
<style scoped>
.project-financial-overview{grid-template-columns:repeat(5,minmax(0,1fr))}.project-financial-overview>div{padding:20px 18px}.project-financial-overview strong{font-size:17px;font-variant-numeric:tabular-nums}.project-financial-overview small{line-height:1.6}
@media(max-width:1400px){.project-financial-overview{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:900px){.project-financial-overview{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.project-financial-overview>div{padding:16px 12px}.project-financial-overview strong{font-size:14px}}
@media(max-width:400px){.project-financial-overview{grid-template-columns:minmax(0,1fr)}}
</style>
