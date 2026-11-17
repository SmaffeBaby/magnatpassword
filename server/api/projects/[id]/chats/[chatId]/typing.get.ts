export default defineEventHandler(async event => {
 const {context,project,chat}=await projectChatContext(event)
 return await chatRpc(context,'chat_typing_get',{p_project:project,p_chat:chat}) as string[]
})
