<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import MonthCalendar from '~/components/Shared/MonthCalendar.vue'
import ContractRegisterDetail from './ContractRegisterDetail.vue'
import { useMonthCalendar } from '~/composables/shared/useMonthCalendar'
import { contractCalendarEvents, type ContractCalendarKind } from '~~/shared/utils/contract-calendar'
import { todayDate,dateLabel } from '~~/shared/utils/subscriptions'
import type { RegisterContract } from '~~/shared/types/contract-register'

const auth=useAuthStore(),vault=useVaultStore(),access=useProjectAccess()
const today=useState('subscription-today',()=>todayDate())
const month=useState('contract-calendar-month',()=>today.value.slice(0,7)+'-01')
const selected=useState('contract-calendar-selected',()=>today.value)
const {monthTitle,selectedMonth,selectedYear,monthOptions,dates,move,goToday}=useMonthCalendar(month,selected,today)
const q=ref(''),search=ref(''),projectId=ref('all'),origin=ref('all'),status=ref('all'),kind=ref<ContractCalendarKind>('all')
const current=ref<RegisterContract|null>(null)
let timer:ReturnType<typeof setTimeout>|undefined
watch(q,value=>{clearTimeout(timer);timer=setTimeout(()=>{search.value=value},300)})
onBeforeUnmount(()=>clearTimeout(timer))
const params=computed(()=>new URLSearchParams({month:month.value.slice(0,7),kind:kind.value,q:search.value,projectId:projectId.value,origin:origin.value,status:status.value}).toString())
type CalendarResult={contracts:RegisterContract[];total:number;withoutDates:number;projects:{id:string;name:string}[]}
const query=useQuery({queryKey:computed(()=>['account',auth.user?.id,'contract-calendar',params.value]),queryFn:({signal})=>sharedRequest<CalendarResult>(`/api/contract-register/calendar?${params.value}`,{signal}),enabled:computed(()=>!!auth.user&&vault.unlocked&&!!access.data.value?.allowed),refetchInterval:30000,retry:false})
const events=computed(()=>contractCalendarEvents(query.data.value?.contracts||[],kind.value))
const cells=computed(()=>dates.value.map(cell=>({...cell,events:events.value.filter(event=>event.date===cell.date)})))
const selectedEvents=computed(()=>events.value.filter(event=>event.date===selected.value))
const monthEvents=computed(()=>events.value.filter(event=>event.date.slice(0,7)===month.value.slice(0,7)))
const projects=computed(()=>[{label:'Все проекты',value:'all'},...(query.data.value?.projects||[]).map(project=>({label:project.name,value:project.id}))])
const label=(event:typeof events.value[number])=>event.kind==='date'?'Дата договора':event.contract.autoRenew?'Срок · Автопродление':'Срок окончания'
const overdue=(event:typeof events.value[number])=>event.kind==='deadline'&&event.date<today.value&&!event.contract.autoRenew
const money=(value:number|null)=>value===null?'Сумма не указана':new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(value)
watch(()=>auth.user?.id,()=>{current.value=null;q.value='';search.value='';projectId.value='all';origin.value='all';status.value='all'})
watch(()=>access.data.value?.allowed,allowed=>{if(!allowed)current.value=null})
</script>

<template>
  <section class="subscription-calendar contract-calendar" aria-label="Календарь договоров">
    <div class="contract-calendar-filters">
      <UInput v-model="q" icon="i-lucide-search" placeholder="Номер, стороны, проект или поле" aria-label="Поиск договоров в календаре"/>
      <USelect v-model="projectId" :items="projects" aria-label="Проект календаря договоров"/>
      <USelect v-model="origin" :items="[{label:'Все источники',value:'all'},{label:'Из проектов',value:'project'},{label:'Без проекта',value:'standalone'}]" aria-label="Источник договоров"/>
      <USelect v-model="kind" :items="[{label:'Все даты',value:'all'},{label:'Даты договоров',value:'date'},{label:'Сроки окончания',value:'deadline'}]" aria-label="Тип даты договора"/>
      <USelect v-model="status" :items="[{label:'Все сроки',value:'all'},{label:'Просроченные',value:'overdue'},{label:'Без срока',value:'no-deadline'},{label:'Автопродление',value:'auto-renew'}]" aria-label="Срок договора"/>
    </div>
    <UAlert v-if="query.error.value" color="error" title="Не удалось загрузить календарь договоров" :actions="[{label:'Повторить',onClick:()=>query.refetch()}]" class="mb-4"/>
    <MonthCalendar v-model:month="selectedMonth" v-model:year="selectedYear" v-model:selected="selected" :title="monthTitle" :description="`Даты договоров и сроки окончания. Найдено договоров: ${query.data.value?.total||0}`" :today="today" :cells="cells" :month-options="monthOptions" @move="move" @today="goToday">
      <template #summary>
        <p v-if="query.isFetching.value" role="status" class="subscription-empty">Загружаем календарь…</p>
        <div class="calendar-total"><span>Даты договоров за месяц</span><strong>{{monthEvents.filter(event=>event.kind==='date').length}}</strong><span>Сроки окончания за месяц</span><strong>{{monthEvents.filter(event=>event.kind==='deadline').length}}</strong></div>
        <p v-if="query.data.value?.withoutDates" class="subscription-empty">Без подходящей даты для календаря: {{query.data.value.withoutDates}}. Эти договоры доступны в разделе «Все договоры».</p>
      </template>
      <template #cell="{cell}"><small v-for="event in cell.events.slice(0,3)" :key="event.key" :class="{'is-overdue':overdue(event),'is-paid':event.kind==='date'}" :title="`${label(event)} · ${event.contract.number} · ${event.contract.projectName||'Без проекта'}`">{{label(event)}} · {{event.contract.number}}</small><small v-if="cell.events.length>3">Ещё {{cell.events.length-3}}</small></template>
      <template #details>
        <div class="subscription-day-details"><h3>{{dateLabel(selected)}}</h3><p v-if="!selectedEvents.length&&!query.isFetching.value">На этот день нет дат и сроков договоров по выбранным фильтрам.</p><article v-for="event in selectedEvents" :key="event.key"><div><button type="button" class="subscription-service" @click="current=event.contract">{{event.contract.number}} · {{label(event)}}</button><p>{{event.contract.projectName||'Без проекта'}} · {{event.contract.seller}} → {{event.contract.buyer}}</p><p>{{money(event.contract.amount)}}{{overdue(event)?' · Указанный срок прошёл':''}}</p></div><div class="flex gap-2"><UButton label="Открыть договор" color="neutral" variant="outline" @click="current=event.contract"/><UButton v-if="event.contract.canOpenProject&&event.contract.projectId" label="Проект" :to="`/projects/${event.contract.projectId}`" color="neutral" variant="ghost"/></div></article></div>
      </template>
    </MonthCalendar>
    <p class="subscription-note">Срок договора с автопродлением — указанная дата, а не подтверждённое прекращение договора. Будущие продления не прогнозируются. Бессрочные договоры не создают события окончания. Выберите день, чтобы открыть договор. Даты указаны по московскому времени.</p>
    <ContractRegisterDetail v-if="current" :key="current.origin+'/'+current.id" :contract="current" @close="current=null" @changed="query.refetch()"/>
  </section>
</template>

<style scoped>
.contract-calendar-filters{display:grid;grid-template-columns:2fr repeat(4,minmax(0,1fr));gap:12px;margin-bottom:24px}
@media(max-width:1200px){.contract-calendar-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.contract-calendar-filters{grid-template-columns:minmax(0,1fr)}}
</style>
