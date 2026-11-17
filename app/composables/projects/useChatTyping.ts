import {useQuery} from '@tanstack/vue-query'
export function useChatTyping(projectId:MaybeRefOrGetter<string>,chatId:MaybeRefOrGetter<string>,enabled:MaybeRefOrGetter<boolean>) {
 const auth=useAuthStore()
 const people=useQuery({queryKey:computed(()=>['account',auth.user?.id,'project-chats',toValue(projectId),toValue(chatId),'typing']),queryFn:({signal})=>sharedRequest<string[]>(`/api/projects/${toValue(projectId)}/chats/${toValue(chatId)}/typing`,{signal}),enabled:computed(()=>!!auth.user&&!!toValue(chatId)&&toValue(enabled)),refetchInterval:2500,retry:false})
 let last=0,activePath='',idle:ReturnType<typeof setTimeout>|undefined,chain=Promise.resolve()
 function notify(path:string,active:boolean){chain=chain.catch(()=>{}).then(async()=>{await sharedRequest(path,{method:'POST',body:{active}})}).catch(()=>{})}
 function stop(){if(idle)clearTimeout(idle);if(activePath)notify(activePath,false);activePath='';last=0}
 function input(hasText:boolean){if(!hasText||!auth.user||!toValue(enabled)||document.visibilityState!=='visible'){stop();return};const path=`/api/projects/${toValue(projectId)}/chats/${toValue(chatId)}/typing`;if(activePath&&activePath!==path)stop();if(Date.now()-last>=3000||!activePath){activePath=path;last=Date.now();notify(path,true)};if(idle)clearTimeout(idle);idle=setTimeout(stop,4000)}
 const visibility=()=>{if(document.visibilityState!=='visible')stop()}
 watch(()=>toValue(chatId),stop)
 onMounted(()=>document.addEventListener('visibilitychange',visibility))
 onBeforeUnmount(()=>{stop();document.removeEventListener('visibilitychange',visibility)})
 return {people,input,stop}
}
