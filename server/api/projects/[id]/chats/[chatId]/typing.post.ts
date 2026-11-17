import {z} from 'zod'
export default defineEventHandler(async event => {
 const {context,project,chat}=await projectChatContext(event)
 const body=await sharedBody(event,z.object({active:z.boolean()}).strict())
 await chatRpc(context,'chat_typing_set',{p_project:project,p_chat:chat,p_active:body.active})
 return {ok:true}
})
