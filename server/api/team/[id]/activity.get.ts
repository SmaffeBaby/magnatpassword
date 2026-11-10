import {z} from 'zod'
import {todayDate} from '../../../../shared/utils/subscriptions'
import {activityChanges} from '../../../../shared/utils/kaban-activity'
import {kabanFailure,readKabanTaskData} from '../../../utils/kaban'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),id=z.uuid().safeParse(getRouterParam(event,'id'))
 if(!id.success)throw createError({statusCode:400,message:'Некорректный участник.'})
 const currentYear=Number(todayDate().slice(0,4))
 const parsed=z.object({year:z.coerce.number().int().min(1970).max(currentYear).default(currentYear),vault:z.union([z.literal('all'),z.literal('personal'),z.uuid()]).default('all')}).strict().safeParse(getQuery(event))
 if(!parsed.success)throw createError({statusCode:400,message:'Некорректный год или хранилище.'})
 const profile=await context.client.from('team_profiles').select('user_id').eq('user_id',id.data).maybeSingle()
 if(profile.error)kabanFailure(profile.error)
 if(!profile.data)throw createError({statusCode:404,message:'Участник не найден.'})
 // Historical encrypted payloads are classified once, then subsequent reads aggregate only small cached counters.
 while(true){
  const batch=await context.client.rpc('kaban_activity_backlog',{p_actor:context.user.id,p_target:id.data,p_year:parsed.data.year})
  if(batch.error)kabanFailure(batch.error)
  if(!batch.data?.length)break
  const rows=batch.data.map((row:any)=>({id:String(row.id),changes:row.entity==='task'&&row.before_data&&row.after_data?activityChanges(readKabanTaskData(event,row.before_data),readKabanTaskData(event,row.after_data),row.entity_id):{}}))
  const cached=await context.client.rpc('kaban_activity_cache',{p_actor:context.user.id,p_rows:rows})
  if(cached.error)kabanFailure(cached.error)
 }
 const result=await context.client.rpc('kaban_activity',{p_actor:context.user.id,p_target:id.data,p_year:parsed.data.year,p_vault:parsed.data.vault})
 if(result.error)kabanFailure(result.error)
 return result.data
})
