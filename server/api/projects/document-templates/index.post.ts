import { randomUUID } from 'node:crypto'
import { documentTemplateInputSchema } from '../../../../shared/utils/document-templates'
import { writeDocumentTemplate } from '../../../utils/document-templates'
export default defineEventHandler(async event=>{await requireProjectsUser(event);const body=await sharedBody(event,documentTemplateInputSchema);return writeDocumentTemplate(event,randomUUID(),0,body)})
