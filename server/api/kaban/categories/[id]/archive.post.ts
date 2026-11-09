import { z } from 'zod'
import { kabanFailure } from '../../../../utils/kaban'
export default defineEventHandler(async event=>{
 const context=await requireSharedUser(event),id=z.string().min(1).max(128).parse(getRouterParam(event,'id'))
 const body=await sharedBody(event,z.object({boardId:z.uuid(),revision:z.number().int().positive(),closed:z.boolean()}).strict())
 const {error}=await context.client.rpc('kaban_category_mutate',{p_actor:context.user.id,p_board:body.boardId,p_id:id,p_revision:body.revision,p_data:{},p_archive:body.closed})
 if(error)kabanFailure(error)
 return {ok:true}
})
