<script setup lang="ts">
defineProps<{ hero?: boolean }>()
</script>
<template><NuxtLink to="/relationships" class="password-glass" :class="{'password-launch-card':hero}" aria-label="Открыть Взаимосвязи"><UIcon name="i-lucide-network" class="finance-app-icon"/><span>Взаимосвязи</span></NuxtLink></template>
