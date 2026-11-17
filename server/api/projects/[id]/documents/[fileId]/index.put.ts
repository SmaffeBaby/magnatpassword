import { z } from 'zod'
import { documentMetadataSchema } from '../../../../../../shared/utils/project-documents'
import { sealSharedVault } from '../../../../../utils/shared-crypto'
export default defineEventHandler(async event => {
  const id = projectDocumentId(event), current = await readProjectDocuments(event, id)
  const { revision, ...patch } = await sharedBody(event, documentMetadataSchema.extend({ revision: z.number().int().positive() }).strict())
  const { name, type, size, description, tags } = { ...current.files[0]!, ...patch }
  await mutateProjectDocument(current.context, current.project, id, revision, 'metadata', { encryptedData: sealSharedVault({ name, type, size, description, tags }, sharedSecret(event), `project-document:${current.project}:${id}`, 1) })
  return { ok: true }
})
