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
    <div class="breadcrumb"><NuxtLink to="/" aria-label="Главная" class="breadcrumb-home"><UIcon name="i-lucide-house" /></NuxtLink><UIcon name="i-lucide-chevron-right" /><strong>{{ title }}</strong></div>
  </div>
  <ApplicationSwitcher />
  <AccountControls @open-entry="emit('openEntry', $event)" />
</template>

<style scoped>
.password-header-context .breadcrumb{display:flex}
.breadcrumb .breadcrumb-home{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;flex-shrink:0;border-radius:11px;color:#8291a6;transition:background .18s,color .18s}
.breadcrumb .breadcrumb-home>.iconify{width:24px;height:24px}
.breadcrumb .breadcrumb-home:hover{background:#edf2f7;color:var(--ui-primary)}
.breadcrumb .breadcrumb-home:focus-visible{outline:2px solid var(--ui-primary);outline-offset:2px}
@media(prefers-reduced-motion:reduce){.breadcrumb .breadcrumb-home{transition:none}}
</style>
