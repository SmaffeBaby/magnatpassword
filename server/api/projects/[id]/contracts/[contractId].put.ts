import { projectContractUpdateSchema } from '../../../../../shared/utils/project-contracts'
export default defineEventHandler(async event=>{await requireProjectsUser(event);const body=await sharedBody(event,projectContractUpdateSchema);return saveProjectContract(event,contractId(event),body.revision,body.estimateRevision,body.contract)})
