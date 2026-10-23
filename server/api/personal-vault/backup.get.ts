export default defineEventHandler(async event => {
  const context = await requireSharedUser(event), row = await personalRow(context)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Vault not found' })
  let encrypted = row.encrypted_data
  if (row.encryption_mode === 'server') {
    const cards = (await visibleSharedCards(event, context)).filter(card => !card.vaultIds.length)
    if (cards.length) {
      const data = openPersonal(event, row)
      encrypted = sealPersonal(event, {
        ...data,
        entries: [...data.entries, ...cards.filter(card => !card.archived).map(card => card.entry)],
        subscriptionPayments: [...(data.subscriptionPayments ?? []), ...cards.flatMap(card => card.payments)]
      }, context.user.id)
    }
  }
  return { format: row.encryption_mode === 'server' ? 'magnat-password-server-v1' : 'magnat-password-v1', owner: context.user.id, salt: row.salt, encrypted_data: encrypted, revision: row.revision, updated_at: row.updated_at, encryption_mode: row.encryption_mode }
})
