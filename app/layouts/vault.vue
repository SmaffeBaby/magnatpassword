<script setup lang="ts">
import AuthGate from '../components/AuthGate.vue'
import VaultWorkspace from '../components/VaultWorkspace.vue'

const route = useRoute()
const sectionModes: Record<string, string> = { '/categories': 'categories', '/finances': 'finances', '/subscriptions': 'upcoming' }
const mode = computed(() => sectionModes[route.path.replace(/\/$/, '')])
</script>
<template>
  <AuthGate><VaultWorkspace :mode="mode"><slot /></VaultWorkspace></AuthGate>
</template>
