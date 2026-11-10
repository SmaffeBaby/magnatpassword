<script setup lang="ts">
defineProps<{ hero?: boolean }>()
</script>

<template>
  <NuxtLink to="/password" class="password-glass" :class="{ 'password-launch-card': hero }" aria-label="Открыть Пароли">
    <img src="/password.svg" alt="" width="26" height="26" />
    <span>Пароли</span>
  </NuxtLink>
</template>
