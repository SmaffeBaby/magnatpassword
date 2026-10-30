import { executionExportSchema, renderExecutionDocument } from '../../../../../shared/utils/project-execution'
import { projectExecution, renderExecutionFile } from '../../../../utils/project-execution'
export default defineEventHandler(async event=>{
 const snapshot=await projectExecution(event),body=await sharedBody(event,executionExportSchema)
 let document
 try{document=renderExecutionDocument(snapshot,body.contractId,body.kind,body.appendixId)}catch(error){throw createError({statusCode:400,message:error instanceof Error?error.message:'Документ недоступен'})}
 const result=await renderExecutionFile(document,body.format)
 setHeader(event,'Content-Type',body.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
 setHeader(event,'Content-Disposition',`attachment; filename="${body.kind}_${body.contractId}.${body.format}"; filename*=UTF-8''${encodeURIComponent(document.title.replace(/[\\/:*?"<>|\r\n]/g,'-'))}.${body.format}`)
 return result
})
