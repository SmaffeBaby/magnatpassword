import { executionWriteSchema } from '../../../../../shared/utils/project-execution'
import { saveProjectExecution } from '../../../../utils/project-execution'
export default defineEventHandler(async event=>{
 await requireProjectsUser(event)
 const body=await sharedBody(event,executionWriteSchema)
 return saveProjectExecution(event,body.revision,body.estimateRevision,body.state)
})
