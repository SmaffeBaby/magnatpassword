<script setup lang="ts">
import PasswordCard from './PasswordPage/PasswordCard.vue'
import FinanceCard from './FinanceCard.vue'
import RelationshipsCard from './RelationshipsCard.vue'
import ProjectsCard from './ProjectsPage/ProjectsCard.vue'
import TeamCard from './TeamCard.vue'
import KabanCard from './KabanCard.vue'
const projectAccess=useProjectAccess()
const route=useRoute(),navigation=ref<HTMLElement|null>(null)
let resizeObserver:ResizeObserver|undefined
async function revealActive(){await nextTick();const nav=navigation.value,link=nav?.querySelector<HTMLElement>('.router-link-active');if(nav&&link){const navRect=nav.getBoundingClientRect(),linkRect=link.getBoundingClientRect();nav.scrollLeft+=linkRect.left-navRect.left-(nav.clientWidth-link.clientWidth)/2}}
onMounted(()=>{void revealActive();resizeObserver=new ResizeObserver(()=>{void revealActive()});if(navigation.value)resizeObserver.observe(navigation.value)})
onBeforeUnmount(()=>resizeObserver?.disconnect())
watch([()=>route.path,()=>projectAccess.data.value?.allowed],revealActive)
</script>
<template><nav ref="navigation" class="workspace-apps" aria-label="Приложения"><PasswordCard/><FinanceCard/><RelationshipsCard/><ProjectsCard v-if="projectAccess.data.value?.allowed"/><TeamCard/><KabanCard/></nav></template>
