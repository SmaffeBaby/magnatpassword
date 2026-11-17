<script setup lang="ts">
import ProjectsWorkspace from '~/components/ProjectsPage/ProjectsWorkspace.vue'
definePageMeta({layout:'home'})
const route=useRoute()
</script>
<template><ProjectsWorkspace :project-id="String(route.params.id)" section="document-templates"/></template>
