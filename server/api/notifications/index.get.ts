export default defineEventHandler(async event => {
  const context = await requireSharedUser(event), settings = await loadNotificationSettings(context)
  const { sources,ids } = await reminderSources(event,context)
  const active = settings.subscriptions ? await generateSubscriptionReminders(context,sources,settings) : new Set<string>()
  const { data: records,error } = await context.client.from('app_notifications').select('*').eq('user_id',context.user.id).is('dismissed_at',null).order('created_at',{ascending:false}).limit(500)
  if(error) throw createError({statusCode:503,statusMessage:'Notifications unavailable'})
  const notifications = records.filter(row => {
    if(row.source_vault && !ids.includes(row.source_vault)) return false
    if(row.kind==='shared') return settings.sharedChanges
    return settings.subscriptions && [...active].some(key => row.dedupe_key.startsWith(`subscription/${key}/`))
  }).slice(0,100).map(row=>({id:row.id,kind:row.kind,title:row.title,message:row.message,createdAt:row.created_at,readAt:row.read_at,vaultId:row.vault_id,entryId:row.entry_id,fieldId:row.field_id}))
  return { settings,notifications }
})
