<script setup lang="ts">
import ProjectsWorkspace from '~/components/ProjectsPage/ProjectsWorkspace.vue'
definePageMeta({ layout: 'home' })
const route = useRoute()
const projectId = computed(() => String(route.params.id || ''))
</script>
<template><ProjectsWorkspace :project-id="projectId" section="estimate" /></template>
