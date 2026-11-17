<script setup lang="ts">
import {useQuery} from '@tanstack/vue-query'
import type {TeamDirectory} from '~~/shared/types/team'
const props=defineProps<{source:{projectId:string|null;chatId:string;messageIds:string[]};inPage?:boolean}>()
const emit=defineEmits<{close:[];prepared:[]}>(),hub=useChatHubStore(),auth=useAuthStore()
const tab=ref<'personal'|'projects'>(props.source.projectId?'projects':'personal'),search=ref(''),newPeer=ref(false),busy=ref(false),error=ref('')
const list=computed(()=>hub.items.filter(item=>(tab.value==='personal'?!item.projectId:!!item.projectId)&&`${item.name} ${item.projectName||''}`.toLocaleLowerCase('ru').includes(search.value.toLocaleLowerCase('ru'))))
const people=useQuery({queryKey:computed(()=>['account',auth.user?.id,'forward-people',search.value]),queryFn:({signal})=>sharedRequest<TeamDirectory>(`/api/chats/people?q=${encodeURIComponent(search.value)}`,{signal}),enabled:computed(()=>newPeer.value&&search.value.trim().length>=2),retry:false})
async function forward(projectId:string|null,chatId:string){
 const inPage = !!props.inPage && !!projectId
 hub.prepareForward(props.source,{projectId,chatId},!inPage)
 if(inPage){hub.opened=false;await navigateTo({path:`/projects/${projectId}/chats`,query:{chat:chatId}})}
 emit('prepared');emit('close')
}
async function direct(userId:string){if(busy.value)return;busy.value=true;error.value='';let id='';try{id=(await sharedRequest<{id:string}>('/api/chats/direct',{method:'POST',body:{userId}})).id}catch(failure:any){error.value=failure?.data?.message||'Не удалось создать переписку'}finally{busy.value=false};if(id)await forward(null,id)}
onMounted(()=>{void hub.refresh()})
</script>
<template><UModal :open="true" title="Переслать сообщения" :description="`Сообщений: ${source.messageIds.length}. Выберите беседу: сообщения появятся в черновике. Добавьте комментарий и нажмите «Отправить».`" :dismissible="!busy" @update:open="value=>{if(!value)emit('close')}"><template #body><div class="forward-picker"><div class="flex gap-2"><UButton label="Личные" color="neutral" :variant="tab==='personal'?'soft':'ghost'" @click="tab='personal';newPeer=false"/><UButton label="Проекты" color="neutral" :variant="tab==='projects'?'soft':'ghost'" @click="tab='projects';newPeer=false"/></div><UInput v-model="search" icon="i-lucide-search" :placeholder="newPeer?'Имя или email пользователя':'Поиск беседы'" aria-label="Поиск получателя"/><UButton v-if="tab==='personal'" label="Написать новому пользователю" icon="i-lucide-user-plus" color="neutral" variant="outline" @click="newPeer=!newPeer;search=''"/><UAlert v-if="error" color="error" :description="error"/><template v-if="newPeer"><p v-if="search.length<2">Введите минимум два символа.</p><button v-for="person in people.data.value?.people.filter(person=>person.id!==auth.user?.id)||[]" :key="person.id" :disabled="busy" @click="direct(person.id)">{{person.fullName||person.email}}</button></template><template v-else><button v-for="item in list" :key="item.id" :disabled="busy" @click="forward(item.projectId,item.id)"><strong>{{item.name}}</strong><small>{{item.projectName||'Личная переписка'}}</small></button><p v-if="!list.length&&!hub.loading">Доступных бесед по этому запросу нет.</p></template></div></template></UModal></template>
<style scoped>.forward-picker{display:grid;gap:12px;max-height:65vh;overflow:auto}.forward-picker>button{display:grid;gap:5px;text-align:left;padding:13px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px}.forward-picker>button:hover{background:#f8fafc}.forward-picker small{font-size:11px;color:#94a3b8}</style>
