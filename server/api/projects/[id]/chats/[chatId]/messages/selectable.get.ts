export default defineEventHandler(async event=>{
 const {context,project,chat}=await projectChatContext(event)
 return chatRpc(context,'chat_selectable',{p_project:project,p_chat:chat})
})
