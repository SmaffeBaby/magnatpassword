import {z} from 'zod'
import {kabanFailure,kabanId} from '../../../../utils/kaban'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),id=kabanId(event)
 const body=await sharedBody(event,z.object({boardId:z.uuid(),revision:z.number().int().positive(),closed:z.boolean()}).strict())
 const {error}=await context.client.rpc('kaban_task_mutate',{p_actor:context.user.id,p_board:body.boardId,p_id:id,p_revision:body.revision,p_payload:{archive:body.closed}})
 if(error)kabanFailure(error)
 return {ok:true}
})
