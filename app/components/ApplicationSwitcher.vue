<script setup lang="ts">
import PasswordCard from './PasswordPage/PasswordCard.vue'
import FinanceCard from './FinanceCard.vue'
import RelationshipsCard from './RelationshipsCard.vue'
import ProjectsCard from './ProjectsPage/ProjectsCard.vue'
import TeamCard from './TeamCard.vue'
const projectAccess=useProjectAccess()
</script>
<template><nav class="workspace-apps" aria-label="Приложения"><PasswordCard/><FinanceCard/><RelationshipsCard/><ProjectsCard v-if="projectAccess.data.value?.allowed"/><TeamCard/></nav></template>
