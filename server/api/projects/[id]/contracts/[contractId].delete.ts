import { z } from 'zod'
export default defineEventHandler(async event=>{await requireProjectsUser(event);const body=await sharedBody(event,z.object({revision:z.number().int().positive(),estimateRevision:z.number().int().min(0)}).strict());return saveProjectContract(event,contractId(event),body.revision,body.estimateRevision)})
