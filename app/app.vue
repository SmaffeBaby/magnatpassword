<script setup lang="ts">
import { useAppSession } from '~/composables/auth/useAppSession'

useAppSession()
const serviceTabs = useServiceTabsStore()
</script>
<template><UApp><NuxtLayout><NuxtPage :page-key="route => `${serviceTabs.activeId}:${route.path}`" /></NuxtLayout><ReleasesNativeAppUpdates/><ClientOnly><EditorsOfficeHost/><ChatsChatDrawer/><AssistantLocalAssistant/></ClientOnly></UApp></template>
