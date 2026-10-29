<script setup lang="ts">
import ApplicationSwitcher from '../ApplicationSwitcher.vue'
import AccountControls from '../AccountControls.vue'
import type { AppNotification } from '~~/shared/types/subscriptions'

defineProps<{ workspaceName: string; title: string }>()
const emit = defineEmits<{ toggleMenu: []; openEntry: [notification: AppNotification] }>()
</script>

<template>
  <div class="password-header-context">
    <button class="mobile-menu" aria-label="Открыть меню" @click="emit('toggleMenu')"><UIcon name="i-lucide-menu" /></button>
    <div class="breadcrumb"><NuxtLink to="/" aria-label="Главная"><UIcon name="i-lucide-house" /></NuxtLink><span>{{ workspaceName }}</span><UIcon name="i-lucide-chevron-right" /><strong>{{ title }}</strong></div>
  </div>
  <ApplicationSwitcher />
  <AccountControls @open-entry="emit('openEntry', $event)" />
</template>
