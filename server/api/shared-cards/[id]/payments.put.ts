import { z } from 'zod'
import { paymentRollback, syncPaymentPeriod } from '../../../../shared/utils/subscription-finances'
export default defineEventHandler(async event => {
  const context = await requireCard(event, true)
  const body = await sharedBody(event, z.discriminatedUnion('action', [
    z.object({ action: z.literal('save'), revision: revisionSchema, payment: paymentSchema }).strict(),
    z.object({ action: z.literal('delete'), revision: revisionSchema, paymentId: z.uuid(), undoRenewal: z.boolean().optional() }).strict()
  ]))
  const payments = structuredClone(context.card.payments)
  const entry = structuredClone(context.card.entry)
  if (body.action === 'save') {
    const payment = body.payment
    if (payment.entryId !== context.card.entry.id) throw createError({ statusCode: 400, message: 'Оплата относится к другой карточке' })
    const index = payments.findIndex(item => item.id === payment.id)
    const field = (context.card.entry.financeSubscription?.id === payment.fieldId ? context.card.entry.financeSubscription : context.card.entry.customFields?.find(field => field.id === payment.fieldId && field.type === 'subscription'))
    if (index < 0 && !field) throw createError({ statusCode: 404, message: 'Подписка не найдена' })
    if (index >= 0 && payments[index]!.fieldId !== payment.fieldId) throw createError({ statusCode: 400, message: 'Нельзя перенести оплату в другую подписку' })
    if (index >= 0) {
      if (!context.card.archived && syncPaymentPeriod(entry, payments, payments[index]!, payment)) entry.updatedAt = new Date().toISOString()
      payments[index] = payment
    }
    else payments.push(payment)
    if (payments.length > 20000) throw createError({ statusCode: 400, message: 'Достигнут предел записей истории' })
  } else {
    const index = payments.findIndex(item => item.id === body.paymentId)
    if (index < 0) throw createError({ statusCode: 404, message: 'Оплата не найдена' })
    if (body.undoRenewal) {
      const rollback = paymentRollback(entry, payments, payments[index]!)
      if (!rollback || context.card.archived) throw createError({ statusCode: 409, message: 'Срок подписки изменился. Обновите историю и повторите удаление.' })
      rollback.sub.paidFrom = rollback.paidFrom; rollback.sub.paidUntil = rollback.paidUntil
      entry.updatedAt = new Date().toISOString()
    }
    payments.splice(index, 1)
  }
  return mutateCard(context, context.id, body.revision, { encryptedData: sealCard(event, context.id, entry, payments) })
})
