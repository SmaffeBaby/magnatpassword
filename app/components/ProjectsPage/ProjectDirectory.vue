<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import PersonAvatar from '../PersonAvatar.vue'
import type { Project, ProjectFinancialSummary } from '~~/shared/types/projects'
import { filterProjectDirectory, projectMembers, directoryUpdatedAt, type ProjectFilters } from '~~/shared/utils/project-directory'

const props = defineProps<{ projects: Project[] }>()
const emit = defineEmits<{ settings: [project: Project] }>()
const auth = useAuthStore()
const defaults = (): ProjectFilters => ({ search: '', permission: 'all', members: [], allMembers: false, finance: 'all', sort: 'updated' })
const filters = reactive(defaults())
const query = useQuery({
  queryKey: computed(() => ['account', auth.user?.id, 'project-summaries', props.projects.map(project => project.id).sort().join(',')]),
  queryFn: ({ signal }) => sharedRequest<ProjectFinancialSummary[]>('/api/projects/summaries', { signal }),
  enabled: computed(() => props.projects.length > 0), retry: false, refetchInterval: 30000, refetchOnMount: 'always'
})
const summaries = computed(() => new Map((query.data.value ?? []).map(summary => [summary.projectId, summary])))
const rows = computed(() => filterProjectDirectory(props.projects, summaries.value, filters))
const hasFilters = computed(() => !!filters.search.trim() || filters.permission !== 'all' || filters.members.length > 0 || filters.finance !== 'all')
const memberOptions = computed(() => {
  const people = new Map<string, { value: string; label: string; description: string }>()
  for (const project of props.projects) for (const member of projectMembers(project)) people.set(member.userId, { value: member.userId, label: member.fullName || member.email, description: member.email })
  return [...people.values()].sort((a, b) => a.label.localeCompare(b.label, 'ru'))
})
const totals = computed(() => {
  const result = { revenue: 0, cost: 0, profit: 0, ready: 0 }
  for (const project of rows.value) {
    const summary = summaries.value.get(project.id)
    if (summary?.status !== 'ready' || !summary.financials) continue
    result.revenue += summary.financials.revenue; result.cost += summary.financials.cost; result.profit += summary.financials.profit; result.ready++
  }
  return result
})
const labels = { owner: 'Создатель', editor: 'Редактирование', viewer: 'Просмотр' }
const permissionOptions = [{ value: 'all', label: 'Любые права' }, { value: 'owner', label: 'Я создатель' }, { value: 'editor', label: 'Я редактор' }, { value: 'viewer', label: 'Только просмотр' }]
const financeOptions = [{ value: 'all', label: 'Любая смета' }, { value: 'with-estimate', label: 'Со сметой' }, { value: 'without-estimate', label: 'Без сметы' }, { value: 'positive', label: 'С прибылью' }, { value: 'negative', label: 'С убытком' }]
const sortOptions = [{ value: 'updated', label: 'Сначала обновлённые' }, { value: 'created', label: 'Сначала новые' }, { value: 'name', label: 'По названию' }, { value: 'revenue', label: 'По выручке ↓' }, { value: 'cost', label: 'По затратам ↓' }, { value: 'profit', label: 'По прибыли ↓' }, { value: 'profit-asc', label: 'По прибыли ↑' }]
const money = (value: number) => value.toLocaleString('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 2 })
const date = (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'Europe/Moscow' }).format(new Date(value))
const creator = (project: Project) => project.members.find(member => member.userId === project.ownerId)
const summary = (project: Project) => summaries.value.get(project.id)
const ready = (project: Project) => summary(project)?.status === 'ready' && !!summary(project)?.financials
const partial = computed(() => query.data.value?.some(summary => summary.status === 'error'))
function reset() { Object.assign(filters, defaults()) }
watch(() => auth.user?.id, reset)
</script>

<template>
  <section class="project-directory" aria-label="Все проекты">
    <div class="directory-totals" aria-label="Показатели найденных проектов">
      <div><span><UIcon name="i-lucide-folder-kanban"/>Проектов</span><strong>{{ rows.length }}<small> / {{ projects.length }}</small></strong></div>
      <div><span><UIcon name="i-lucide-chart-no-axes-combined"/>Выручка со смет</span><strong>{{ query.isPending.value ? '…' : query.error.value && !query.data.value ? '—' : money(totals.revenue) }}</strong></div>
      <div><span><UIcon name="i-lucide-calculator"/>Затраты по сметам</span><strong>{{ query.isPending.value ? '…' : query.error.value && !query.data.value ? '—' : money(totals.cost) }}</strong></div>
      <div :class="{ 'is-negative': totals.profit < 0 }"><span><UIcon name="i-lucide-wallet"/>Прибыль без НДС</span><strong>{{ query.isPending.value ? '…' : query.error.value && !query.data.value ? '—' : money(totals.profit) }}</strong></div>
    </div>
    <div class="directory-controls">
      <UInput v-model="filters.search" icon="i-lucide-search" placeholder="Найти проект, участника или email" aria-label="Поиск проектов и участников" class="directory-search"/>
      <div class="directory-filters">
        <USelectMenu v-model="filters.members" :items="memberOptions" value-key="value" multiple :filter-fields="['label', 'description']" placeholder="Любые участники" aria-label="Участники проектов" class="directory-people"/>
        <USelect v-model="filters.permission" :items="permissionOptions" aria-label="Ваши права в проекте"/>
        <USelect v-model="filters.finance" :items="financeOptions" aria-label="Фильтр по смете и прибыли" :disabled="query.isPending.value || (!!query.error.value && !query.data.value)"/>
        <USelect v-model="filters.sort" :items="sortOptions" aria-label="Сортировка проектов"/>
      </div>
      <div v-if="filters.members.length > 1" class="directory-match"><UCheckbox v-model="filters.allMembers" label="В проекте должны быть все выбранные участники"/></div>
    </div>
    <div class="directory-results" role="status"><span>Найдено {{ rows.length }} из {{ projects.length }}<small v-if="!query.isPending.value && !query.error.value"> · Показатели по {{ totals.ready }} заполненным сметам</small></span><UButton v-if="hasFilters" label="Сбросить фильтры" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="reset"/></div>
    <UAlert v-if="query.error.value || partial" title="Часть финансовых показателей недоступна" description="Карточки проектов доступны. Повторите загрузку показателей." color="error" :actions="[{ label: 'Повторить', onClick: () => query.refetch() }]" class="mb-5"/>
    <div v-if="rows.length" class="glass-project-grid">
      <article v-for="project in rows" :key="project.id" class="glass-project-card">
        <NuxtLink :to="`/projects/${project.id}`" class="glass-project-link" :aria-label="`Открыть проект: ${project.name}`">
          <header><span class="glass-project-icon"><UIcon name="i-lucide-folder-kanban"/></span><span class="glass-project-role">{{ labels[project.permission] }}</span></header>
          <div class="glass-project-title"><h2>{{ project.name }}</h2><p v-if="summary(project)?.title && summary(project)?.title !== project.name">{{ summary(project)?.title }}</p><small v-if="creator(project)">Создатель: {{ creator(project)!.fullName || creator(project)!.email }}</small></div>
          <div v-if="ready(project)" class="glass-project-finances">
            <div><small>Выручка с НДС</small><strong>{{ money(summary(project)!.financials!.revenue) }}</strong></div><div><small>Затраты с НДС</small><strong>{{ money(summary(project)!.financials!.cost) }}</strong></div>
            <div class="glass-project-profit" :class="{ 'is-negative': summary(project)!.financials!.profit < 0 }"><span><small>Прибыль без НДС</small><strong>{{ money(summary(project)!.financials!.profit) }}</strong></span><span v-if="summary(project)!.financials!.profitability !== null" class="glass-project-margin">{{ (summary(project)!.financials!.profitability! * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) }}%<small>рентабельность</small></span></div>
          </div>
          <div v-else class="glass-project-no-estimate"><UIcon :name="query.isPending.value ? 'i-lucide-loader-circle' : summary(project)?.status === 'error' || query.error.value ? 'i-lucide-circle-alert' : 'i-lucide-calculator'" :class="{ 'animate-spin': query.isPending.value }"/><span>{{ query.isPending.value ? 'Загружаем показатели…' : summary(project)?.status === 'error' || query.error.value ? 'Показатели недоступны' : 'Смета ещё не заполнена' }}<small v-if="!query.isPending.value && !query.error.value && summary(project)?.status !== 'error'">Добавьте состав работ и стоимость в смету проекта.</small></span></div>
          <div v-if="summary(project)?.finishDate" class="glass-project-deadline"><UIcon name="i-lucide-calendar-check"/>Срок по смете: {{ date(summary(project)!.finishDate!) }}</div>
          <div class="glass-project-team"><div class="glass-project-avatars"><PersonAvatar v-for="member in projectMembers(project).slice(0, 3)" :key="member.userId" :name="member.fullName || member.email" :title="member.fullName || member.email"/></div><span>{{ projectMembers(project).length }} участн.<small>{{ projectMembers(project).slice(0, 2).map(member => member.fullName || member.email).join(', ') }}{{ projectMembers(project).length > 2 ? ' и другие' : '' }}</small></span><UIcon name="i-lucide-arrow-up-right"/></div>
          <footer><span>Создан {{ date(project.createdAt) }}</span><span>Обновлён {{ date(directoryUpdatedAt(project, summary(project))) }}</span></footer>
        </NuxtLink>
        <UButton class="glass-project-settings" icon="i-lucide-settings" color="neutral" variant="ghost" :aria-label="`Настройки проекта: ${project.name}`" @click="emit('settings', project)"/>
      </article>
    </div>
    <div v-else class="directory-empty"><UIcon name="i-lucide-search-x"/><h2>Проекты не найдены</h2><p>Измените запрос или сбросьте фильтры.</p><UButton label="Сбросить фильтры" color="neutral" variant="outline" @click="reset"/></div>
  </section>
</template>

<style scoped>
.project-directory{min-width:0}.directory-totals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:26px}.directory-totals>div{padding:22px;border:1px solid #ffffffed;border-radius:18px;background:linear-gradient(135deg,#ffffffc9,#ffffff59);box-shadow:0 6px 26px #33415506,inset 0 1px #fff;backdrop-filter:blur(18px)}.directory-totals>div>span{display:flex;align-items:center;gap:8px;font-size:11px;color:#8292a8}.directory-totals .iconify{font-size:17px;flex-shrink:0}.directory-totals strong{display:block;margin-top:14px;font-size:clamp(18px,1.7vw,25px);font-weight:650;color:#334155;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.directory-totals strong small{font-size:13px;color:#94a3b8;font-weight:400}.directory-totals>.is-negative strong{color:#be5561}.directory-controls{display:grid;gap:14px;padding:20px;border:1px solid #e2e8f0aa;border-radius:18px;background:#ffffff73}.directory-search{width:100%}.directory-filters{display:flex;flex-wrap:wrap;gap:12px}.directory-filters>*{flex:1;min-width:160px}.directory-filters>.directory-people{flex:1.5;min-width:220px}.directory-match{padding-top:2px}.directory-results{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:62px;font-size:12px;color:#8292a8}.directory-results small{font-size:11px}.glass-project-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:24px}.glass-project-card{position:relative;isolation:isolate;min-width:0;overflow:hidden;border:1px solid #ffffffef;border-radius:26px;background:linear-gradient(135deg,#ffffffde 0%,#ffffff80 55%,#eaf0f67d 100%);box-shadow:0 12px 38px #33415508,inset 0 1px 0 #fff,inset 0 -1px 0 #94a3b826;backdrop-filter:blur(24px) saturate(155%);transition:box-shadow .2s,border-color .2s,transform .2s}.glass-project-card::before{content:'';position:absolute;pointer-events:none;z-index:-1;width:260px;height:220px;right:-100px;top:-100px;border-radius:50%;background:radial-gradient(ellipse,color-mix(in srgb,var(--ui-primary) 9%,transparent),transparent 70%);filter:blur(22px)}.glass-project-card:hover{transform:translateY(-3px);box-shadow:0 18px 44px #33415513;border-color:#d8e1ed}.glass-project-link{display:flex;flex-direction:column;height:100%;padding:26px;min-width:0}.glass-project-link:focus-visible{outline-offset:-4px;border-radius:26px}.glass-project-link>header{display:flex;align-items:center;gap:12px;padding-right:38px}.glass-project-icon{display:grid;place-items:center;width:46px;height:46px;flex-shrink:0;border-radius:14px;border:1px solid #ffffffed;background:linear-gradient(135deg,#ffffffd9,#e8eaf28c);box-shadow:0 4px 14px #33415505,inset 0 1px #fff;color:var(--ui-primary);font-size:24px}.glass-project-role{margin-left:auto;padding:6px 9px;border-radius:8px;background:#ffffff80;border:1px solid #ffffffb3;font-size:10px;color:#8292a8}.glass-project-title{margin:22px 0;min-width:0}.glass-project-title h2{font-size:22px;font-weight:650;line-height:1.4;color:#334155;overflow-wrap:anywhere;letter-spacing:-.45px}.glass-project-title p{font-size:12px;line-height:1.7;color:#8292a8;margin-top:7px;overflow-wrap:anywhere}.glass-project-title>small{display:block;margin-top:9px;color:#94a3b8;font-size:11px;overflow-wrap:anywhere}.glass-project-finances{display:grid;grid-template-columns:1fr 1fr;gap:18px 14px;padding:20px;border:1px solid #ffffffcc;border-radius:17px;background:#ffffff59}.glass-project-finances small{display:block;color:#8292a8;font-size:10px;line-height:1.6}.glass-project-finances strong{display:block;font-size:19px;font-weight:650;color:#475569;margin-top:6px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.glass-project-profit{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:16px;border-top:1px solid #dce4ec99}.glass-project-profit strong{color:#397d71;font-size:24px}.glass-project-profit.is-negative strong,.glass-project-profit.is-negative .glass-project-margin{color:#be5561}.glass-project-margin{font-size:18px;font-weight:600;color:#548c80;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums}.glass-project-margin small{font-size:9px;font-weight:400}.glass-project-no-estimate{display:flex;align-items:center;gap:13px;min-height:170px;padding:22px;border:1px dashed #dce4ec;border-radius:17px;color:#8292a8;font-size:13px}.glass-project-no-estimate>.iconify{font-size:25px;flex-shrink:0}.glass-project-no-estimate small{display:block;margin-top:7px;font-size:11px;line-height:1.7;color:#94a3b8}.glass-project-deadline{display:flex;align-items:center;gap:7px;font-size:11px;color:#8292a8;margin-top:16px}.glass-project-team{display:flex;align-items:center;gap:11px;margin-top:auto;padding-top:24px}.glass-project-avatars{display:flex;flex-shrink:0;padding-left:0}.glass-project-avatars :deep(.person-avatar){width:30px;height:30px;font-size:10px;border:2px solid #f8fafc;margin-left:-7px}.glass-project-avatars :deep(.person-avatar:first-child){margin-left:0}.glass-project-team>span:not(.iconify){flex:1;min-width:0;font-size:12px;color:#64748b}.glass-project-team small{display:block;margin-top:4px;font-size:10px;color:#94a3b8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.glass-project-team>.iconify{font-size:18px;color:#94a3b8;flex-shrink:0}.glass-project-link>footer{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;border-top:1px solid #dce4ec80;margin-top:20px;padding-top:14px;font-size:9px;color:#94a3b8}.glass-project-settings{position:absolute;right:18px;top:27px;z-index:1;border-radius:10px}.directory-empty{display:grid;justify-items:center;gap:14px;text-align:center;border:1px dashed #dce4ec;border-radius:22px;padding:60px 24px;color:#8292a8}.directory-empty>.iconify{font-size:30px}.directory-empty h2{font-size:20px;font-weight:600;color:#475569}.directory-empty p{font-size:13px;margin-bottom:8px}@media(max-width:1200px){.directory-totals{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.directory-totals{gap:10px}.directory-totals>div{padding:16px 13px}.directory-totals strong{font-size:19px}.directory-controls{padding:14px}.directory-filters>*{min-width:100%;flex-basis:100%}.directory-filters>.directory-people{min-width:100%}.glass-project-link{padding:22px}.glass-project-title h2{font-size:21px}.glass-project-finances{padding:16px}.glass-project-finances strong{font-size:17px}.glass-project-profit strong{font-size:21px}.glass-project-settings{top:23px;right:14px}.directory-results{align-items:flex-start;padding:16px 0}.directory-results small{display:block;margin-top:5px}.glass-project-margin{font-size:16px}}@media(prefers-reduced-motion:reduce){.glass-project-card{transition:none}.glass-project-card:hover{transform:none}}
</style>
