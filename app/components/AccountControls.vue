<script setup lang="ts">
import NotificationCenter from './NotificationCenter.vue'
import PersonAvatar from './PersonAvatar.vue'
import type { AppNotification } from '~~/shared/types/subscriptions'

const emit = defineEmits<{ openEntry: [notification: AppNotification] }>()
const auth = useAuthStore(), vault = useVaultStore(), team = useTeamStore()
const name = computed(() => team.me?.person.fullName || auth.user?.email || 'Мой профиль')
const profileItems = computed(() => [
  [{ label: name.value, type: 'label' as const }],
  [
    { label: 'Мой профиль', icon: 'i-lucide-user-round-cog', to: '/password/profile' },
    { label: 'Команда', icon: 'i-lucide-users-round', to: '/password/team' },
    { label: 'Копия личного хранилища', icon: 'i-lucide-download', onSelect: () => vault.exportEncrypted() }
  ],
  [{ label: 'Выйти из аккаунта', icon: 'i-lucide-log-out', onSelect: () => auth.logout() }]
])
</script>
<template>
  <div class="password-header-account">
    <div class="password-notifications"><NotificationCenter @open-entry="emit('openEntry', $event)" /></div>
    <UDropdownMenu :items="profileItems" :content="{ align: 'end' }">
      <button class="password-profile" :aria-label="`Меню профиля: ${name}`">
        <PersonAvatar :name="name" :src="team.me?.person.avatarUrl" />
        <span class="password-profile-name">{{ team.me?.person.fullName || 'Мой профиль' }}</span>
        <UIcon name="i-lucide-chevron-down" class="password-profile-chevron" />
      </button>
    </UDropdownMenu>
  </div>
</template>
