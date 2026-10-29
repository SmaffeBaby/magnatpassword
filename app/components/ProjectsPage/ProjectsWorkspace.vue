<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import UserPicker from '../UserPicker.vue'
import PersonAvatar from '../PersonAvatar.vue'
import type { Project, ProjectPermission } from '~~/shared/types/projects'
import type { TeamPerson } from '~~/shared/types/team'

const props = defineProps<{ projectId?: string; section?: 'input-documents' | 'estimate' }>()
const projectStages = [
  { key: 'input-documents', number: '01', label: 'Входные документы', icon: 'i-lucide-file-input', description: 'Здесь будут собраны исходные документы и материалы, необходимые для начала работы над проектом.' },
  { key: 'estimate', number: '02', label: 'Смета', icon: 'i-lucide-calculator', description: 'Здесь будет подготовлена смета проекта: состав работ и их стоимость.' }
] as const
const activeStage = computed(() => projectStages.find(stage => stage.key === props.section))
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
    <NuxtLink v-if="projectId" :to="activeStage?`/projects/${projectId}`:'/projects'" class="project-list-back"><UIcon name="i-lucide-arrow-left"/>{{ activeStage?'К проекту':'Все проекты' }}</NuxtLink>
    <div v-if="!projectId" class="projects-heading"><div><span class="eyebrow">РАБОЧЕЕ ПРОСТРАНСТВО</span><h1>Проекты<span class="title-dot">.</span></h1><p>Ваши проекты и люди, с которыми вы работаете.</p></div><UButton v-if="access.data.value?.allowed" label="Создать проект" icon="i-lucide-plus" size="lg" @click="showCreate" /></div>
    <p v-if="access.isPending.value" class="projects-state"><UIcon name="i-lucide-loader-circle" class="animate-spin" /> Проверяем доступ…</p>
    <UAlert v-else-if="access.error.value" color="error" title="Не удалось проверить доступ" :actions="[{ label: 'Повторить', onClick: () => access.refetch() }]" />
    <UAlert v-else-if="!access.data.value?.allowed" color="neutral" title="Доступ к проектам закрыт" description="Администратор может выдать доступ через панель управления." />
    <template v-else>
      <UAlert v-if="projects.error.value" color="error" title="Не удалось загрузить проекты" :actions="[{ label: 'Повторить', onClick: refresh }]" class="mb-5" />
      <p v-if="projects.isPending.value" class="projects-state">Загружаем проекты…</p>
      <template v-else-if="projectId">
        <template v-if="currentProject">
          <header class="projects-heading project-page-heading"><div><span class="eyebrow">{{ activeStage?`ЭТАП ${activeStage.number}`:'ПРОЕКТ' }}</span><h1>{{ activeStage?activeStage.label:currentProject.name }}<span class="title-dot">.</span></h1><p>{{ activeStage?currentProject.name:'Рабочее пространство проекта и его участники.' }}</p></div><UButton color="neutral" variant="outline" icon="i-lucide-settings" label="Настройки проекта" @click="open(currentProject)"/></header>
          <section v-if="activeStage" class="project-documents-empty" :aria-label="`${activeStage.label} проекта`"><span class="project-documents-icon"><UIcon :name="activeStage.icon"/></span><h2>{{ activeStage.label }} проекта</h2><p>{{ activeStage.description }}</p><NuxtLink :to="`/projects/${currentProject.id}`" class="subscription-card-link">Вернуться к проекту →</NuxtLink></section>
          <template v-else>
          <div class="project-overview" aria-label="Информация о проекте"><div><UIcon name="i-lucide-user-round-check"/><small>Ваши права</small><strong>{{ labels[currentProject.permission] }}</strong></div><div><UIcon name="i-lucide-users-round"/><small>Участников</small><strong>{{ currentProject.members.length }}</strong></div><div><UIcon name="i-lucide-calendar-days"/><small>Создан</small><strong>{{ projectDate(currentProject.createdAt) }}</strong></div><div><UIcon name="i-lucide-clock-3"/><small>Обновлён</small><strong>{{ projectDate(currentProject.updatedAt) }}</strong></div></div>
          <section class="project-business-stages" aria-label="Бизнес-этапы проекта"><div class="project-page-section-heading"><h2>Этапы проекта</h2></div><ol class="project-stages-grid project-stages-sequence"><li v-for="stage in projectStages" :key="stage.key"><NuxtLink :to="`/projects/${currentProject.id}/${stage.key}`" class="password-glass password-launch-card project-stage-link" :aria-label="`${stage.label} проекта: ${currentProject.name}`"><span class="project-stage-icon"><UIcon :name="stage.icon"/></span><span class="project-stage-copy"><small>Этап {{ stage.number }}</small><strong>{{ stage.label }}</strong></span><UIcon name="i-lucide-arrow-up-right" class="project-stage-arrow"/></NuxtLink></li></ol></section>
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
