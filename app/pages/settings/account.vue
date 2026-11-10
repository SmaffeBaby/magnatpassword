<script setup lang="ts">
import AccountAccessSettings from '~/components/AccountPage/AccountAccessSettings.vue'
import AccountNotificationSettings from '~/components/AccountPage/AccountNotificationSettings.vue'
import AccountDevices from '~/components/AccountPage/AccountDevices.vue'
definePageMeta({layout:'home'})
const auth=useAuthStore()
</script>
<template>
 <div :key="auth.user?.id" class="account-settings-page">
  <div class="team-page-heading"><div><h1>Настройки аккаунта</h1><p>Вход, уведомления и устройства.</p></div><UButton to="/profile" label="Мой профиль" icon="i-lucide-user-round" color="neutral" variant="outline"/></div>
  <nav class="account-settings-navigation" aria-label="Разделы настроек аккаунта"><UButton to="#access" label="Вход и выход" icon="i-lucide-log-in" color="neutral" variant="ghost"/><UButton to="#notifications" label="Уведомления" icon="i-lucide-bell" color="neutral" variant="ghost"/><UButton to="#devices" label="Мои устройства" icon="i-lucide-monitor-smartphone" color="neutral" variant="ghost"/></nav>
  <section id="access" class="account-settings-section" aria-label="Вход и выход из аккаунта"><AccountAccessSettings/></section>
  <section id="notifications" class="account-settings-section" aria-label="Уведомления"><AccountNotificationSettings/></section>
  <section id="devices" class="account-settings-section" aria-label="Мои устройства"><AccountDevices/></section>
 </div>
</template>
<style scoped>
.account-settings-page{width:100%;max-width:1120px;margin-inline:auto;min-width:0}.account-settings-navigation{display:flex;flex-wrap:wrap;gap:8px;margin-top:24px}.account-settings-section{scroll-margin-top:100px}.account-settings-section :deep(.my-6){margin-block:24px}@media(max-width:600px){.account-settings-navigation{gap:4px}.account-settings-navigation :deep(a){font-size:12px;padding-inline:8px}}
</style>
