<script setup lang="ts">
defineProps<{ hero?: boolean }>()
</script>

<template>
  <NuxtLink to="/finances" class="password-glass" :class="{ 'password-launch-card': hero }" aria-label="Открыть Финансы">
    <UIcon name="i-lucide-chart-no-axes-combined" class="finance-app-icon" />
    <span>Финансы</span>
  </NuxtLink>
</template>
