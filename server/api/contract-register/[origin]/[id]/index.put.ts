import { z } from 'zod'
import { standaloneContractSchema } from '../../../../../shared/utils/contract-register'
import { registryId, registryOrigin, writeRegistryContract } from '../../../../utils/contract-register'
export default defineEventHandler(async event=>{
 await requireProjectsUser(event)
 if(registryOrigin(event)!=='standalone')throw createError({statusCode:403,message:'Проектный договор редактируется в своём проекте.'})
 const {revision,...body}=await sharedBody(event,standaloneContractSchema.safeExtend({revision:z.number().int().positive()}))
 return writeRegistryContract(event,registryId(event),revision,body)
})
