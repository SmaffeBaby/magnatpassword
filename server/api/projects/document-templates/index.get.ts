import { listDocumentTemplates } from '../../../utils/document-templates'
export default defineEventHandler(event=>listDocumentTemplates(event))
