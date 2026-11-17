import {z} from 'zod'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),scope=z.object({projectId:z.uuid().nullable(),chatId:z.uuid()}).strict()
 const body=await sharedBody(event,z.object({operationId:z.uuid(),source:scope.extend({messageIds:z.array(z.uuid()).min(1).max(100)}),target:scope}).strict())
 return forwardChatMessages(event,context,body)
})
