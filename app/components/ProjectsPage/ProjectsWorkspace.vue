<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import UserPicker from '../UserPicker.vue'
import PersonAvatar from '../PersonAvatar.vue'
import ProjectEstimate from './ProjectEstimate.vue'
import ProjectInputData from './ProjectInputData.vue'
import ProjectContracts from './ProjectContracts.vue'
import ProjectExecution from './ProjectExecution.vue'
import ProjectClosing from './ProjectClosing.vue'
import ProjectProcessMap from './ProjectProcessMap.vue'
import ProjectOverviewMetrics from './ProjectOverviewMetrics.vue'
import ProjectCounterparties from './ProjectCounterparties.vue'
import ProjectCompanyDirectory from './ProjectCompanyDirectory.vue'
import ProjectTemplateDirectory from './ProjectTemplateDirectory.vue'
import { timelineLabel,type TrackedStage } from '~~/shared/utils/project-timeline'
import type { Project, ProjectPermission } from '~~/shared/types/projects'
import type { TeamPerson } from '~~/shared/types/team'

const props = defineProps<{ projectId?: string; section?: 'input-documents' | 'estimate' | 'contracts' | 'execution' | 'closing' | 'relationships' }>()
const projectStages = [
  { key: 'input-documents', number: '01', label: 'Входные данные', icon: 'i-lucide-file-input', description: 'Информация о проекте, данные заказчика и вложения.' },
  { key: 'estimate', number: '02', label: 'Смета', icon: 'i-lucide-calculator', description: 'Здесь будет подготовлена смета проекта: состав работ и их стоимость.' },
  { key: 'contracts', number: '03', label: 'Договора', icon: 'i-lucide-file-signature', description: 'Реестр договоров проекта с суммами из сметы.' },
  { key: 'execution', number: '04', label: 'Исполнение', icon: 'i-lucide-files', description: 'Документы, приложения и предоплата по договорам проекта.' },
  { key: 'closing', number: '05', label: 'Подтверждение и закрывающие акты', icon: 'i-lucide-clipboard-check', description: 'Акты, УПД и подтверждение исполнения договоров.' }
] as const
const route = useRoute()
const directoryTab = computed(() => ['counterparties','legal-entities','document-templates'].includes(String(route.query.tab)) ? String(route.query.tab) : 'projects')
const directoryTitle = computed(() => directoryTab.value === 'document-templates' ? 'Шаблоны документов' : directoryTab.value === 'counterparties' ? 'Контрагенты' : directoryTab.value === 'legal-entities' ? 'Наши Юр. лица' : 'Проекты')
const activeStage = computed(() => projectStages.find(stage => stage.key === props.section))
const isProcessPage = computed(() => props.section === 'relationships')
const auth = useAuthStore(), access = useProjectAccess(), client = useQueryClient()
const projects = useQuery({
  queryKey: computed(() => ['account', auth.user?.id, 'projects']),
  queryFn: ({ signal }) => sharedRequest<Project[]>('/api/projects', { signal }),
  enabled: computed(() => access.data.value?.allowed === true),
  refetchInterval: 30_000,
  retry: false
})
const createOpen = ref(false), name = ref(''), busy = ref(false), error = ref('')
const currentProject = computed(() => projects.data.value?.find(project => project.id === props.projectId))
const timeline=useProjectTimeline(()=>props.projectId,()=>!!currentProject.value&&!props.section)
const stageProgress=(key:string)=>timeline.data.value?.stages[key as TrackedStage]
const dueLabel=(date:string)=>date?date.split('-').reverse().join('.'):'Без срока'
const selectedId = ref(''), selected = computed(() => projects.data.value?.find(project => project.id === selectedId.value))
const detailsOpen = computed({ get: () => !!selectedId.value, set: (open: boolean) => { if (!open) selectedId.value = '' } })
const person = ref<TeamPerson | null>(null), permission = ref<ProjectPermission>('viewer'), editName = ref('')
const permissionOptions = [{ label: 'Просмотр', value: 'viewer' }, { label: 'Редактирование', value: 'editor' }, { label: 'Не показывать', value: 'hidden' }]
const labels = { owner: 'Создатель', viewer: 'Просмотр', editor: 'Редактирование', hidden: 'Не показывать' }
watch(selected, project => { editName.value = project?.name ?? '' })
watch(() => props.projectId, () => { selectedId.value = ''; createOpen.value = false; error.value = '' })
const projectDate = (value: string) => new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'Europe/Moscow' }).format(new Date(value))
watch(selectedId, () => { person.value = null; permission.value = 'viewer'; error.value = '' })
watch(() => access.data.value?.allowed, allowed => { if (!allowed) { selectedId.value = ''; createOpen.value = false } })
watch(() => projects.error.value, failure => { if ((failure as any)?.statusCode === 403) access.refetch() })
async function refresh() { await Promise.all([access.refetch(), projects.refetch()]) }
async function mutate(action: () => Promise<unknown>, success?: () => void) {
  if (busy.value) return
  const userId = auth.user?.id
  busy.value = true; error.value = ''
  try {
    await action()
    if (auth.user?.id !== userId) return
    await client.invalidateQueries({ queryKey: ['account', userId, 'projects'] })
    success?.()
  } catch (failure: any) {
    if (auth.user?.id !== userId) return
    error.value = failure?.data?.message || 'Не удалось сохранить проект'
    if (failure?.statusCode === 403) await access.refetch()
    if ([404, 409].includes(failure?.statusCode)) await projects.refetch()
  } finally { busy.value = false }
}
function create() {
  if (!name.value.trim()) return
  let id = ''
  mutate(async () => { const result = await sharedRequest<{ id: string }>('/api/projects', { method: 'POST', body: { name: name.value.trim() } }); id = result.id }, () => { createOpen.value = false; name.value = ''; navigateTo(`/projects/${id}`) })
}
function rename() {
  const project = selected.value
  if (!project || !editName.value.trim()) return
  mutate(() => sharedRequest(`/api/projects/${project.id}`, { method: 'PUT', body: { name: editName.value.trim(), revision: project.revision } }))
}
function setMember(userId: string, next: ProjectPermission) {
  const project = selected.value
  if (!project) return
  mutate(() => sharedRequest(`/api/projects/${project.id}/members`, { method: 'PUT', body: { userId, permission: next, revision: project.revision } }), () => { person.value = null })
}
function removeMember(userId: string) {
  const project = selected.value
  if (project) mutate(() => sharedRequest(`/api/projects/${project.id}/members`, { method: 'DELETE', body: { userId, revision: project.revision } }))
}
function open(project: Project) { selectedId.value = project.id; editName.value = project.name }
function showCreate() { name.value = ''; error.value = ''; createOpen.value = true }
</script>

<template>
  <section class="projects-workspace">
    <NuxtLink v-if="projectId" :to="section?`/projects/${projectId}`:'/projects'" class="project-list-back"><UIcon name="i-lucide-arrow-left"/>{{ section?'К проекту':'Все проекты' }}</NuxtLink>
    <div v-if="!projectId" class="projects-heading"><div><span class="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span><h1>{{ directoryTitle }}<span class="title-dot">.</span></h1><p>{{ directoryTab === 'projects' ? 'Ваши проекты и люди, с которыми вы работаете.' : directoryTab === 'document-templates' ? 'Общее хранилище шаблонов по этапам проектов.' : 'Общая база компаний для ваших проектов.' }}</p></div><UButton v-if="access.data.value?.allowed && directoryTab === 'projects'" label="Создать проект" icon="i-lucide-plus" size="lg" @click="showCreate" /></div>
    <p v-if="access.isPending.value" class="projects-state"><UIcon name="i-lucide-loader-circle" class="animate-spin" /> Проверяем доступ…</p>
    <UAlert v-else-if="access.error.value" color="error" title="Не удалось проверить доступ" :actions="[{ label: 'Повторить', onClick: () => access.refetch() }]" />
    <UAlert v-else-if="!access.data.value?.allowed" color="neutral" title="Доступ к проектам закрыт" description="Администратор может выдать доступ через панель управления." />
    <template v-else>
      <nav v-if="!projectId" class="projects-directory-tabs" aria-label="Разделы проектов"><NuxtLink to="/projects" :aria-current="directoryTab === 'projects' ? 'page' : undefined">Проекты</NuxtLink><NuxtLink to="/projects?tab=counterparties" :aria-current="directoryTab === 'counterparties' ? 'page' : undefined">Контрагенты</NuxtLink><NuxtLink to="/projects?tab=legal-entities" :aria-current="directoryTab === 'legal-entities' ? 'page' : undefined">Наши Юр. лица</NuxtLink><NuxtLink to="/projects?tab=document-templates" :aria-current="directoryTab === 'document-templates' ? 'page' : undefined">Шаблоны документов</NuxtLink></nav>
      <ProjectTemplateDirectory v-if="!projectId && directoryTab === 'document-templates'"/>
      <ProjectCompanyDirectory v-else-if="!projectId && directoryTab !== 'projects'" :key="directoryTab" :own-only="directoryTab === 'legal-entities'"/>
      <template v-else><UAlert v-if="projects.error.value" color="error" title="Не удалось загрузить проекты" :actions="[{ label: 'Повторить', onClick: refresh }]" class="mb-5" />
      <p v-if="projects.isPending.value" class="projects-state">Загружаем проекты…</p>
      <template v-else-if="projectId">
        <template v-if="currentProject">
          <header class="projects-heading project-page-heading"><div><span class="eyebrow">{{ activeStage?`ЭТАП ${activeStage.number}`:'ПРОЕКТ' }}</span><h1>{{ isProcessPage?'Взаимосвязь':activeStage?activeStage.label:currentProject.name }}<span class="title-dot">.</span></h1><p>{{ section?currentProject.name:'Рабочее пространство проекта и его участники.' }}</p></div><UButton color="neutral" variant="outline" icon="i-lucide-settings" label="Настройки проекта" @click="open(currentProject)"/></header>
          <ProjectInputData v-if="section === 'input-documents'" :key="currentProject.id" :project="currentProject"/>
          <ProjectEstimate v-else-if="section === 'estimate'" :key="currentProject.id" :project="currentProject" />
          <ProjectContracts v-else-if="section === 'contracts'" :key="currentProject.id" :project="currentProject"/>
          <ProjectExecution v-else-if="section === 'execution'" :key="currentProject.id" :project="currentProject"/>
          <ProjectClosing v-else-if="section === 'closing'" :key="currentProject.id" :project="currentProject"/>
          <ProjectProcessMap v-else-if="isProcessPage" :key="currentProject.id+'-process'" :project="currentProject"/>
          <section v-else-if="activeStage" class="project-documents-empty" :aria-label="`${activeStage.label} проекта`"><span class="project-documents-icon"><UIcon :name="activeStage.icon"/></span><h2>{{ activeStage.label }} проекта</h2><p>{{ activeStage.description }}</p><NuxtLink :to="`/projects/${currentProject.id}`" class="subscription-card-link">Вернуться к проекту →</NuxtLink></section>
          <template v-else>
          <div class="project-overview" aria-label="Информация о проекте"><div><UIcon name="i-lucide-user-round-check"/><small>Ваши права</small><strong>{{ labels[currentProject.permission] }}</strong></div><div><UIcon name="i-lucide-users-round"/><small>Участников</small><strong>{{ currentProject.members.length }}</strong></div><div><UIcon name="i-lucide-calendar-days"/><small>Создан</small><strong>{{ projectDate(currentProject.createdAt) }}</strong></div><div><UIcon name="i-lucide-clock-3"/><small>Обновлён</small><strong>{{ projectDate(currentProject.updatedAt) }}</strong></div></div>
          <ProjectOverviewMetrics :key="currentProject.id+'-metrics'" :project-id="currentProject.id"/>
          <section class="project-business-stages" aria-label="Бизнес-этапы проекта"><div class="project-page-section-heading"><h2>Этапы проекта</h2></div><ol class="project-stages-grid project-stages-sequence"><li v-for="stage in projectStages" :key="stage.key"><NuxtLink :to="`/projects/${currentProject.id}/${stage.key}`" class="password-glass password-launch-card project-stage-link" :class="`timeline-${stageProgress(stage.key)?.status??'pending'}`" :aria-label="`${stage.label} проекта: ${currentProject.name}`"><span class="project-stage-icon"><UIcon :name="stage.icon"/></span><span class="project-stage-copy"><small>Этап {{ stage.number }}</small><strong>{{ stage.label }}</strong><small v-if="stageProgress(stage.key)?.total" class="project-stage-status timeline-status">{{timelineLabel(stageProgress(stage.key)!)}}</small></span><UIcon name="i-lucide-arrow-up-right" class="project-stage-arrow"/></NuxtLink></li></ol></section>
          <NuxtLink :to="`/projects/${currentProject.id}/relationships`" class="password-glass project-process-entry"><span class="project-stage-icon"><UIcon name="i-lucide-workflow"/></span><span><strong>Взаимосвязь</strong><small>Карта участников, документов и действий от начала проекта до закрытия.</small></span><UIcon name="i-lucide-arrow-up-right"/></NuxtLink>
          <UAlert v-if="timeline.error.value" color="error" title="Не удалось загрузить сроки проекта" :actions="[{label:'Повторить',onClick:()=>timeline.refetch()}]" class="mb-5"/>
          <section v-if="timeline.data.value?.contracts.length" class="project-timeline" aria-label="Сроки и подтверждения договоров"><div class="project-page-section-heading"><h2>Сроки и подтверждения договоров</h2></div><div class="project-timeline-grid"><template v-for="c in timeline.data.value.contracts" :key="c.id"><NuxtLink :to="`/projects/${currentProject.id}/closing?contract=${c.id}`" class="project-timeline-card" :class="[`timeline-${c.status}`,{'customer-timeline-card':c.source==='revenue'}]"><span v-if="c.source==='revenue'" class="project-timeline-customer">Заказчик</span><strong>Договор № {{c.number}}</strong><span>{{c.seller}} → {{c.buyer}}</span><b class="timeline-status">{{timelineLabel(c)}}</b><small>{{c.nextDue?'Ближайший срок: '+dueLabel(c.nextDue):c.status==='complete'?'Все этапы подтверждены':'Нет сроков для открытых пунктов'}}</small><span class="project-timeline-link">Открыть подтверждения →</span></NuxtLink><hr v-if="c.source==='revenue'" class="project-customer-divider" aria-label="Поставщики"/></template></div></section>
          <ProjectCounterparties :key="currentProject.id+'-counterparties'" :project="currentProject"/>
          <ProjectCounterparties :key="currentProject.id+'-legal-entities'" :project="currentProject" own-only/>
          <section class="project-page-members" aria-label="Участники проекта"><div class="project-page-section-heading"><h2>Участники проекта</h2><span>{{ currentProject.members.length }}</span></div><div class="project-members"><div v-for="member in currentProject.members" :key="member.userId" class="project-member"><PersonAvatar :name="member.fullName || member.email"/><div class="project-member-person"><NuxtLink :to="`/team/${member.userId}`" class="project-member-profile">{{ member.fullName || member.email }}</NuxtLink><small>{{ member.email }}</small><small v-if="!member.hasAccess">Доступ к разделу отозван администратором</small></div><span class="project-member-role">{{ labels[member.permission] }}</span></div></div></section>
          </template>
        </template>
        <div v-else-if="!projects.error.value" class="projects-empty"><UIcon name="i-lucide-folder-lock"/><h1>Проект недоступен</h1><p>Проверьте ссылку или попросите создателя проекта предоставить доступ.</p><UButton to="/projects" label="Все проекты" color="neutral" variant="outline"/></div>
      </template>
      <div v-else-if="projects.data.value?.length" class="projects-grid">
        <article v-for="project in projects.data.value" :key="project.id" class="project-tile project-tile-with-settings"><NuxtLink :to="`/projects/${project.id}`" class="project-tile-link" :aria-label="`Открыть проект: ${project.name}`"><span class="project-tile-icon"><UIcon name="i-lucide-folder-kanban" /></span><span class="project-tile-role">{{ labels[project.permission] }}</span><h2>{{ project.name }}</h2><span class="project-tile-footer"><span><UIcon name="i-lucide-users-round" />{{ project.members.length }} участн.</span><UIcon name="i-lucide-arrow-up-right" /></span></NuxtLink><UButton class="project-tile-settings" icon="i-lucide-settings" color="neutral" variant="ghost" :aria-label="`Настройки проекта: ${project.name}`" title="Настройки проекта" @click="open(project)"/></article>
      </div>
      <div v-else-if="!projects.error.value" class="projects-empty"><UIcon name="i-lucide-folder-plus" /><h2>Первый проект начинается здесь</h2><p>Создайте проект, добавьте участников и настройте их права.</p><UButton label="Создать проект" icon="i-lucide-plus" @click="showCreate" /></div>
      </template>
    </template>
    <UModal v-model:open="createOpen" title="Создать проект" description="Участников и их права можно добавить после создания." :dismissible="!busy">
      <template #body><form class="space-y-5" @submit.prevent="create"><UFormField label="Название проекта" required><UInput v-model="name" class="w-full" placeholder="Например, Обновление сайта" :maxlength="120" required :disabled="busy" /></UFormField><UAlert v-if="error" color="error" :description="error" /><UButton type="submit" label="Создать проект" :loading="busy" :disabled="!name.trim()" /></form></template>
    </UModal>
    <UModal v-model:open="detailsOpen" :title="selected ? 'Настройки проекта' : 'Проект недоступен'" :description="selected ? `${selected.name} · Участники и права доступа.` : 'Проект больше недоступен.'" :dismissible="!busy" :ui="{ content: 'sm:max-w-2xl' }">
      <template #body>
        <template v-if="selected">
          <form v-if="selected.permission !== 'viewer'" class="project-rename" @submit.prevent="rename"><UFormField label="Название проекта" class="min-w-0 flex-1"><UInput v-model="editName" class="w-full" required :maxlength="120" :disabled="busy" /></UFormField><UButton type="submit" label="Сохранить" color="neutral" variant="outline" :loading="busy" :disabled="!editName.trim() || editName.trim() === selected.name" /></form>
          <UAlert v-if="error" color="error" :description="error" class="mb-4" />
          <h2 class="font-semibold text-sm">Участники</h2>
          <div class="project-members"><div v-for="member in selected.members" :key="member.userId" class="project-member"><PersonAvatar :name="member.fullName || member.email" /><div class="project-member-person"><NuxtLink :to="`/team/${member.userId}`" class="project-member-profile">{{ member.fullName || member.email }}</NuxtLink><small>{{ member.email }}</small><small v-if="!member.hasAccess">Доступ к разделу отозван администратором</small></div><template v-if="selected.permission === 'owner' && member.permission !== 'owner'"><USelect :model-value="member.permission" :items="permissionOptions" :disabled="busy" :aria-label="`Права: ${member.fullName || member.email}`" @update:model-value="value => setMember(member.userId, value as ProjectPermission)" /><UButton icon="i-lucide-x" color="neutral" variant="ghost" :aria-label="`Убрать участника ${member.fullName || member.email}`" :disabled="busy" @click="removeMember(member.userId)" /></template><span v-else class="project-member-role">{{ labels[member.permission] }}</span></div></div>
          <form v-if="selected.permission === 'owner'" class="project-invite" @submit.prevent="person && setMember(person.id, permission)"><h3>Добавить участника</h3><p>В поиске — пользователи, которым администратор выдал доступ к «Проектам».</p><UserPicker v-model="person" projects :disabled="busy" /><div class="project-invite-actions"><USelect v-model="permission" :items="permissionOptions" :disabled="busy" aria-label="Права нового участника" /><UButton type="submit" label="Добавить" icon="i-lucide-user-plus" :loading="busy" :disabled="!person || selected.members.some(member => member.userId === person?.id)" /></div><p>«Не показывать» скрывает проект от участника и закрывает доступ. Права можно вернуть в любой момент.</p></form>
        </template>
        <UAlert v-else color="neutral" title="Проект больше недоступен" />
      </template>
    </UModal>
  </section>
</template>

<style scoped>
.project-process-entry{display:flex;align-items:center;gap:20px;margin:30px 0;padding:26px 30px;border-radius:24px;border:1px solid #dfe6ef}.project-process-entry>span:nth-child(2){flex:1;min-width:0;display:grid;gap:8px}.project-process-entry strong{font-size:22px;color:#334155}.project-process-entry small{font-size:13px;line-height:1.6;color:#8292a8}.project-process-entry>.iconify{flex-shrink:0;color:#94a3b8}@media(max-width:600px){.project-process-entry{padding:20px;gap:14px}.project-process-entry strong{font-size:19px}}
.projects-directory-tabs{display:flex;gap:6px;flex-wrap:wrap;padding:6px;background:#edf0f5;border:1px solid #e2e8f0;border-radius:16px;width:fit-content;max-width:100%;margin:0 0 28px}.projects-directory-tabs a{padding:12px 20px;color:#8292a8;font-size:14px;font-weight:600;border-radius:11px}.projects-directory-tabs a[aria-current=page]{background:white;color:#334155;box-shadow:0 2px 8px #0f172a08}@media(max-width:600px){.projects-directory-tabs{width:100%}.projects-directory-tabs a{flex:1;white-space:nowrap;text-align:center;padding:12px 9px;font-size:12px}}
.project-timeline{margin:32px 0}.project-timeline-legend{display:flex;gap:20px;flex-wrap:wrap;color:#8292a8;font-size:12px;margin:12px 0 20px}.project-timeline-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:20px}.project-timeline-card{display:flex;flex-direction:column;gap:10px;padding:24px;border:1px solid #dce2ea;border-radius:20px;background:white;font-size:13px;color:#8292a8}.project-timeline-card>strong{font-size:17px;color:#334155}.project-timeline-card>b{font-size:13px}.project-timeline-customer{width:fit-content;padding:5px 8px;background:#f1f0f6;color:#475569;border-radius:7px;font-size:11px}.customer-timeline-card{grid-column:1/-1;max-width:560px;width:100%}.project-customer-divider{grid-column:1/-1;border:0;border-top:1px solid #cbd5e1;margin:2px 0;width:100%}.project-timeline-link{margin-top:auto;padding-top:8px;color:var(--ui-primary)}.project-stage-copy>small.project-stage-status{letter-spacing:0;font-size:11px;line-height:1.5}
</style>
