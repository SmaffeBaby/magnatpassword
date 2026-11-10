import { z } from 'zod'
import { kabanId, kabanFailure } from '../../../../utils/kaban'
export default defineEventHandler(async event => {
 const context=await requireSharedUser(event),id=kabanId(event)
 const body=await sharedBody(event,z.object({sourceBoardId:z.uuid(),targetBoardId:z.uuid(),revision:z.number().int().positive(),stageId:z.uuid(),categoryIds:z.array(z.string().min(1).max(128)).min(1).max(50),move:z.boolean()}).strict())
 const {error}=await context.client.rpc('kaban_task_place',{p_actor:context.user.id,p_task:id,p_source:body.sourceBoardId,p_target:body.targetBoardId,p_revision:body.revision,p_stage:body.stageId,p_categories:body.categoryIds,p_move:body.move})
 if(error)kabanFailure(error)
 return {ok:true}
})
