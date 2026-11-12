import { z } from 'zod'
import { assistantFetch } from '../../utils/assistant-context'
import { assistantEditRecords, credentialEditTargets, assistantProjectTargets } from '../../utils/assistant-edit'
import type { ProjectInputs } from '../../../shared/types/project-inputs'
import type { ProjectEstimate } from '../../../shared/types/estimate'
export default defineEventHandler(async event => {
  await requireSharedUser(event)
  const body = await sharedBody(event, z.object({ kind: z.enum(['credential', 'project', 'relation']), targetId: z.string().max(160), field: z.string().max(160), value: z.string().max(10000), revision: z.number().int().min(0), operation: z.enum(['primary', 'add', 'remove']).optional() }).strict())
  const conflict = () => { throw createError({ statusCode: 409, message: 'Запись изменилась. Загрузите черновик заново.' }) }
  if (body.kind === 'project') {
    const projectId = body.targetId.split('/')[0]!
    if (!z.uuid().safeParse(projectId).success) throw createError({ statusCode: 400, message: 'Некорректный проект.' })
    const target = (await assistantProjectTargets(event, projectId)).find(t => t.id === body.targetId)
    if (!target || !target.fields.some(f => f.id === body.field)) throw createError({ statusCode: 403, message: 'Поле проекта недоступно.' })
    if (target.revision !== body.revision) conflict()
    if (body.targetId === projectId) await assistantFetch(event, `/api/projects/${projectId}`, { method: 'PUT', body: { revision: body.revision, name: body.value } })
    else if (body.targetId.split('/')[1] === 'input') {
      const inputs = await assistantFetch<ProjectInputs>(event, `/api/projects/${projectId}/input-data`)
      if (inputs.revision !== body.revision) conflict()
      const card = inputs.cards.find(c => c.id === body.targetId.split('/')[2])!
      if (body.field.startsWith('custom/')) card.fields.find(f => f.id === body.field.slice(7))!.value = body.value
      else Object.assign(card, { [body.field]: body.value })
      await assistantFetch(event, `/api/projects/${projectId}/input-data`, { method: 'PUT', body: { revision: body.revision, id: card.id, title: card.title, description: card.description, fields: card.fields } })
    } else {
      const estimate = await assistantFetch<ProjectEstimate>(event, `/api/projects/${projectId}/estimate`)
      if (estimate.revision !== body.revision) conflict()
      const itemId = body.targetId.split('/')[2]
      const record = itemId ? estimate.items.find(i => i.id === itemId)! : estimate.details
      const key = body.field as keyof typeof record
      const value = typeof record[key] === 'number' ? Number(body.value.replace(',', '.')) : body.value
      if (typeof value === 'number' && (!body.value.trim() || !Number.isFinite(value))) throw createError({ statusCode: 400, message: 'Введите число.' })
      Object.assign(record, { [body.field]: value })
      await assistantFetch(event, `/api/projects/${projectId}/estimate`, { method: 'PUT', body: { revision: body.revision, ...(itemId ? { items: estimate.items } : { details: estimate.details }) } })
    }
  } else {
    const records = await assistantEditRecords(event)
    const source = records.find(r => r.id === body.targetId && r.writable)
    if (!source) throw createError({ statusCode: 403, message: 'Карточка недоступна для изменения.' })
    if (source.revision !== body.revision) conflict()
    const entry = structuredClone(source.entry)
    if (body.kind === 'credential') {
      if (!credentialEditTargets([source])[0]?.fields.some(f => f.id === body.field)) throw createError({ statusCode: 400, message: 'Поле недоступно.' })
      if (body.field.startsWith('custom/')) entry.customFields!.find(f => f.id === body.field.slice(7))!.value = body.value
      else Object.assign(entry, { [body.field]: body.value })
    } else {
      const field = [entry.financeSubscription, ...(entry.customFields || [])].find(f => f?.id === body.field && f.subscription)
      const target = records.find(r => r.id === body.value && !r.entry.kind)
      if (!field?.subscription || !target) throw createError({ statusCode: 403, message: 'Подписка или пароль недоступны.' })
      let vaultId = target.id.split('/')[0]!, sharedCardId: string | undefined
      if (vaultId === 'card') {
        sharedCardId = target.id.split('/')[1]!
        const workspace = await assistantFetch<{ cards: { id: string; vaultIds: string[] }[] }>(event, '/api/workspace')
        vaultId = workspace.cards.find(c => c.id === sharedCardId)?.vaultIds[0] || 'personal'
      }
      const ref = { vaultId, entryId: target.entry.id, ...(sharedCardId ? { sharedCardId } : {}) }
      const same = (r: typeof ref) => !!sharedCardId && r.sharedCardId === sharedCardId || r.entryId === ref.entryId && r.vaultId === ref.vaultId
      const sub = field.subscription
      if (body.operation === 'remove') { if (sub.primaryCard && same(sub.primaryCard)) delete sub.primaryCard; sub.linkedCards = (sub.linkedCards || []).filter(r => !same(r)) }
      else if (body.operation === 'add') sub.linkedCards = [...(sub.linkedCards || []).filter(r => !same(r)), ref]
      else { sub.primaryCard = ref; sub.linkedCards = (sub.linkedCards || []).filter(r => !same(r)) }
    }
    entry.updatedAt = new Date().toISOString()
    await source.save(entry)
  }
  return { message: body.kind === 'relation' ? 'Связь подписки с паролем сохранена.' : 'Изменение сохранено.' }
})
