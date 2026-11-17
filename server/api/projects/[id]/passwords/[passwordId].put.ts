import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireProjectsUser(event), project = projectId(event), id = projectPasswordId(event)
  const body = await sharedBody(event, z.object({ revision: revisionSchema, fields: projectPasswordFieldsSchema }).strict())
  const row = (await readProjectPasswords(context, project)).find(item => item.id === id)
  if (!row) throw createError({ statusCode: 404, message: 'Пароль не найден' })
  if (!row.canEdit) throw createError({ statusCode: 403, message: 'Изменять пароль может его автор или создатель проекта' })
  const entry = { ...decodeProjectPassword(event, project, id, row.encryptedData), ...body.fields, updatedAt: new Date().toISOString() }
  return mutateProjectPassword(context, project, id, body.revision, 'update', sealSharedVault(entry, sharedSecret(event), `project-password:${project}:${id}`, 1))
})
