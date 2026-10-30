import { documentTemplateUpdateSchema } from '../../../../shared/utils/document-templates'
import { documentTemplateId,writeDocumentTemplate } from '../../../utils/document-templates'
export default defineEventHandler(async event=>{await requireProjectsUser(event);const {revision,...input}=await sharedBody(event,documentTemplateUpdateSchema);return writeDocumentTemplate(event,documentTemplateId(event),revision,input)})
