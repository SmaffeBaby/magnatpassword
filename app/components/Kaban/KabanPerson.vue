<script setup lang="ts">
import PersonAvatar from '../PersonAvatar.vue'
import type { TeamPerson, TeamUnit } from '~~/shared/types/team'
import { unitPath } from '~~/shared/utils/team'
const props=defineProps<{person?:TeamPerson;units:TeamUnit[];label?:string}>()
const roles=computed(()=>props.person?.roleIds.map(id=>unitPath(id,props.units).filter(unit=>unit.kind==='department'||unit.kind==='role').map(unit=>unit.name).join(' · ')).filter(Boolean)??[])
</script>
<template><NuxtLink v-if="person" :to="`/team/${person.id}`" class="kaban-person"><PersonAvatar :name="person.fullName||person.email" :src="person.avatarUrl"/><span><small v-if="label">{{label}}</small><strong>{{person.fullName||person.email}}</strong><small v-for="role in roles" :key="role">{{role}}</small><small v-if="!roles.length">{{person.workEmail||person.email}}</small></span><UIcon name="i-lucide-arrow-up-right"/></NuxtLink><p v-else class="kaban-person-missing">Участник недоступен</p></template>
<style scoped>.kaban-person{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:14px;min-width:0;background:#fff}.kaban-person>span{flex:1;min-width:0}.kaban-person strong,.kaban-person small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kaban-person strong{font-size:13px;font-weight:600;color:#334155}.kaban-person small{font-size:11px;line-height:1.6;color:#8291a6}.kaban-person>.iconify{color:#94a3b8;flex-shrink:0}.kaban-person-missing{font-size:12px;color:#94a3b8}</style>
