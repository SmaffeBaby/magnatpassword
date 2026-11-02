<script setup lang="ts">
import PersonAvatar from '../PersonAvatar.vue'
import ProjectOverviewMetrics from './ProjectOverviewMetrics.vue'
import ProjectCounterparties from './ProjectCounterparties.vue'
import { projectStages, dashboardBlocks } from '~~/shared/utils/project-dashboard'
import { timelineLabel, type TrackedStage } from '~~/shared/utils/project-timeline'
import type { Project } from '~~/shared/types/projects'

const props = defineProps<{ project: Project }>()
const { query, blocks } = useProjectDashboard(() => props.project.id)
const visibleBlocks = computed(() => blocks.value.filter(block => block.visible))
const timeline = useProjectTimeline(() => props.project.id)
const stageProgress = (key: string) => timeline.data.value?.stages[key as TrackedStage]
const dueLabel = (date: string) => date ? date.split('-').reverse().join('.') : 'Без срока'
const labels = { owner: 'Создатель', viewer: 'Просмотр', editor: 'Редактирование', hidden: 'Не показывать' }
const projectDate = (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'Europe/Moscow' }).format(new Date(value))
</script>

<template>
  <UAlert v-if="query.error.value" color="error" title="Не удалось загрузить ваш вид страницы" description="Показываем все блоки. Повторите загрузку, чтобы применить личные настройки." :actions="[{ label: 'Повторить', onClick: () => query.refetch() }]" class="mb-5" />
  <div v-if="query.isPending.value" class="dashboard-loading" role="status"><UIcon name="i-lucide-loader-circle" class="animate-spin"/>Загружаем ваш вид страницы…</div>
  <div v-else-if="visibleBlocks.length" class="project-dashboard">
    <section v-for="block in visibleBlocks" :key="block.key" class="dashboard-block" :data-dashboard-block="block.key" :aria-label="dashboardBlocks.find(item => item.key === block.key)?.label">
        <div v-if="block.key === 'info'" class="project-overview" aria-label="Информация о проекте"><div><UIcon name="i-lucide-user-round-check"/><small>Ваши права</small><strong>{{ labels[project.permission] }}</strong></div><div><UIcon name="i-lucide-users-round"/><small>Участников</small><strong>{{ project.members.length }}</strong></div><div><UIcon name="i-lucide-calendar-days"/><small>Создан</small><strong>{{ projectDate(project.createdAt) }}</strong></div><div><UIcon name="i-lucide-clock-3"/><small>Обновлён</small><strong>{{ projectDate(project.updatedAt) }}</strong></div></div>
        <ProjectOverviewMetrics v-else-if="block.key === 'metrics'" :key="project.id+'-metrics'" :project-id="project.id"/>
        <section v-else-if="block.key === 'stages'" class="project-business-stages" aria-label="Бизнес-этапы проекта"><div class="project-page-section-heading"><h2>Этапы проекта</h2></div><ol class="project-stages-grid project-stages-sequence"><li v-for="stage in projectStages" :key="stage.key"><NuxtLink :to="`/projects/${project.id}/${stage.key}`" class="password-glass password-launch-card project-stage-link" :class="`timeline-${stageProgress(stage.key)?.status??'pending'}`" :aria-label="`${stage.label} проекта: ${project.name}`"><span class="project-stage-icon"><UIcon :name="stage.icon"/></span><span class="project-stage-copy"><small>Этап {{ stage.number }}</small><strong>{{ stage.label }}</strong><small v-if="stageProgress(stage.key)?.total" class="project-stage-status timeline-status">{{timelineLabel(stageProgress(stage.key)!)}}</small></span><UIcon name="i-lucide-arrow-up-right" class="project-stage-arrow"/></NuxtLink></li></ol></section>
        <NuxtLink v-else-if="block.key === 'relationships'" :to="`/projects/${project.id}/relationships`" class="password-glass project-process-entry"><span class="project-stage-icon"><UIcon name="i-lucide-workflow"/></span><span><strong>Взаимосвязь</strong><small>Карта участников, документов и действий от начала проекта до закрытия.</small></span><UIcon name="i-lucide-arrow-up-right"/></NuxtLink>
        <template v-else-if="block.key === 'timeline'">
          <UAlert v-if="timeline.error.value" color="error" title="Не удалось загрузить сроки проекта" :actions="[{label:'Повторить',onClick:()=>timeline.refetch()}]" class="mb-5"/>
          <section v-if="timeline.data.value?.contracts.length" class="project-timeline" aria-label="Сроки и подтверждения договоров"><div class="project-page-section-heading"><h2>Сроки и подтверждения договоров</h2></div><div class="project-timeline-grid"><template v-for="c in timeline.data.value.contracts" :key="c.id"><NuxtLink :to="`/projects/${project.id}/closing?contract=${c.id}`" class="project-timeline-card" :class="[`timeline-${c.status}`,{'customer-timeline-card':c.source==='revenue'}]"><span v-if="c.source==='revenue'" class="project-timeline-customer">Заказчик</span><strong>Договор № {{c.number}}</strong><span>{{c.seller}} → {{c.buyer}}</span><b class="timeline-status">{{timelineLabel(c)}}</b><small>{{c.nextDue?'Ближайший срок: '+dueLabel(c.nextDue):c.status==='complete'?'Все этапы подтверждены':'Нет сроков для открытых пунктов'}}</small><span class="project-timeline-link">Открыть подтверждения →</span></NuxtLink><hr v-if="c.source==='revenue'" class="project-customer-divider" aria-label="Поставщики"/></template></div></section>
          <p v-else-if="!timeline.error.value" class="dashboard-empty-hint">{{ timeline.isPending.value ? 'Загружаем сроки…' : 'Сроки появятся после добавления договоров.' }}</p>
        </template>
        <ProjectCounterparties v-else-if="block.key === 'counterparties'" :key="project.id+'-counterparties'" :project="project"/>
        <ProjectCounterparties v-else-if="block.key === 'legal-entities'" :key="project.id+'-legal-entities'" :project="project" own-only/>
        <section v-else-if="block.key === 'members'" class="project-page-members" aria-label="Участники проекта"><div class="project-page-section-heading"><h2>Участники проекта</h2><span>{{ project.members.length }}</span></div><div class="project-members"><div v-for="member in project.members" :key="member.userId" class="project-member"><PersonAvatar :name="member.fullName || member.email"/><div class="project-member-person"><NuxtLink :to="`/team/${member.userId}`" class="project-member-profile">{{ member.fullName || member.email }}</NuxtLink><small>{{ member.email }}</small><small v-if="!member.hasAccess">Доступ к разделу отозван администратором</small></div><span class="project-member-role">{{ labels[member.permission] }}</span></div></div></section>
    </section>
  </div>
  <div v-else class="dashboard-empty"><UIcon name="i-lucide-layout-dashboard"/><h2>На странице пока нет блоков</h2><p>Нажмите «Настроить вид», чтобы выбрать нужную информацию.<br>Все разделы проекта доступны в боковом меню.</p></div>
</template>

<style scoped>
.project-dashboard{display:grid;gap:28px}.dashboard-block{min-width:0;container-type:inline-size}.dashboard-block>:deep(*){margin-top:0;margin-bottom:0}.dashboard-loading{display:flex;align-items:center;justify-content:center;gap:10px;min-height:220px;color:#8292a8;font-size:14px}.dashboard-empty{display:grid;justify-items:center;gap:14px;padding:70px 24px;border:1px dashed #dce2ea;border-radius:22px;text-align:center}.dashboard-empty>.iconify{font-size:32px;color:#94a3b8}.dashboard-empty h2{font-size:20px;font-weight:600;color:#475569}.dashboard-empty p,.dashboard-empty-hint{font-size:13px;line-height:1.8;color:#8292a8}.dashboard-empty-hint{padding:24px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff80}

.project-process-entry{display:flex;align-items:center;gap:20px;margin:30px 0;padding:26px 30px;border-radius:24px;border:1px solid #dfe6ef}.project-process-entry>span:nth-child(2){flex:1;min-width:0;display:grid;gap:8px}.project-process-entry strong{font-size:22px;color:#334155}.project-process-entry small{font-size:13px;line-height:1.6;color:#8292a8}.project-process-entry>.iconify{flex-shrink:0;color:#94a3b8}@media(max-width:600px){.project-process-entry{padding:20px;gap:14px}.project-process-entry strong{font-size:19px}}
.project-timeline{margin:32px 0}.project-timeline-legend{display:flex;gap:20px;flex-wrap:wrap;color:#8292a8;font-size:12px;margin:12px 0 20px}.project-timeline-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px}.project-timeline-card{display:flex;flex-direction:column;gap:10px;padding:24px;border:1px solid #dce2ea;border-radius:20px;background:white;font-size:13px;color:#8292a8}.project-timeline-card>strong{font-size:17px;color:#334155}.project-timeline-card>b{font-size:13px}.project-timeline-customer{width:fit-content;padding:5px 8px;background:#f1f0f6;color:#475569;border-radius:7px;font-size:11px}.customer-timeline-card{grid-column:1/-1;max-width:560px;width:100%}.project-customer-divider{grid-column:1/-1;border:0;border-top:1px solid #cbd5e1;margin:2px 0;width:100%}.project-timeline-link{margin-top:auto;padding-top:8px;color:var(--ui-primary)}.project-stage-copy>small.project-stage-status{letter-spacing:0;font-size:11px;line-height:1.5}
@container(max-width:880px){.project-stages-sequence{grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.project-stages-sequence>li,.project-stages-sequence>li:nth-child(4),.project-stages-sequence>li:nth-child(5){grid-column:auto}.project-stages-sequence>li::before,.project-stages-sequence>li::after{display:none}.project-stages-sequence .project-stage-link{padding:20px;gap:14px}.project-stage-copy>strong{font-size:20px}}
@container(max-width:560px){.project-stages-sequence{grid-template-columns:minmax(0,1fr)}}
</style>
