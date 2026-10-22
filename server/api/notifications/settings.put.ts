export default defineEventHandler(async event=>{
  const context=await requireSharedUser(event),settings=await sharedBody(event,notificationSettingsSchema)
  settings.leadDays=[...new Set(settings.leadDays)].sort((a,b)=>b-a)
  const {error}=await context.client.from('notification_preferences').upsert({user_id:context.user.id,settings,updated_at:new Date().toISOString()})
  if(error)throw createError({statusCode:503,statusMessage:'Notifications unavailable'})
  return {settings}
})
