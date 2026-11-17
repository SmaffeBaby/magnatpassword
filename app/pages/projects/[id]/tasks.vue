<script setup lang="ts">
import KabanWorkspace from '~/components/Kaban/KabanWorkspace.vue'
definePageMeta({layout:'home'})
const route=useRoute()
</script>
<template><section class="projects-workspace"><NuxtLink :to="`/projects/${route.params.id}`" class="project-list-back">← К проекту</NuxtLink><KabanWorkspace :key="String(route.params.id)" :project-id="String(route.params.id)"/></section></template>
