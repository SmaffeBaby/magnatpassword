import { documentTemplateId,readDocumentTemplate } from '../../../utils/document-templates'
export default defineEventHandler(event=>readDocumentTemplate(event,documentTemplateId(event)))
