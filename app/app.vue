<script setup lang="ts">
import { useAppSession } from './composables/useAppSession'

useAppSession()
</script>
<template><UApp><NuxtLayout><NuxtPage /></NuxtLayout><NativeAppUpdates/><ClientOnly><LocalAssistant/></ClientOnly></UApp></template>
