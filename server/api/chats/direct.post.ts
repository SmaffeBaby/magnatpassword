import {z} from 'zod'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),body=await sharedBody(event,z.object({userId:z.uuid()}).strict())
 return chatRpc(context,'chat_direct_create',{p_peer:body.userId})
})
