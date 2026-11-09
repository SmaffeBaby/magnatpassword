<script setup lang="ts">
import BoarLogo from './BoarLogo.vue'
defineProps<{hero?:boolean}>()
</script>
<template><NuxtLink to="/kaban" class="password-glass" :class="{'password-launch-card':hero}" aria-label="Открыть Кабан"><BoarLogo class="finance-app-icon"/><span>Кабан</span></NuxtLink></template>
