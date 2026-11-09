<script setup lang="ts">
import BrandLogo from './BrandLogo.vue'
import PersonAvatar from './PersonAvatar.vue'
import VaultSwitcher from './PasswordPage/VaultSwitcher.vue'
defineProps<{ open?: boolean; section: string }>()
const vaultId = defineModel<string>('vaultId', { default: 'all' })
const auth = useAuthStore(), team = useTeamStore()
onMounted(() => team.refreshMe())
</script>
<template>
 <aside class="vault-sidebar" :class="{'is-open':open}">
  <BrandLogo/><VaultSwitcher v-model="vaultId"/>
  <p class="sidebar-label">{{ section }}</p>
  <slot/>
  <div class="sidebar-bottom"><div class="sidebar-user"><NuxtLink to="/profile" class="sidebar-profile"><PersonAvatar :name="team.me?.person.fullName||auth.user?.email||'Профиль'" :src="team.me?.person.avatarUrl"/><span><strong>{{ team.me?.person.fullName||'Мой профиль' }}</strong><small>{{ auth.user?.email }}</small></span></NuxtLink><button title="Выйти" aria-label="Выйти" @click="auth.logout()"><UIcon name="i-lucide-log-out"/></button></div></div>
 </aside>
</template>
