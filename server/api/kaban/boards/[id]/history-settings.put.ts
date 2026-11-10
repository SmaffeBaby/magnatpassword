import {z} from 'zod'
import {kabanId,kabanFailure} from '../../../../utils/kaban'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),id=kabanId(event)
 const body=await sharedBody(event,z.object({revision:z.number().int().nonnegative(),count:z.number().int().min(1).max(1000).nullable(),unit:z.enum(['days','months','years'])}).strict())
 const {data,error}=await context.client.rpc('kaban_history_retention_set',{p_actor:context.user.id,p_board:id,p_revision:body.revision,p_count:body.count,p_unit:body.unit})
 if(error)kabanFailure(error)
 return data
})
