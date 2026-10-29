import { randomUUID } from 'node:crypto'
import { projectContractWriteSchema } from '../../../../../shared/utils/project-contracts'
export default defineEventHandler(async event=>{await requireProjectsUser(event);const body=await sharedBody(event,projectContractWriteSchema);return saveProjectContract(event,randomUUID(),0,body.estimateRevision,body.contract)})
