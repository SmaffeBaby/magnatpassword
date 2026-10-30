import { closingWriteSchema } from '../../../../../shared/utils/project-closing'
import { saveProjectClosing } from '../../../../utils/project-closing'
export default defineEventHandler(async event=>{
 await requireProjectsUser(event)
 const body=await sharedBody(event,closingWriteSchema)
 return saveProjectClosing(event,body.revision,body.estimateRevision,body.executionRevision,body.state)
})
