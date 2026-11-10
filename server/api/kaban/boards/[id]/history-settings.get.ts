import {kabanId,kabanFailure} from '../../../../utils/kaban'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),id=kabanId(event)
 const {data,error}=await context.client.rpc('kaban_history_settings',{p_actor:context.user.id,p_board:id})
 if(error)kabanFailure(error)
 return data
})
