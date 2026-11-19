<script setup lang="ts">
import ProjectsWorkspace from '~/components/ProjectsPage/ProjectsWorkspace.vue'
definePageMeta({ layout: 'home', fillWorkspace: true })
const route = useRoute()
</script>
<template><ProjectsWorkspace :project-id="String(route.params.id)" section="spaces"/></template>
