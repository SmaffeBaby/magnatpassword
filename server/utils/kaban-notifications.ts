import type { H3Event } from 'h3'
import type { AppNotification } from '../../shared/types/subscriptions'
import type { KabanFile } from '../../shared/types/kaban'
import { kabanNotificationText } from '../../shared/utils/kaban-notifications'
import { readKabanTaskData, kabanFailure } from './kaban'
import { openSharedVault } from './shared-crypto'

export async function taskNotifications(event:H3Event,context:Awaited<ReturnType<typeof requireSharedUser>>,records:any[]):Promise<AppNotification[]> {
 const keys=records.map(row=>row.kaban_key).filter(Boolean)
 if(!keys.length)return []
 const {data,error}=await context.client.rpc('kaban_notification_events',{p_actor:context.user.id,p_keys:keys})
 if(error)kabanFailure(error)
 const rows:any[]=data||[],ids=[...new Set<string>(rows.flatMap(row=>[row.actor_id,row.task_snapshot?.creator_id,...(row.before_data?.participant_ids||[]),...(row.after_data?.participant_ids||[]),...(row.before_data?.closer_ids||[]),...(row.after_data?.closer_ids||[])]).filter(Boolean))]
 const profiles=ids.length?await context.client.from('team_profiles').select('user_id,full_name').in('user_id',ids):{data:[],error:null}
 if(profiles.error)kabanFailure(profiles.error)
 const name=(id:string)=>profiles.data?.find(person=>person.user_id===id)?.full_name||'Участник'
 return records.flatMap(record=>{
  const row=rows.find(item=>item.activity_key===record.kaban_key)
  if(!row)return []
  const previous=row.entity==='task'&&row.before_data?readKabanTaskData(event,row.before_data):null
  const next=row.entity==='task'&&row.after_data?readKabanTaskData(event,row.after_data):row.task_snapshot?readKabanTaskData(event,row.task_snapshot):null
  let fileName=''
  if(row.entity==='file')fileName=openSharedVault<KabanFile>((row.after_data||row.before_data).encrypted_data,sharedSecret(event),`kaban-file:${row.task_id}:${row.entity_id}`,1).name
  const text=kabanNotificationText(row,previous,next,fileName,name)
  if(!text)return []
  const taskTitle=next?.title||previous?.title||'Задача',actor=name(row.actor_id),creator=name(row.task_snapshot?.creator_id||row.after_data?.creator_id||row.before_data?.creator_id)
  return [{id:record.id,kind:'kaban' as const,title:`${text.action}: ${taskTitle}`,message:`${actor} · ${row.vault_name||'Личное хранилище'}`,details:text.details,actorName:actor,creatorName:creator,taskTitle,taskId:row.task_id,available:!!row.task_available,createdAt:record.created_at,readAt:record.read_at,vaultId:(row.task_available?row.target_vault_id:row.vault_id)||'personal',entryId:null,fieldId:null}]
 })
}
