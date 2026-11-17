<script setup lang="ts">
import { canViewProjectSection } from '~~/shared/utils/project-permissions'
import ProjectBoardNavigation from '../Kaban/ProjectBoardNavigation.vue'
import BrandLogo from '~/components/Brand/BrandLogo.vue'
import { projectStages } from '~~/shared/utils/project-dashboard'

const props=defineProps<{registry?:boolean}>()
const emit = defineEmits<{ navigate: [] }>()
const route = useRoute(), access = useProjectAccess(), projects = useProjectsData()
const project = computed(() => projects.data.value?.find(item => item.id === route.params.id))
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
  {to:`/projects/${project.value.id}/tasks`,label:'Задачи · Кабан',icon:'i-lucide-columns-3',number:''},
  {to:`/projects/${project.value.id}/economy`,label:'Экономика проекта',icon:'i-lucide-chart-no-axes-combined',number:''},
  ...(route.path.endsWith('/tasks') ? [] : route.path !== `/projects/${project.value.id}` ? [
   ...projectStages.map(stage => ({to:`/projects/${project.value!.id}/${stage.key}`,...stage})),
   {to:`/projects/${project.value.id}/counterparties`,label:'Контрагенты',icon:'i-lucide-building-2',number:''},
   {to:`/projects/${project.value.id}/legal-entities`,label:'Наши юр. лица',icon:'i-lucide-landmark',number:''},
   {to:`/projects/${project.value.id}/document-templates`,label:'Шаблоны документов',icon:'i-lucide-files',number:''},
   {to:`/projects/${project.value.id}/relationships`,label:'Взаимосвязь',icon:'i-lucide-workflow',number:''}
  ] : [])
] .filter(link => canViewProjectSection(project.value!, link.to.endsWith('/tasks') ? 'tasks' : 'economy') || link.to === `/projects/${project.value!.id}`) : [])
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
        <NuxtLink v-for="link in projectLinks" :key="link.to" :to="link.to" :aria-current="route.path.replace(/\/$/, '') === link.to ? 'page' : undefined" @click="emit('navigate')"><UIcon :name="link.icon"/><span>{{ link.label }}</span><small v-if="link.number">{{ link.number }}</small></NuxtLink>
      </nav>
      <ProjectBoardNavigation v-if="project && canViewProjectSection(project, 'tasks') && route.path.endsWith('/tasks')" @navigate="emit('navigate')"/>
    </template>
    <div class="projects-navigation-bottom"><NuxtLink to="/" @click="emit('navigate')"><UIcon name="i-lucide-arrow-left"/>К приложениям</NuxtLink></div>
  </div>
</template>

<style scoped>
.projects-navigation{min-height:100%;display:flex;flex-direction:column;padding:28px 16px 18px;gap:28px}.projects-navigation-brand{padding:0 10px 6px}.projects-navigation-brand :deep(.brand){font-size:19px}.projects-navigation-group{display:flex;flex-direction:column;gap:5px}.projects-navigation-label{font-size:9px;font-weight:600;letter-spacing:1.4px;color:#9aa7b7;padding:0 12px;margin-bottom:10px}.projects-navigation-group a,.projects-navigation-bottom a{display:flex;align-items:center;gap:11px;padding:12px;border-radius:10px;font-size:13px;font-weight:500;line-height:1.5;text-align:left;justify-content:flex-start;color:#8292a8;transition:background .15s,color .15s}.projects-navigation-group a>.iconify,.projects-navigation-bottom .iconify{font-size:19px;width:19px;height:19px;flex:0 0 19px}.projects-navigation-group a>span:not(.iconify){flex:1;min-width:0}.projects-navigation-group a>small{font-size:10px;color:#a5afbd;font-variant-numeric:tabular-nums}.projects-navigation-group a:hover,.projects-navigation-bottom a:hover{background:#f3f5f9;color:#475569}.projects-navigation-group a[aria-current=page]{background:color-mix(in srgb,var(--ui-primary) 8%,white);color:var(--ui-primary);font-weight:600}.projects-navigation-group a[aria-current=page]>small{color:inherit;opacity:.65}.project-navigation-stages{border-top:1px solid #e8edf3;padding-top:24px}.project-navigation-stages h2{padding:0 12px;margin:-2px 0 12px;color:#475569;font-size:14px;font-weight:600;line-height:1.6;overflow-wrap:anywhere}.projects-navigation-bottom{margin-top:auto;padding-top:20px;border-top:1px solid #e8edf3}.projects-navigation-bottom a{font-size:12px}
</style>
