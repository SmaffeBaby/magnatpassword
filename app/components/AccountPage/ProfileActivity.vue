<script setup lang="ts">
import type { ActivityFilter, ActivityDay, KabanActivity } from '~~/shared/types/kaban-activity'
import { ACTIVITY_KINDS, activityLabels } from '~~/shared/types/kaban-activity'
import { activityCalendar, activityLevel, activitySummary, activityValue } from '~~/shared/utils/kaban-activity'
import { todayDate } from '~~/shared/utils/subscriptions'
const props=defineProps<{userId:string;brand:'light'|'magnat'}>()
const auth=useAuthStore(),currentYear=Number(todayDate().slice(0,4)),year=ref(currentYear),vault=ref('all'),kind=ref<ActivityFilter>('all')
const data=ref<KabanActivity|null>(null),loading=ref(false),error=ref(''),years=ref<number[]>([currentYear]),vaults=ref<{id:string;name:string}[]>([]),selected=ref(''),focused=ref('')
const colors=computed(()=>props.brand==='light'?['#eef0f6','#d6d5ea','#a9a7ce','#69658f','#26263e']:['#f2f3f5','#f8d6d9','#e8949c','#cf4c58','#ad131e'])
const filters=[{label:'Все действия',value:'all'},...ACTIVITY_KINDS.map(value=>({label:activityLabels[value],value}))]
const dayMap=computed(()=>new Map(data.value?.days.map(day=>[day.date,day])||[]))
const today=computed(()=>data.value?.today||todayDate())
const cells=computed(()=>activityCalendar(year.value,today.value))
const weekCount=computed(()=>cells.value.length/7)
const months=computed(()=>cells.value.filter(day=>day.inYear&&day.monthStart).map(day=>({label:['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'][day.month],week:day.week})))
const summary=computed(()=>activitySummary(data.value?.days||[],kind.value,today.value))
const selectedDay=computed(()=>dayMap.value.get(selected.value))
const yearOptions=computed(()=>[...new Set([currentYear,year.value,...years.value])].sort((a,b)=>b-a).map(value=>({label:String(value),value})))
const vaultOptions=computed(()=>[{label:'Все доступные хранилища',value:'all'},...vaults.value.map(item=>({label:item.name,value:item.id}))])
const dayBreakdown=computed(()=>ACTIVITY_KINDS.map(type=>({type,label:activityLabels[type],count:selectedDay.value?.kinds[type]||0})).filter(item=>item.count>0))
const dateLabel=(value:string)=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'Europe/Moscow'}).format(new Date(value+'T12:00:00Z'))
const value=(date:string)=>activityValue(dayMap.value.get(date),kind.value)
const title=(date:string)=>`${dateLabel(date)}: ${value(date)} действий${kind.value==='all'?'':' · '+activityLabels[kind.value]}`
let request=0
async function load(){
 const ticket=++request;loading.value=true;error.value='';data.value=null
 try{const result=await sharedRequest<KabanActivity>(`/api/team/${props.userId}/activity?`+new URLSearchParams({year:String(year.value),vault:vault.value}));if(ticket!==request)return;years.value=result.years;vaults.value=result.vaults;if(vault.value!=='all'&&!result.vaults.some(item=>item.id===vault.value)){vault.value='all';return}data.value=result;selected.value=result.days.at(-1)?.date||(year.value===currentYear?result.today:`${year.value}-12-31`);focused.value=selected.value}
 catch(failure:any){if(ticket===request)error.value=failure?.data?.message||'Не удалось загрузить календарь активности.'}finally{if(ticket===request)loading.value=false}
}
watch([()=>props.userId,()=>auth.user?.id],()=>{data.value=null;years.value=[currentYear];vaults.value=[];selected.value='';year.value=currentYear;vault.value='all';kind.value='all'})
watch([()=>props.userId,()=>auth.user?.id,year,vault],()=>{void load()},{immediate:true})
const buttons=new Map<string,HTMLButtonElement>()
function cellRef(date:string,element:unknown){if(element instanceof HTMLButtonElement)buttons.set(date,element);else buttons.delete(date)}
function select(date:string){selected.value=date;focused.value=date}
function keyboard(event:KeyboardEvent,index:number){
 const offset:Record<string,number>={ArrowUp:-1,ArrowDown:1,ArrowLeft:-7,ArrowRight:7}
 let target:number|undefined
 if(event.key in offset)target=index+offset[event.key]!
 else if(event.key==='Home')target=index-index%7
 else if(event.key==='End')target=index+(6-index%7)
 if(target===undefined)return
 event.preventDefault()
 const direction=target<index?-1:1
 while(target>=0&&target<cells.value.length){const day=cells.value[target]!;if(day.inYear&&!day.future){focused.value=day.date;void nextTick(()=>buttons.get(day.date)?.focus());return}target+=direction}
}
onBeforeUnmount(()=>{request++;buttons.clear()})
</script>
<template>
 <section class="profile-activity" aria-label="Календарь активности в задачах" :style="{'--activity-accent':colors[4]}" :aria-busy="loading">
  <header class="activity-heading"><div><h2>Активность в задачах</h2><p>Действия в Кабане по дням</p></div><div class="activity-year"><USelect v-model="year" :items="yearOptions" aria-label="Год активности"/><UButton icon="i-lucide-refresh-cw" aria-label="Обновить активность" color="neutral" variant="ghost" :loading="loading" @click="load"/></div></header>
  <div class="activity-filters"><USelect v-model="vault" :items="vaultOptions" aria-label="Хранилище активности" class="flex-1"/><USelect v-model="kind" :items="filters" aria-label="Тип активности" class="flex-1"/></div>
  <UAlert v-if="error" color="error" :description="error" :actions="[{label:'Повторить',onClick:()=>load()}]"/>
  <p v-if="loading" class="activity-loading" role="status">Загружаем активность…</p>
  <template v-else-if="data">
   <div class="activity-stats"><div><strong>{{summary.total}}</strong><span>{{kind==='all'?'Действий за год':activityLabels[kind]}}</span></div><div><strong>{{summary.activeDays}}</strong><span>Активных дней</span></div><div><strong>{{summary.longest}}</strong><span>Лучшая серия, дней</span></div></div>
   <div class="activity-scroll"><div class="activity-chart" :style="{'--weeks':weekCount}">
    <div class="activity-months"><span v-for="month in months" :key="month.label" :style="{gridColumn:`${month.week+1} / span ${Math.min(3,weekCount-month.week)}`}">{{month.label}}</span></div>
    <div class="activity-chart-body"><div class="activity-weekdays" aria-hidden="true"><span>Вс</span><span>Пн</span><span/><span>Ср</span><span/><span>Пт</span><span/></div><div class="activity-cells" role="group" :aria-label="`Календарь действий за ${year} год`"><template v-for="(day,index) in cells" :key="day.date"><button v-if="day.inYear" :ref="element=>cellRef(day.date,element)" type="button" class="activity-day" :class="{'is-selected':selected===day.date,'is-future':day.future}" :style="{gridColumn:day.week+1,gridRow:day.weekday+1,background:colors[activityLevel(value(day.date))]}" :disabled="day.future" :tabindex="focused===day.date?0:-1" :aria-label="title(day.date)" :title="title(day.date)" :aria-pressed="selected===day.date" @click="select(day.date)" @focus="focused=day.date" @keydown="event=>keyboard(event,index)"/><span v-else class="activity-padding" aria-hidden="true" :style="{gridColumn:day.week+1,gridRow:day.weekday+1}"/></template></div></div>
   </div></div>
   <p class="sr-only">Используйте стрелки для перемещения между днями; Enter или пробел, чтобы выбрать день.</p>
   <div class="activity-chart-footer"><UPopover><UButton label="Как считается" icon="i-lucide-info" color="neutral" variant="link" size="xs"/><template #content><div class="activity-help"><strong>Что считается действием</strong><p>Одно сохранение задачи, добавление или удаление файла — одно действие. Изменения общей задачи учитываются один раз, даже если она находится в нескольких хранилищах.</p><p>Одно действие может относиться к нескольким типам.</p><p>Показана только доступная вам история. Очищенные записи не учитываются. Время — московское.</p></div></template></UPopover><div class="activity-legend" :aria-label="`Цветовая гамма ${brand==='light'?'Light':'Magnat'}`"><span>Меньше</span><i v-for="(color,index) in colors" :key="color" :style="{background:color}" :title="['Нет действий','1–2 действия','3–5 действий','6–9 действий','10 и более действий'][index]"/><span>Больше</span></div></div>
   <div v-if="selected" class="activity-day-details"><div><h3>{{dateLabel(selected)}}</h3><span>{{value(selected)}} {{kind==='all'?'действий':activityLabels[kind].toLowerCase()}}</span></div><div v-if="dayBreakdown.length" class="activity-breakdown"><span v-for="item in dayBreakdown" :key="item.type" :class="{'is-highlighted':kind===item.type}">{{item.label}} <strong>{{item.count}}</strong></span></div><p v-else>За этот день действий не найдено.</p></div>
  </template>
  <footer class="activity-privacy">Учитываются действия из доступной вам истории задач. Очищенная история не входит в календарь. Даты — по Москве.</footer>
 </section>
</template>
<style scoped>
.profile-activity{margin-top:28px;padding:26px;border:1px solid #e2e8f0;border-radius:20px;background:#fff;min-width:0}.activity-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.activity-heading h2{font-size:18px;font-weight:650;color:#475569}.activity-heading p{font-size:12px;color:#94a3b8;margin-top:5px}.activity-year{display:flex;align-items:center;gap:4px}.activity-filters{display:flex;gap:12px;margin:22px 0}.activity-filters>.flex-1{min-width:0}.activity-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:22px 0}.activity-stats>div{padding:14px 16px;background:#f8fafc;border:1px solid #edf1f6;border-radius:12px}.activity-stats strong{font-size:24px;font-weight:650;color:var(--activity-accent);display:block}.activity-stats span{display:block;font-size:11px;color:#8291a6;margin-top:5px;line-height:1.5}.activity-scroll{overflow-x:auto;padding:4px 2px 8px;scrollbar-width:thin}.activity-chart{min-width:calc(var(--weeks)*16px + 28px)}.activity-months{display:grid;grid-template-columns:repeat(var(--weeks),minmax(0,1fr));gap:4px;margin-left:32px;margin-bottom:10px;font-size:10px;color:#8291a6}.activity-months>span{white-space:nowrap}.activity-chart-body{display:flex;gap:8px}.activity-weekdays{width:24px;flex-shrink:0;display:grid;grid-template-rows:repeat(7,1fr);font-size:10px;color:#94a3b8}.activity-weekdays>span{display:flex;align-items:center}.activity-cells{flex:1;min-width:0;display:grid;grid-template-columns:repeat(var(--weeks),minmax(0,1fr));gap:4px}.activity-day,.activity-padding{width:100%;aspect-ratio:1;border-radius:3px}.activity-day{padding:0;border:1px solid #1723320b;transition:box-shadow .15s}.activity-day:hover{box-shadow:0 0 0 1px var(--activity-accent)}.activity-day.is-selected,.activity-day:focus-visible{outline:2px solid var(--activity-accent);outline-offset:1px}.activity-day.is-future{opacity:.4;cursor:default}.activity-chart-footer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:12px;flex-wrap:wrap}.activity-legend{display:flex;align-items:center;gap:5px;font-size:10px;color:#8291a6}.activity-legend i{display:block;width:12px;height:12px;border-radius:3px;border:1px solid #1723320b}.activity-help{max-width:min(340px,calc(100vw - 36px));padding:18px;font-size:12px;line-height:1.8;color:#64748b}.activity-help strong{display:block;color:#475569;margin-bottom:8px}.activity-help p+p{margin-top:8px}.activity-day-details{margin-top:22px;border-top:1px solid #edf1f6;padding-top:18px}.activity-day-details>div:first-child{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap}.activity-day-details h3{font-size:13px;font-weight:650;color:#475569}.activity-day-details>div:first-child>span{font-size:12px;color:#8291a6}.activity-breakdown{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}.activity-breakdown>span{font-size:11px;color:#64748b;padding:6px 10px;background:#f8fafc;border:1px solid #edf1f6;border-radius:8px}.activity-breakdown strong{color:var(--activity-accent);margin-left:6px}.activity-breakdown .is-highlighted{border-color:var(--activity-accent)}.activity-day-details>p{font-size:12px;color:#94a3b8;margin-top:12px}.activity-privacy{font-size:10px;line-height:1.8;color:#94a3b8;margin-top:20px}.activity-loading{padding:30px;text-align:center;font-size:13px;color:#94a3b8}@media(max-width:767px){.profile-activity{padding:18px}.activity-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.activity-filters{flex-direction:column}.activity-heading{align-items:flex-start}.activity-heading h2{font-size:16px}}@media(prefers-reduced-motion:reduce){.activity-day{transition:none}}
</style>
