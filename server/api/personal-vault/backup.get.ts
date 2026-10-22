export default defineEventHandler(async event => {
  const context = await requireSharedUser(event), row = await personalRow(context)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Vault not found' })
  return { format: row.encryption_mode === 'server' ? 'magnat-password-server-v1' : 'magnat-password-v1', owner: context.user.id, salt: row.salt, encrypted_data: row.encrypted_data, revision: row.revision, updated_at: row.updated_at, encryption_mode: row.encryption_mode }
})
