<script setup lang="ts">
defineProps<{ hero?: boolean }>()
</script>
<template><NuxtLink to="/team" class="password-glass" :class="{ 'password-launch-card': hero }" aria-label="Открыть Команду"><UIcon name="i-lucide-users-round" class="finance-app-icon"/><span>Команда</span></NuxtLink></template>
