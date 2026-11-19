<script setup lang="ts">
defineProps<{hero?:boolean}>()
</script>
<template><NuxtLink to="/kaban" class="password-glass" :class="{'password-launch-card':hero}" aria-label="Открыть задачи"><UIcon name="i-lucide-list-checks" class="finance-app-icon"/><span>Задачи</span></NuxtLink></template>
