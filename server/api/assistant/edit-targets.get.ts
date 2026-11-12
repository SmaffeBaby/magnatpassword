import { assistantEditRecords, credentialEditTargets, assistantProjectTargets } from '../../utils/assistant-edit'
export default defineEventHandler(async event => {
  await requireSharedUser(event)
  const query = getQuery(event)
  if (query.kind === 'project') return { targets: await assistantProjectTargets(event, String(query.projectId || '')), subscriptions: [] }
  const records = await assistantEditRecords(event)
  return { targets: credentialEditTargets(query.kind === 'relation' ? records.filter(r => !r.entry.kind) : records.filter(r => r.writable)), subscriptions: records.filter(r => r.writable).flatMap(r => [r.entry.financeSubscription, ...(r.entry.customFields || [])].filter(f => f?.subscription).map(f => ({ id: `${r.id}/${f!.id}`, label: `${r.label} · ${f!.label}`, revision: r.revision, fields: [] }))) }
})
