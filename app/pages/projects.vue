<script setup lang="ts">
import AuthGate from '~/components/AuthGate.vue'
import AccountControls from '~/components/AccountControls.vue'
import ProjectsWorkspace from '~/components/ProjectsPage/ProjectsWorkspace.vue'
import type { AppNotification } from '~~/shared/types/subscriptions'
function openNotification(notification: AppNotification) {
  navigateTo({ path: '/password', query: { ...(notification.entryId ? { entry: notification.entryId } : {}), ...(notification.vaultId ? { vault: notification.vaultId } : {}) } })
}
</script>
<template><AuthGate><div class="home-shell"><header class="home-topbar"><NuxtLink to="/" class="projects-back"><UIcon name="i-lucide-arrow-left" />Главная</NuxtLink><AccountControls class="home-account" @open-entry="openNotification" /></header><main class="projects-main"><ProjectsWorkspace /></main></div></AuthGate></template>
