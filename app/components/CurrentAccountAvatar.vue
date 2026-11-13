<script setup lang="ts">
import PersonAvatar from './PersonAvatar.vue'
import { profileAvatarKey } from '~/utils/avatar-cache'

const props = defineProps<{ name?: string }>()
const auth = useAuthStore(), team = useTeamStore()
const person = computed(() => team.me?.person.id === auth.user?.id ? team.me?.person : undefined)
const saved = computed(() => auth.savedAccounts.find(account => account.id === auth.user?.id))
const name = computed(() => props.name || person.value?.fullName || saved.value?.name || auth.user?.email || 'Мой профиль')
const src = computed(() => {
  if (!auth.user) return undefined
  if (!person.value) return saved.value?.avatar
  const url = person.value.avatarUrl
  if (!url) return undefined
  const source = profileAvatarKey(url)
  if (auth.profileAvatar?.userId === auth.user.id && auth.profileAvatar.source === source) return auth.profileAvatar.image
  return saved.value?.avatarSource === source ? saved.value.avatar : url
})
</script>

<template><PersonAvatar :name="name" :src="src" /></template>
