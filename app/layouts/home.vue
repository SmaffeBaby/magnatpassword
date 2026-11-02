<script setup lang="ts">
import ApplicationSwitcher from '~/components/ApplicationSwitcher.vue'
import AuthGate from '~/components/AuthGate.vue'
import AccountControls from '~/components/AccountControls.vue'
import ProjectNavigation from '~/components/ProjectsPage/ProjectNavigation.vue'
import type { AppNotification } from '~~/shared/types/subscriptions'

const route = useRoute()
const { brand } = useAccountBrand()
const isProjects = computed(() => route.path === '/projects' || route.path.startsWith('/projects/'))
const projectMenuOpen = ref(false)
const { topbarHidden, resetTopbar } = useScrollTopbar()
watch(() => route.fullPath, () => { projectMenuOpen.value = false; if (import.meta.client) resetTopbar() })
const isHome = computed(() => route.path.replace(/\/$/, '') === '')
function openNotification(notification: AppNotification) {
  navigateTo({ path: '/password', query: {
    ...(notification.entryId ? { entry: notification.entryId } : {}),
    ...(notification.vaultId ? { vault: notification.vaultId } : {})
  } })
}
</script>

<template>
  <AuthGate>
    <div class="home-shell" :class="{ 'projects-shell': isProjects }">
      <aside v-if="isProjects" class="projects-sidebar" aria-label="Навигация проектов"><ProjectNavigation/></aside>
      <USlideover v-if="isProjects" v-model:open="projectMenuOpen" side="left" title="Проекты" description="Разделы рабочего пространства и текущего проекта." :ui="{ content: 'max-w-xs', body: 'p-0 sm:p-0' }"><template #body><ProjectNavigation @navigate="projectMenuOpen = false"/></template></USlideover>
      <header class="home-topbar" :class="{'projects-topbar':isProjects,'is-hidden':isProjects && topbarHidden && !projectMenuOpen}">
        <NuxtLink v-if="isHome" to="/" class="home-brand" aria-label="Главная"><img :src="brand === 'light' ? '/light-favicon.svg' : '/favicon.svg'" alt="" width="32" height="32" /></NuxtLink>
        <div v-else class="home-navigation-context"><UButton v-if="isProjects" icon="i-lucide-panel-left" color="neutral" variant="ghost" class="project-menu-trigger" aria-label="Открыть меню проектов" :aria-expanded="projectMenuOpen" @click="projectMenuOpen = true"/><NuxtLink :to="isProjects ? '/projects' : '/'" class="projects-back"><UIcon :name="isProjects ? 'i-lucide-folder-kanban' : 'i-lucide-arrow-left'" />{{ isProjects ? 'Проекты' : 'Главная' }}</NuxtLink></div>
        <ApplicationSwitcher v-if="isProjects" />
        <AccountControls class="home-account" @open-entry="openNotification" />
      </header>
      <main :class="isHome ? 'home-center' : 'home-section'" :aria-label="isHome ? 'Приложения' : undefined"><slot /></main>
    </div>
  </AuthGate>
</template>

<style scoped>
.projects-shell{padding-left:256px}.projects-sidebar{position:fixed;inset:0 auto 0 0;width:256px;z-index:35;overflow-y:auto;overscroll-behavior:contain;background:#ffffffd9;border-right:1px solid #e7edf3;backdrop-filter:blur(18px)}.projects-shell>.home-section{max-width:1560px;padding:40px clamp(24px,3vw,56px) 64px}.home-navigation-context{display:flex;align-items:center;gap:10px;min-width:0}.project-menu-trigger{display:none}.projects-shell>.projects-topbar{min-height:82px;grid-template-columns:auto minmax(0,1fr) auto;padding-inline:28px;gap:24px}.projects-topbar :deep(.workspace-apps){justify-self:center}.projects-shell :deep(.project-page-heading){gap:24px;align-items:flex-start}.projects-shell :deep(.project-page-heading h1){font-size:30px}
@media(max-width:1200px){.projects-shell>.projects-topbar{gap:14px;padding-inline:24px}.projects-shell .home-navigation-context .projects-back{font-size:12px}.projects-topbar :deep(.workspace-apps .password-glass){font-size:12px;padding:8px;gap:6px}.projects-topbar :deep(.workspace-apps .password-glass img),.projects-topbar :deep(.workspace-apps .finance-app-icon),.projects-topbar :deep(.workspace-apps .projects-app-icon){width:20px;height:20px;font-size:18px}.projects-shell :deep(.project-page-heading){flex-wrap:wrap}}
@media(max-width:1023px){.projects-shell{padding-left:0}.projects-sidebar{display:none}.project-menu-trigger{display:inline-flex}.projects-shell>.home-section{padding:30px 24px 48px}}
@media(max-width:767px){.projects-shell>.projects-topbar{grid-template-columns:minmax(0,1fr) auto;grid-template-rows:44px auto;gap:8px;padding:6px 16px 10px}.home-navigation-context{grid-column:1;grid-row:1}.projects-shell>.projects-topbar>.home-account{grid-column:2;grid-row:1}.projects-topbar :deep(.workspace-apps){grid-column:1/-1;grid-row:2;width:100%}.projects-shell>.home-section{padding:28px 18px 40px}.projects-shell :deep(.project-page-heading h1){font-size:26px}}
</style>
