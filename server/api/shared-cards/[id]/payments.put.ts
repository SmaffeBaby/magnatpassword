import { z } from 'zod'
export default defineEventHandler(async event => {
  const context = await requireCard(event)
  const body = await sharedBody(event, z.discriminatedUnion('action', [
    z.object({ action: z.literal('save'), revision: revisionSchema, payment: paymentSchema }).strict(),
    z.object({ action: z.literal('delete'), revision: revisionSchema, paymentId: z.uuid() }).strict()
  ]))
  const payments = structuredClone(context.card.payments)
  if (body.action === 'save') {
    const payment = body.payment
    if (payment.entryId !== context.card.entry.id) throw createError({ statusCode: 400, message: 'Оплата относится к другой карточке' })
    const index = payments.findIndex(item => item.id === payment.id)
    const field = context.card.entry.customFields?.find(field => field.id === payment.fieldId && field.type === 'subscription')
    if (index < 0 && !field) throw createError({ statusCode: 404, message: 'Подписка не найдена' })
    if (index >= 0 && payments[index]!.fieldId !== payment.fieldId) throw createError({ statusCode: 400, message: 'Нельзя перенести оплату в другую подписку' })
    if (index >= 0) payments[index] = payment
    else payments.push(payment)
    if (payments.length > 20000) throw createError({ statusCode: 400, message: 'Достигнут предел записей истории' })
  } else {
    const index = payments.findIndex(item => item.id === body.paymentId)
    if (index < 0) throw createError({ statusCode: 404, message: 'Оплата не найдена' })
    payments.splice(index, 1)
  }
  return mutateCard(context, context.id, body.revision, { encryptedData: sealCard(event, context.id, context.card.entry, payments) })
})
