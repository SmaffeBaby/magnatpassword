export default defineEventHandler(async event => {
  const context = await requireSharedUser(event)
  let row = await personalRow(context)
  if (!row) {
    const empty = { version: 1 as const, entries: [], categories: [{ id: 'work', name: 'Работа', icon: 'i-lucide-briefcase-business', color: '#6366f1' }, { id: 'personal', name: 'Личное', icon: 'i-lucide-user-round', color: '#10b981' }] }
    const { error } = await context.client.from('vaults').upsert({ user_id: context.user.id, salt: personalSalt(), encryption_mode: 'server', encrypted_data: sealPersonal(event, empty, context.user.id) }, { onConflict: 'user_id', ignoreDuplicates: true })
    if (error) throw createError({ statusCode: 503, statusMessage: 'Personal vault unavailable', message: 'Не удалось создать личное хранилище' })
    row = await personalRow(context)
  }
  if (row.encryption_mode === 'client') return { migrationRequired: true as const }
  return { migrationRequired: false as const, data: openPersonal(event, row), revision: row.revision }
})
