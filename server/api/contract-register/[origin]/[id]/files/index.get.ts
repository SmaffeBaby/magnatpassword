import { registryFiles } from '../../../../../utils/contract-register'
export default defineEventHandler(async event=>{const result=await registryFiles(event);return {files:result.files,revision:result.revision}})
