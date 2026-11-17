import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Credential } from '../../../../../shared/types/vault'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), project = projectId(event)
  await readProjectPasswords(context, project)
  const body = await sharedBody(event, z.union([
    z.object({ source: projectPasswordSourceSchema }).strict(),
    z.object({ fields: projectPasswordFieldsSchema }).strict()
  ]))
  const id = randomUUID(), now = new Date().toISOString()
  let entry: Credential
  if ('source' in body) {
    const candidate = (await projectPasswordCandidates(event, context)).find(item => item.source.kind === body.source.kind && item.source.sourceId === body.source.sourceId && item.source.entryId === body.source.entryId)
    if (!candidate) throw createError({ statusCode: 404, message: 'Пароль не найден в доступных вам хранилищах' })
    const source = candidate.entry
    entry = { id, title: source.title, url: source.url, username: source.username, password: source.password, notes: source.notes,
      accounts: source.accounts, images: source.images, customFields: source.customFields?.filter(field => field.type !== 'subscription'),
      categoryId: '', favorite: false, createdAt: now, updatedAt: now }
  } else entry = { ...body.fields, id, categoryId: '', favorite: false, createdAt: now, updatedAt: now }
  return mutateProjectPassword(context, project, id, 0, 'create', sealSharedVault(credentialSchema.parse(entry), sharedSecret(event), `project-password:${project}:${id}`, 1))
})
