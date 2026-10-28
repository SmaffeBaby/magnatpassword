<script setup lang="ts">
import AuthGate from '~/components/AuthGate.vue'
import AccountControls from '~/components/AccountControls.vue'
import ProjectsCard from '~/components/ProjectsPage/ProjectsCard.vue'
import PasswordCard from '~/components/PasswordPage/PasswordCard.vue'
import type { AppNotification } from '~~/shared/types/subscriptions'

const { brand } = useAccountBrand()
const projectAccess = useProjectAccess()
function openNotification(notification: AppNotification) {
  navigateTo({ path: '/password', query: {
    ...(notification.entryId ? { entry: notification.entryId } : {}),
    ...(notification.vaultId ? { vault: notification.vaultId } : {})
  } })
}
</script>

<template>
  <AuthGate>
    <div class="home-shell">
      <header class="home-topbar">
        <NuxtLink to="/" class="home-brand" aria-label="Главная">
          <img :src="brand === 'light' ? '/light-favicon.svg' : '/favicon.svg'" alt="" width="32" height="32" />
        </NuxtLink>
        <AccountControls class="home-account" @open-entry="openNotification" />
      </header>
      <main class="home-center" aria-label="Приложения">
        <div class="home-applications"><PasswordCard hero /><ProjectsCard v-if="projectAccess.data.value?.allowed" /></div><UAlert v-if="projectAccess.error.value" class="home-access-error" color="error" title="Не удалось проверить доступ к проектам" :actions="[{ label: 'Повторить', onClick: () => projectAccess.refetch() }]" />
      </main>
    </div>
  </AuthGate>
</template>
