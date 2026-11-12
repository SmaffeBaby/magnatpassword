<script setup lang="ts">
import ProjectsWorkspace from '~/components/ProjectsPage/ProjectsWorkspace.vue'
definePageMeta({ layout: 'home' })
const route = useRoute()
if(route.query.tab === 'contract-register') await navigateTo('/contract-register', { replace: true })
</script>
<template><ProjectsWorkspace /></template>
