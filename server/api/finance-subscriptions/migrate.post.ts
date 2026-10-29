import { extractFinanceSubscriptions } from '../../../shared/utils/finance-subscriptions'
import { loadCategoryAccess, canAccessCategoryEntry, accessTokens } from '../../utils/category-access'
import { sealSharedVault } from '../../utils/shared-crypto'
import type { VaultData } from '../../../shared/types/vault'

export default defineEventHandler(async event => {
  const context = await requireSharedUser(event), access = await loadCategoryAccess(context, event)
  let migrated = 0
  async function persist(source: string, id: string, revision: number, encryptedData: unknown, children: ReturnType<typeof extractFinanceSubscriptions>['children']) {
    if (!children.length) return
    const { error } = await context.client.rpc('finance_extract_subscriptions', {
      p_actor: context.user.id, p_source: source, p_id: id, p_revision: revision,
      p_payload: { encryptedData, accessTokens: accessTokens(access), children: children.map(child => ({ id: child.id, encryptedData: sealCard(event, child.id, child.entry, child.payments) })) }
    })
    if (error) throw createError({ statusCode: error.message.includes('REVISION_CONFLICT') ? 409 : 503, message: 'Не удалось перенести подписки. Обновите страницу и повторите.' })
    migrated += children.length
  }
  for (const card of await visibleSharedCards(event, context, access)) {
    if (card.archived || !card.canEdit || card.entry.kind === 'subscription') continue
    const result = extractFinanceSubscriptions(card.entry, card.payments, card.vaultIds[0] ?? 'personal', card.id)
    await persist('card', card.id, card.revision, sealCard(event, card.id, result.entry, result.payments), result.children)
  }
  function extract(data: VaultData, vaultId: string, allowed: (entry: VaultData['entries'][number]) => boolean) {
    const next = structuredClone(data), children: ReturnType<typeof extractFinanceSubscriptions>['children'] = []
    next.entries = next.entries.map(entry => {
      if (entry.kind === 'subscription' || !allowed(entry)) return entry
      const result = extractFinanceSubscriptions(entry, next.subscriptionPayments ?? [], vaultId)
      next.subscriptionPayments = result.payments; children.push(...result.children)
      return result.entry
    })
    return { next, children }
  }
  const personal = await personalRow(context)
  if (personal?.encryption_mode === 'server') {
    const result = extract(openPersonal(event, personal), 'personal', () => true)
    await persist('personal', context.user.id, personal.revision, sealPersonal(event, result.next, context.user.id), result.children)
  }
  for (const grant of access.filter(grant => grant.role !== 'viewer')) {
    const { data: row, error } = await context.client.from('shared_vaults').select('*').eq('id', grant.vaultId).single()
    if (error || !row) throw createError({ statusCode: 503, message: 'Не удалось загрузить хранилище' })
    const result = extract(decodeShared(event, row), row.id, entry => canAccessCategoryEntry(entry, grant.categoryIds))
    await persist('vault', row.id, row.revision, sealSharedVault(result.next, sharedSecret(event), row.id, row.key_epoch), result.children)
  }
  return { migrated }
})
