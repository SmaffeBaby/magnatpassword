import type { Credential, CredentialLink } from '../types/vault'
import type { SubscriptionPayment } from '../types/subscriptions'
import type { ScopedCredential } from './vault-sources'
import { matchesSubscriptionCard, subscriptionCardReferences } from './subscriptions'

export function extractRelationshipCard(entry: Credential, payments: SubscriptionPayment[], vaultId: string, sharedCardId: string | undefined, finances: ScopedCredential[], createId: () => string = () => crypto.randomUUID()): {entry:Credential;payments:SubscriptionPayment[];children:{id:string;entry:Credential;payments:SubscriptionPayment[]}[]} {
  if (entry.kind || entry.relationshipCardId) return { entry, payments, children: [] }
  const id = createId(), owner: ScopedCredential = { ...entry, sharedCardId, vaultId, vaultName: '' }
  const links: CredentialLink[] = [
    { id: createId(), targetVaultId: vaultId, targetEntryId: entry.id, sourceFieldId: 'card', targetFieldId: 'card', label: 'Пароли сервиса' },
    ...structuredClone(entry.links ?? [])
  ]
  for (const finance of finances) {
    const subscription = finance.financeSubscription?.subscription
    if (!subscription || !subscriptionCardReferences(subscription).some(ref => matchesSubscriptionCard(ref, owner))) continue
    if (!links.some(link => link.targetEntryId === finance.id && (finance.vaultIds ?? [finance.vaultId]).includes(link.targetVaultId))) {
      links.push({ id: createId(), targetVaultId: finance.vaultId, targetEntryId: finance.id, sourceFieldId: 'card', targetFieldId: 'card', label: 'Подписка сервиса' })
    }
  }
  // Secrets stay in Password. The service card only carries public service metadata and references.
  const child: Credential = { id, kind: 'relationship', title: entry.title, url: entry.url, username: '', password: '', notes: '', categoryId: entry.categoryId, categoryIds: entry.categoryIds, favorite: false, createdAt: entry.createdAt, updatedAt: entry.updatedAt, links }
  return { entry: { ...entry, links: [], relationshipCardId: id }, payments, children: [{ id, entry: child, payments: [] as SubscriptionPayment[] }] }
}
