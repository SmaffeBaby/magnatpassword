import {z} from 'zod'
import {kabanId,kabanFailure} from '../../../../utils/kaban'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),id=kabanId(event)
 const body=await sharedBody(event,z.object({revision:z.number().int().nonnegative(),throughId:z.string().regex(/^[1-9]\d{0,18}$/).refine(value=>BigInt(value)<=9223372036854775807n)}).strict())
 const {data,error}=await context.client.rpc('kaban_history_clear',{p_actor:context.user.id,p_board:id,p_revision:body.revision,p_through:body.throughId})
 if(error)kabanFailure(error)
 return {removed:data}
})
