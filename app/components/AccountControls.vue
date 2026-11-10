<script setup lang="ts">
import NotificationCenter from './NotificationCenter.vue'
import PersonAvatar from './PersonAvatar.vue'
import type { AppNotification } from '~~/shared/types/subscriptions'
import { isNativeShell } from '~/utils/native-shell'

const emit = defineEmits<{ openEntry: [notification: AppNotification] }>()
const native = ref(false)
onMounted(() => { native.value = isNativeShell() })
const auth = useAuthStore(), vault = useVaultStore(), team = useTeamStore()
const name = computed(() => team.me?.person.fullName || auth.user?.email || 'Мой профиль')
const profileItems = computed(() => [
  [{ label: name.value, type: 'label' as const }],
  [
    { label: 'Мой профиль', icon: 'i-lucide-user-round-cog', to: '/profile' },
    { label: 'Настройки аккаунта', icon: 'i-lucide-settings', to: '/settings/account' },
    { label: 'Команда', icon: 'i-lucide-users-round', to: '/team' },
    ...(!native.value ? [{ label: 'Скачать приложение', icon: 'i-lucide-download', to: '/downloads' }] : []),
    { label: 'Копия личного хранилища', icon: 'i-lucide-download', onSelect: () => vault.exportEncrypted() },
    ...(native.value ? [{label:'Версия приложения',icon:'i-lucide-info',to:'/settings/app-version'}] : [])
  ],
  [
    { label: 'Сменить аккаунт', icon: 'i-lucide-users-round', onSelect: () => auth.logout() },
    { label: 'Выйти из аккаунта', icon: 'i-lucide-log-out', onSelect: () => auth.logout() }
  ]
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
