<script setup lang="ts">
import { useAppSession } from '~/composables/auth/useAppSession'

useAppSession()
</script>
<template><UApp><NuxtLayout><NuxtPage /></NuxtLayout><ReleasesNativeAppUpdates/><ClientOnly><AssistantLocalAssistant/></ClientOnly></UApp></template>
