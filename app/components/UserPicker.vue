<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import PersonAvatar from './PersonAvatar.vue'
import { normalizePeopleQuery } from '~~/shared/utils/team'
import type { TeamPerson } from '~~/shared/types/team'
const person=defineModel<TeamPerson|null>({default:null})
const props=defineProps<{disabled?:boolean;admin?:boolean}>()
const auth=useAuthStore(),query=ref(''),debounced=ref(''),expanded=ref(true)
const listId=useId()
let timer:ReturnType<typeof setTimeout>|undefined
watch(query,value=>{clearTimeout(timer);expanded.value=true;timer=setTimeout(()=>{debounced.value=normalizePeopleQuery(value)},300)})
const search=useQuery({queryKey:computed(()=>['account',auth.user?.id,props.admin?'admin-team-search':'team-search',debounced.value]),queryFn:({signal})=>sharedRequest<TeamPerson[]>(`${props.admin?'/api/admin/team/search':'/api/team/search'}?q=${encodeURIComponent(debounced.value)}`,{signal}),enabled:computed(()=>!!auth.user&&!person.value&&debounced.value.length>=2),staleTime:30000})
function choose(value:TeamPerson){person.value=value;expanded.value=false}
function clear(){person.value=null;query.value='';debounced.value='';expanded.value=true}
watch(person,(value,previous)=>{if(!value&&previous)clear()})
onBeforeUnmount(()=>clearTimeout(timer))
</script>
<template><div class="user-picker"><div v-if="person" class="user-picker-selected"><PersonAvatar :name="person.fullName||person.email" :src="person.avatarUrl"/><span><strong>{{ person.fullName||person.email }}<span v-if="person.isHidden" class="team-hidden-badge">Скрыт</span></strong><small>{{ person.workEmail||person.email }}<template v-if="person.telegram"> · @{{ person.telegram }}</template></small></span><UButton color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Убрать выбранного участника" :disabled="disabled" @click="clear"/></div><template v-else><UInput v-model="query" class="w-full" icon="i-lucide-search" placeholder="ФИО, email или @telegram" :disabled="disabled" :loading="search.isFetching.value" role="combobox" :aria-expanded="expanded&&!!search.data.value?.length" :aria-controls="listId" aria-autocomplete="list" @keydown.esc="expanded=false" @keydown.down.prevent="($event.currentTarget as HTMLElement).closest('.user-picker')?.querySelector<HTMLButtonElement>('.user-picker-option')?.focus()"/><div v-if="expanded&&debounced.length>=2" :id="listId" class="user-picker-results" role="listbox"><button v-for="result in search.data.value??[]" :key="result.id" type="button" role="option" :aria-selected="false" class="user-picker-option" @click="choose(result)"><PersonAvatar :name="result.fullName||result.email" :src="result.avatarUrl"/><span><strong>{{ result.fullName||result.email }}<span v-if="result.isHidden" class="team-hidden-badge">Скрыт</span></strong><small>{{ result.workEmail||result.email }}<template v-if="result.telegram"> · @{{ result.telegram }}</template></small></span></button><p v-if="search.error.value">Не удалось выполнить поиск. Попробуйте ещё раз.</p><p v-else-if="!search.isFetching.value&&!search.data.value?.length">Зарегистрированные участники не найдены.</p></div></template></div></template>
