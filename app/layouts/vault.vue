<script setup lang="ts">
import AuthGate from '../components/AuthGate.vue'
import VaultWorkspace from '../components/PasswordPage/VaultWorkspace.vue'

const route = useRoute()
const sectionModes: Record<string, string> = { '/password/categories': 'categories', '/password/finances': 'finances', '/password/subscriptions': 'upcoming' }
const mode = computed(() => sectionModes[route.path.replace(/\/$/, '')])
</script>
<template>
  <AuthGate><VaultWorkspace :mode="mode"><slot /></VaultWorkspace></AuthGate>
</template>
