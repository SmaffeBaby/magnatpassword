<script setup lang="ts">
import AccountControls from '../AccountControls.vue'
import PasswordCard from './PasswordCard.vue'
import RelationshipsCard from '../RelationshipsCard.vue'
import FinanceCard from '../FinanceCard.vue'
import type { AppNotification } from '~~/shared/types/subscriptions'

defineProps<{ workspaceName: string; title: string }>()
const emit = defineEmits<{ toggleMenu: []; openEntry: [notification: AppNotification] }>()
</script>

<template>
  <div class="password-header-context">
    <button class="mobile-menu" aria-label="Открыть меню" @click="emit('toggleMenu')"><UIcon name="i-lucide-menu" /></button>
    <div class="breadcrumb"><NuxtLink to="/" aria-label="Главная"><UIcon name="i-lucide-house" /></NuxtLink><span>{{ workspaceName }}</span><UIcon name="i-lucide-chevron-right" /><strong>{{ title }}</strong></div>
  </div>
  <nav class="workspace-apps" aria-label="Приложения"><PasswordCard /><FinanceCard /><RelationshipsCard /></nav>
  <AccountControls @open-entry="emit('openEntry', $event)" />
</template>
