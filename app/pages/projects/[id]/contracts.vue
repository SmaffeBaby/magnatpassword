<script setup lang="ts">
import ProjectsWorkspace from '~/components/ProjectsPage/ProjectsWorkspace.vue'
definePageMeta({layout:'home'})
const route=useRoute(),projectId=computed(()=>String(route.params.id||''))
</script>
<template><ProjectsWorkspace :project-id="projectId" section="contracts"/></template>
