import { closingExportSchema,renderClosingDocument } from '../../../../../shared/utils/project-closing'
import { projectClosing } from '../../../../utils/project-closing'
import { renderExecutionFile } from '../../../../utils/project-execution'
export default defineEventHandler(async event=>{
 const snapshot=await projectClosing(event),body=await sharedBody(event,closingExportSchema)
 let document
 try{document=renderClosingDocument(snapshot,body.contractId,body.kind)}catch(error){throw createError({statusCode:400,message:error instanceof Error?error.message:'Документ недоступен'})}
 const result=await renderExecutionFile(document,body.format)
 setHeader(event,'Content-Type',body.format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
 setHeader(event,'Content-Disposition',`attachment; filename="${body.kind}_${body.contractId}.${body.format}"; filename*=UTF-8''${encodeURIComponent(document.title.replace(/[\\/:*?"<>|\r\n]/g,'-'))}.${body.format}`)
 return result
})
