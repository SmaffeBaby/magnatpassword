<script setup lang="ts">
defineProps<{ hero?: boolean }>()
const { brand } = useAccountBrand()
</script>

<template>
  <NuxtLink to="/password" class="password-glass" :class="{ 'password-launch-card': hero }" aria-label="Открыть Пароли">
    <img :src="brand === 'light' ? '/light-favicon.svg' : '/favicon.svg'" alt="" width="26" height="26" />
    <span>Пароли</span>
  </NuxtLink>
</template>
