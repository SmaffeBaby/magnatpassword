<script setup lang="ts">
import { initials } from '~~/shared/utils/team'
const props=defineProps<{name:string;src?:string;large?:boolean}>()
const failed=ref(false)
watch(()=>props.src,()=>{failed.value=false})
</script>
<template><span :class="['person-avatar',{large}]"><img v-if="src&&!failed" :src="src" alt="" @error="failed=true"/><span v-else>{{ initials(name)||'?' }}</span></span></template>
