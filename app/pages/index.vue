<script setup lang="ts">
import ProjectsCard from '~/components/ProjectsPage/ProjectsCard.vue'
import PasswordCard from '~/components/PasswordPage/PasswordCard.vue'
definePageMeta({ layout: 'home' })
const projectAccess = useProjectAccess()
</script>
<template>
  <div class="home-applications"><PasswordCard hero /><ProjectsCard v-if="projectAccess.data.value?.allowed" /></div>
  <UAlert v-if="projectAccess.error.value" class="home-access-error" color="error" title="Не удалось проверить доступ к проектам" :actions="[{ label: 'Повторить', onClick: () => projectAccess.refetch() }]" />
</template>
