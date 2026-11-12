import { randomUUID } from 'node:crypto'
import { standaloneContractSchema } from '../../../shared/utils/contract-register'
import { writeRegistryContract } from '../../utils/contract-register'
export default defineEventHandler(async event=>{
 await requireProjectsUser(event)
 const body=await sharedBody(event,standaloneContractSchema)
 return writeRegistryContract(event,randomUUID(),0,body)
})
