<script setup lang="ts">
import { canEditProjectSection, canViewProjectSection } from '~~/shared/utils/project-permissions'
import { projectTaskView, projectTaskViews } from '~~/shared/utils/project-task-planning'
import ProjectBoardNavigation from '../Kaban/ProjectBoardNavigation.vue'
import BrandLogo from '~/components/Brand/BrandLogo.vue'
import { projectStages } from '~~/shared/utils/project-dashboard'

const props=defineProps<{registry?:boolean}>()
const emit = defineEmits<{ navigate: [] }>()
const route = useRoute(), access = useProjectAccess(), projects = useProjectsData()
const project = computed(() => projects.data.value?.find(item => item.id === route.params.id))
const tasksPath = computed(() => `/projects/${route.params.id}/tasks`)
const inTasks = computed(() => route.path.replace(/\/$/, '') === tasksPath.value)
const taskView = computed(() => projectTaskView(route.query.view))
const tasksOpen = ref(inTasks.value)
const taskLinksId = useId()
watch([inTasks, tasksPath], ([active]) => { tasksOpen.value = active })
function taskLink(view: ReturnType<typeof projectTaskView>, create = false) {
  return { path: tasksPath.value, query: { ...(view === 'board' ? {} : { view }), ...(create ? { create: '1' } : {}) } }
}
const directoryLinks = computed(() => props.registry ? [
  { to:'/contract-register',label:'Все договоры',icon:'i-lucide-notebook-tabs',tab:'contracts' },
  { to:'/contract-register?tab=calendar',label:'Календарь договоров',icon:'i-lucide-calendar-days',tab:'calendar' },
  { to:'/contract-register?tab=counterparties',label:'Контрагенты',icon:'i-lucide-building-2',tab:'counterparties' },
  { to:'/contract-register?tab=legal-entities',label:'Наши юр. лица',icon:'i-lucide-landmark',tab:'legal-entities' }
] : [
  { to: '/projects', label: 'Все проекты', icon: 'i-lucide-folder-kanban', tab: 'projects' }
])
const directoryTab = computed(() => (props.registry ? ['calendar','counterparties','legal-entities'] : ['counterparties','legal-entities','document-templates']).includes(String(route.query.tab)) ? String(route.query.tab) : props.registry?'contracts':'projects')
const projectLinks = computed(() => project.value ? [
  { to: `/projects/${project.value.id}`, label: 'Обзор проекта', icon: 'i-lucide-layout-dashboard', number: '' },
  {to:`/projects/${project.value.id}/spaces`,label:'Пространства',icon:'i-lucide-orbit',number:''},
  {to:`/projects/${project.value.id}/chats`,label:'Чаты проекта',icon:'i-lucide-messages-square',number:''},
  {to:`/projects/${project.value.id}/passwords`,label:'Пароли проекта',icon:'i-lucide-key-round',number:''},
  {to:`/projects/${project.value.id}/documents`,label:'Документы проекта',icon:'i-lucide-folder-open',number:''},
  {to:tasksPath.value,label:'Задачи',icon:'i-lucide-list-checks',number:''},
  {to:`/projects/${project.value.id}/economy`,label:'Экономика проекта',icon:'i-lucide-chart-no-axes-combined',number:''},
  ...(['/spaces','/tasks','/documents','/passwords','/chats'].some(suffix => route.path.endsWith(suffix)) ? [] : route.path !== `/projects/${project.value.id}` ? [
   ...projectStages.map(stage => ({to:`/projects/${project.value!.id}/${stage.key}`,...stage})),
   {to:`/projects/${project.value.id}/counterparties`,label:'Контрагенты',icon:'i-lucide-building-2',number:''},
   {to:`/projects/${project.value.id}/legal-entities`,label:'Наши юр. лица',icon:'i-lucide-landmark',number:''},
   {to:`/projects/${project.value.id}/document-templates`,label:'Шаблоны документов',icon:'i-lucide-files',number:''},
   {to:`/projects/${project.value.id}/relationships`,label:'Взаимосвязь',icon:'i-lucide-workflow',number:''}
  ] : [])
] .filter(link => link.to.endsWith('/spaces') || link.to.endsWith('/chats') || link.to.endsWith('/passwords') || canViewProjectSection(project.value!, link.to.endsWith('/tasks') ? 'tasks' : link.to.endsWith('/documents') ? 'documents' : 'economy') || link.to === `/projects/${project.value!.id}`) : [])
</script>

<template>
  <div class="projects-navigation">
    <div class="projects-navigation-brand" @click="emit('navigate')"><BrandLogo/></div>
    <template v-if="access.data.value?.allowed">
      <nav class="projects-navigation-group" :aria-label="registry?'Разделы реестра договоров':'Разделы проектов'">
        <NuxtLink v-for="link in directoryLinks" :key="link.tab" :to="link.to" :aria-current="!route.params.id && directoryTab === link.tab ? 'page' : undefined" @click="emit('navigate')"><UIcon :name="link.icon"/><span>{{ link.label }}</span></NuxtLink>
      </nav>
      <nav v-if="project" class="projects-navigation-group project-navigation-stages" aria-label="Разделы открытого проекта">
        <p class="projects-navigation-label">ТЕКУЩИЙ ПРОЕКТ</p>
        <h2 :title="project.name">{{ project.name }}</h2>
        <template v-for="link in projectLinks" :key="link.to">
          <template v-if="link.to === tasksPath">
            <button type="button" class="project-tasks-toggle" :class="{ active: inTasks }" :aria-expanded="tasksOpen" :aria-controls="taskLinksId" @click="tasksOpen = !tasksOpen"><UIcon :name="link.icon" /><span>{{ link.label }}</span><UIcon name="i-lucide-chevron-down" class="task-chevron" /></button>
            <div v-show="tasksOpen" :id="taskLinksId" class="project-task-links">
              <NuxtLink v-for="view in projectTaskViews" :key="view.value" :to="taskLink(view.value)" :aria-current="inTasks && taskView === view.value ? 'page' : undefined" @click="emit('navigate')"><UIcon :name="view.icon" /><span>{{ view.label }}</span></NuxtLink>
              <NuxtLink v-if="canEditProjectSection(project, 'tasks')" :to="taskLink(inTasks ? taskView : 'board', true)" @click="emit('navigate')"><UIcon name="i-lucide-plus" /><span>Добавить задачу</span></NuxtLink>
            </div>
          </template>
          <NuxtLink v-else :to="link.to" :aria-current="route.path.replace(/\/$/, '') === link.to ? 'page' : undefined" @click="emit('navigate')"><UIcon :name="link.icon"/><span>{{ link.label }}</span><small v-if="link.number">{{ link.number }}</small></NuxtLink>
        </template>
      </nav>
      <ProjectBoardNavigation v-if="project && canViewProjectSection(project, 'tasks') && inTasks && taskView === 'board'" @navigate="emit('navigate')"/>
    </template>
    <div class="projects-navigation-bottom"><NuxtLink to="/" @click="emit('navigate')"><UIcon name="i-lucide-arrow-left"/>К приложениям</NuxtLink></div>
  </div>
</template>

<style scoped>
.projects-navigation{min-height:100%;display:flex;flex-direction:column;padding:28px 16px 18px;gap:28px}.projects-navigation-brand{padding:0 10px 6px}.projects-navigation-brand :deep(.brand){font-size:19px}.projects-navigation-group{display:flex;flex-direction:column;gap:5px}.projects-navigation-label{font-size:9px;font-weight:600;letter-spacing:1.4px;color:#9aa7b7;padding:0 12px;margin-bottom:10px}.projects-navigation-group a,.projects-navigation-bottom a{display:flex;align-items:center;gap:11px;padding:12px;border-radius:10px;font-size:13px;font-weight:500;line-height:1.5;text-align:left;justify-content:flex-start;color:#8292a8;transition:background .15s,color .15s}.projects-navigation-group a>.iconify,.projects-navigation-bottom .iconify{font-size:19px;width:19px;height:19px;flex:0 0 19px}.projects-navigation-group a>span:not(.iconify){flex:1;min-width:0}.projects-navigation-group a>small{font-size:10px;color:#a5afbd;font-variant-numeric:tabular-nums}.projects-navigation-group a:hover,.projects-navigation-bottom a:hover{background:#f3f5f9;color:#475569}.projects-navigation-group a[aria-current=page]{background:color-mix(in srgb,var(--ui-primary) 8%,white);color:var(--ui-primary);font-weight:600}.projects-navigation-group a[aria-current=page]>small{color:inherit;opacity:.65}.project-navigation-stages{border-top:1px solid #e8edf3;padding-top:24px}.project-navigation-stages h2{padding:0 12px;margin:-2px 0 12px;color:#475569;font-size:14px;font-weight:600;line-height:1.6;overflow-wrap:anywhere}.projects-navigation-bottom{margin-top:auto;padding-top:20px;border-top:1px solid #e8edf3}.projects-navigation-bottom a{font-size:12px}
.project-tasks-toggle{display:flex;align-items:center;gap:11px;padding:12px;border-radius:10px;font-size:13px;font-weight:500;line-height:1.5;text-align:left;color:#8292a8}
.project-tasks-toggle span:not(.iconify){flex:1}.project-tasks-toggle .iconify{width:19px;height:19px;flex-shrink:0}
.project-tasks-toggle:hover,.project-tasks-toggle.active{background:#f3f5f9;color:var(--ui-primary)}
.project-tasks-toggle .task-chevron{width:15px;height:15px;transition:transform .15s}.project-tasks-toggle[aria-expanded=true] .task-chevron{transform:rotate(180deg)}
.project-task-links{display:grid;gap:3px;margin-left:20px;padding-left:7px;border-left:1px solid #e2e8f0}
.project-task-links a{padding:8px 9px}.project-task-links a>.iconify{width:17px;height:17px;flex-basis:17px}
</style>
