<script setup lang="ts">
import AuthGate from '../components/AuthGate.vue'
import VaultWorkspace from '../components/PasswordPage/VaultWorkspace.vue'

const route = useRoute()
const sectionModes: Record<string, string> = { '/relationships': 'relationshipCards', '/relationships/map': 'relationships', '/password/categories': 'categories', '/finances': 'finances', '/finances/subscriptions': 'upcoming', '/finances/calendar': 'subscriptions', '/finances/history': 'history' }
const relationshipWorkspace = computed(() => route.path === '/relationships' || route.path.startsWith('/relationships/'))
const financeWorkspace = computed(() => route.path === '/finances' || route.path.startsWith('/finances/'))
const mode = computed(() => sectionModes[route.path.replace(/\/$/, '')])
</script>
<template>
  <AuthGate><VaultWorkspace :mode="mode" :finance-workspace="financeWorkspace" :relationship-workspace="relationshipWorkspace"><slot /></VaultWorkspace></AuthGate>
</template>
