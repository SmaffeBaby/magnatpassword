<script setup lang="ts">
defineProps<{hero?:boolean}>()
</script>
<template>
  <NuxtLink to="/projects" class="password-glass" :class="{'password-launch-card projects-launch-card':hero}" aria-label="Открыть Проекты">
    <span class="projects-app-icon" :class="{'projects-launch-icon':hero}"><UIcon name="i-lucide-folder-kanban" /></span>
    <span>Проекты</span>
  </NuxtLink>
</template>
