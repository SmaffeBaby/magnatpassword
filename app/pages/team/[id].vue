<script setup lang="ts">
import ProfileView from '~/components/AccountPage/ProfileView.vue'
definePageMeta({ layout: 'home' })
const route = useRoute()
const profileId = computed(() => String(route.params.id))
</script>
<template><ProfileView :user-id="profileId" /></template>
