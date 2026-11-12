<script setup lang="ts">
defineProps<{hero?:boolean}>()
</script>
<template>
 <NuxtLink to="/contract-register" class="password-glass" :class="{'password-launch-card contract-launch-card':hero}" aria-label="Открыть Реестр договоров"><span class="projects-app-icon" :class="{'projects-launch-icon':hero}"><UIcon name="i-lucide-notebook-tabs"/></span><span class="contract-card-title">Реестр договоров</span></NuxtLink>
</template>
<style scoped>
.contract-card-title{min-width:0}.contract-launch-card .contract-card-title{font-size:clamp(16px,1.35vw,22px);white-space:nowrap}
</style>
