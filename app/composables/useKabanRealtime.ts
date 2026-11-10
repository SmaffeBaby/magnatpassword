import {RefreshQueue} from '~~/shared/utils/refresh-queue'
import {createId} from '~/utils/browser'
import type {RealtimeChannel} from '@supabase/supabase-js'
export function useKabanRealtime(changed:()=>Promise<void>,paused:()=>boolean){
 const client=useNuxtApp().$supabase,auth=useAuthStore(),vault=useVaultStore(),connected=ref(false)
 let channel:RealtimeChannel|null=null,stopped=false,epoch=0
 const queue=new RefreshQueue(changed,()=>paused()||!vault.unlocked||!auth.user)
 watch(paused,value=>{if(!value)queue.resume()})
 onMounted(()=>{
  watch([()=>auth.user?.id,()=>vault.unlocked],async([id,unlocked])=>{
   const attempt=++epoch;connected.value=false
   const previous=channel;channel=null;if(previous)await client.removeChannel(previous)
   if(attempt!==epoch||!id||!unlocked||stopped)return
   channel=client.channel(`kaban-${id}-${createId()}`)
    .on('postgres_changes',{event:'*',schema:'public',table:'kaban_live',filter:`user_id=eq.${id}`},()=>{if(attempt===epoch)queue.request()})
    .subscribe(status=>{if(attempt!==epoch)return;connected.value=status==='SUBSCRIBED';if(connected.value)queue.request()})
  },{immediate:true})
 })
 onBeforeUnmount(()=>{stopped=true;epoch++;queue.stop();if(channel)void client.removeChannel(channel)})
 return connected
}
