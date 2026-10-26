<script setup lang="ts">
import type { VaultSource } from '~~/shared/types/sharing'
import type { Currency } from '~~/shared/types/subscriptions'
import type { FinanceReportSummary } from '~~/shared/types/finance-reports'
import { dateLabel } from '~~/shared/utils/subscriptions'
import { amountLabel } from '~~/shared/utils/subscription-finances'
const props=defineProps<{mode:'report'|'reports';sources:VaultSource[];from:string;to:string;group:string;currency:string;search:string;validRange:boolean}>()
const store=useFinanceReportsStore()
const title=ref('Отчёт об оплаченных услугах'),created=ref<FinanceReportSummary|null>(null),deleting=ref<FinanceReportSummary|null>(null)
const deleteOpen=ref(false),formId=useId()
const selectedSources=computed(()=>props.group==='all'?props.sources:props.sources.filter(source=>source.id===props.group))
const stamp=(value:string)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',dateStyle:'medium',timeStyle:'short'}).format(new Date(value))
async function generate(){
  const report=await store.generate({title:title.value.trim(),from:props.from,to:props.to,vaultIds:selectedSources.value.map(source=>source.id),currency:props.currency as Currency|'all',search:props.search.trim()})
  if(report){created.value=report;await store.download(report)}
}
function askDelete(report:FinanceReportSummary){deleting.value=report;deleteOpen.value=true}
async function remove(){if(deleting.value&&await store.remove(deleting.value)){if(created.value?.id===deleting.value.id)created.value=null;deleteOpen.value=false;deleting.value=null}}
watch(()=>props.mode,mode=>{if(mode==='reports')store.refresh()},{immediate:true})
</script>
<template>
 <section class="finance-reports">
  <UAlert v-if="store.error" color="error" :description="store.error" class="mb-4"/>
  <template v-if="mode==='report'">
   <form :id="formId" class="finance-report-builder" @submit.prevent="generate">
    <div><h2>Отчёт об оплаченных услугах</h2><p>PDF за выбранный период с графиками, итогами и подробным реестром оплат.</p></div>
    <UFormField label="Название отчёта" required><UInput v-model="title" :maxlength="120" required class="w-full" :disabled="store.generating"/></UFormField>
    <dl class="finance-report-scope"><div><dt>Период</dt><dd>{{ dateLabel(from) }} — {{ dateLabel(to) }}</dd></div><div><dt>Хранилища</dt><dd>{{ selectedSources.map(source=>source.name).join(', ') || 'Не выбраны' }}</dd></div><div><dt>Валюта</dt><dd>{{ currency==='all'?'Все валюты, отдельные итоги по каждой':currency }}</dd></div><div v-if="search.trim()"><dt>Поиск</dt><dd>{{ search }}</dd></div></dl>
    <div class="finance-report-contents"><h3>Что войдёт в PDF</h3><ul><li>Общая сумма оплат и количество услуг по валютам.</li><li>Месячные графики с разбивкой по услугам.</li><li>Распределение расходов: суммы и доли каждой услуги.</li><li>Реестр оплат: сервис, подписка, хранилище, дата, сумма и оплаченный период.</li></ul></div>
    <p class="finance-report-caption">Используются период, хранилища, валюта и поиск из фильтров выше. Фильтр срока и валюта экранных графиков не влияют на отчёт. В PDF входят фактические оплаты, включая внесённые вручную.</p>
    <UButton type="submit" icon="i-lucide-file-down" label="Сформировать и скачать PDF" :loading="store.generating" :disabled="!validRange||!selectedSources.length||!title.trim()"/>
    <p v-if="store.generating" role="status" class="finance-report-caption">Формируем PDF и сохраняем его в историю…</p>
   </form>
   <UAlert v-if="created" color="success" title="Отчёт сохранён в истории" :description="`${created.title} · ${created.paymentCount} оплат · ${dateLabel(created.from)} — ${dateLabel(created.to)}`" class="mt-4"/>
   <UButton v-if="created" color="neutral" variant="outline" icon="i-lucide-download" label="Скачать PDF повторно" class="mt-3" :loading="store.downloadingIds.includes(created.id)" @click="store.download(created)"/>
  </template>
  <template v-else>
   <div class="finance-report-history-heading"><div><h2>История отчётов</h2><p>Все ваши сформированные PDF. Сохранённые документы содержат данные на момент создания.</p></div><UButton color="neutral" variant="outline" icon="i-lucide-refresh-cw" label="Обновить" :loading="store.loading" @click="store.refresh(store.page,true)"/></div>
   <div class="finance-table-scroll"><table class="finance-table"><thead><tr><th>Отчёт / создан</th><th>Период</th><th>Оплат</th><th>Итоги</th><th>Действия</th></tr></thead><tbody><tr v-for="report in store.items" :key="report.id"><td><strong>{{ report.title }}</strong><small>{{ stamp(report.createdAt) }} МСК</small><details class="finance-report-details"><summary>Условия отчёта</summary><p>{{ report.vaultNames.join(', ') }}</p><p>Валюта: {{ report.currency==='all'?'Все валюты':report.currency }}</p><p v-if="report.search">Поиск: {{ report.search }}</p></details></td><td>{{ dateLabel(report.from) }} — {{ dateLabel(report.to) }}</td><td>{{ report.paymentCount }}<small>{{ report.serviceCount }} услуг</small></td><td><div v-for="value in report.totals" :key="value.currency">{{ amountLabel(value.amount,value.currency) }}</div><span v-if="!report.totals.length">Нет оплат</span></td><td><div class="flex flex-wrap gap-2"><UButton size="sm" icon="i-lucide-download" label="Скачать PDF" variant="outline" color="neutral" :loading="store.downloadingIds.includes(report.id)" @click="store.download(report)"/><UButton size="sm" icon="i-lucide-trash-2" color="error" variant="ghost" aria-label="Удалить отчёт" :disabled="!!store.deletingId" @click="askDelete(report)"/></div></td></tr></tbody></table></div>
   <p v-if="!store.items.length&&!store.loading" class="subscription-empty">Отчётов пока нет. Откройте вкладку «Отчёт», выберите период и сформируйте первый PDF.</p>
   <div v-if="store.total>20" class="finance-report-pagination"><UButton color="neutral" variant="outline" icon="i-lucide-chevron-left" label="Назад" :disabled="store.page<=1||store.loading" @click="store.refresh(store.page-1)"/><span>{{ store.page }} / {{ store.pages }} · {{ store.total }} отчётов</span><UButton color="neutral" variant="outline" trailing-icon="i-lucide-chevron-right" label="Далее" :disabled="store.page>=store.pages||store.loading" @click="store.refresh(store.page+1)"/></div>
  </template>
  <UModal v-model:open="deleteOpen" title="Удалить сохранённый отчёт?" description="PDF будет удалён из истории отчётов. Записи об оплате сохранятся." :dismissible="!store.deletingId" :ui="{footer:'justify-end'}"><template #body><p>{{ deleting?.title }}</p><UAlert v-if="store.error" color="error" :description="store.error" class="mt-4"/></template><template #footer><UButton color="neutral" variant="outline" label="Отмена" :disabled="!!store.deletingId" @click="deleteOpen=false"/><UButton color="error" label="Удалить отчёт" :loading="!!store.deletingId" @click="remove"/></template></UModal>
 </section>
</template>
