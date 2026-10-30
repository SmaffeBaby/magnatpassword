<script setup lang="ts">
import ApplicationSwitcher from '~/components/ApplicationSwitcher.vue'
import AuthGate from '~/components/AuthGate.vue'
import AccountControls from '~/components/AccountControls.vue'
import type { AppNotification } from '~~/shared/types/subscriptions'

const route = useRoute()
const { brand } = useAccountBrand()
const isProjects = computed(() => route.path === '/projects' || route.path.startsWith('/projects/'))
const { topbarHidden, resetTopbar } = useScrollTopbar()
watch(() => route.fullPath, () => { if (import.meta.client) resetTopbar() })
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
    <div class="home-shell">
      <header class="home-topbar" :class="{'projects-topbar':isProjects,'is-hidden':isProjects && topbarHidden}">
        <NuxtLink v-if="isHome" to="/" class="home-brand" aria-label="Главная"><img :src="brand === 'light' ? '/light-favicon.svg' : '/favicon.svg'" alt="" width="32" height="32" /></NuxtLink>
        <NuxtLink v-else to="/" class="projects-back"><UIcon name="i-lucide-arrow-left" />Главная</NuxtLink>
        <ApplicationSwitcher v-if="isProjects" />
        <AccountControls class="home-account" @open-entry="openNotification" />
      </header>
      <main :class="isHome ? 'home-center' : 'home-section'" :aria-label="isHome ? 'Приложения' : undefined"><slot /></main>
    </div>
  </AuthGate>
</template>
