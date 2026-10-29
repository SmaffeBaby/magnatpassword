import {loadCategoryAccess,categoryScopedData} from './category-access'
import {projectSharedCards} from '../../shared/utils/shared-card-sources'
import type { NotificationSettings } from '../../shared/types/subscriptions'
import { DEFAULT_NOTIFICATION_SETTINGS, todayDate, subscriptionRows, dueReminder, dateLabel } from '../../shared/utils/subscriptions'
export async function loadNotificationSettings(context: Awaited<ReturnType<typeof requireSharedUser>>): Promise<NotificationSettings> {
  const { data, error } = await context.client.from('notification_preferences').select('settings').eq('user_id',context.user.id).maybeSingle()
  if (error) throw createError({ statusCode: 503, statusMessage: 'Notifications unavailable' })
  return data ? notificationSettingsSchema.parse(data.settings) : structuredClone(DEFAULT_NOTIFICATION_SETTINGS)
}
export async function reminderSources(event: Parameters<typeof requireSharedUser>[0], context: Awaited<ReturnType<typeof requireSharedUser>>) {
  const access=await loadCategoryAccess(context,event),ids=access.map(item=>item.vaultId)
  const personal = await personalRow(context)
  const sources = []
  if (personal?.encryption_mode === 'server') sources.push({ id:'personal', name:'Личное', data:openPersonal(event,personal) })
  if (ids.length) {
    const { data: groups, error: failure } = await context.client.from('shared_vaults').select('*').in('id',ids)
    if (failure) throw createError({ statusCode: 503, statusMessage: 'Notifications unavailable' })
    for (const group of groups) sources.push({ id:group.id,name:group.name,data:categoryScopedData(decodeShared(event,group),access.find(item=>item.vaultId===group.id)!.categoryIds) })
  }
  return { sources:projectSharedCards(sources,await visibleSharedCards(event,context,access)), ids }
}
export async function generateSubscriptionReminders(context: Awaited<ReturnType<typeof requireSharedUser>>, sources: Awaited<ReturnType<typeof reminderSources>>['sources'], settings: NotificationSettings) {
  const { sourceEntries } = await import('../../shared/utils/vault-sources')
  const today = todayDate(), rows = subscriptionRows(sourceEntries(sources,true),today), inserts = []
  for (const row of rows) {
    const scheduled = dueReminder(row.subscription,row.subscription.reminders || settings,today)
    if (!scheduled) continue
    inserts.push({ user_id:context.user.id, kind:'subscription', dedupe_key:`subscription/${row.key}/${row.subscription.paidUntil}/${scheduled}`, source_vault:row.entry.vaultId==='personal'?null:row.entry.vaultId, vault_id:row.entry.vaultId, entry_id:row.entry.id, field_id:row.field.id, title:row.daysLeft<0?'Подписка закончилась':row.daysLeft===0?'Подписка заканчивается сегодня':'Скоро заканчивается подписка', message:`${row.entry.title} · ${row.field.label}. Оплачено до ${dateLabel(row.subscription.paidUntil)}. Хранилище: ${row.entry.vaultName}.` })
  }
  for (let i=0;i<inserts.length;i+=100) {
    const { error } = await context.client.from('app_notifications').upsert(inserts.slice(i,i+100),{onConflict:'user_id,dedupe_key',ignoreDuplicates:true})
    if (error) throw createError({ statusCode:503,statusMessage:'Notifications unavailable' })
  }
  return new Set(rows.map(r=>`${r.key}/${r.subscription.paidUntil}`))
}
