import { taskNotifications } from '../../utils/kaban-notifications'
import { meetingRoomTable } from '../../utils/meeting-room'
export default defineEventHandler(async event => {
  const context = await requireSharedUser(event), settings = await loadNotificationSettings(context)
  const { sources,ids } = await reminderSources(event,context)
  const active = settings.subscriptions ? await generateSubscriptionReminders(context,sources,settings) : new Set<string>()
  const { data: records,error } = await context.client.from('app_notifications').select('*').eq('user_id',context.user.id).is('dismissed_at',null).order('created_at',{ascending:false}).limit(500)
  if(error) throw createError({statusCode:503,statusMessage:'Notifications unavailable'})
  const taskItems = settings.sharedChanges ? await taskNotifications(event,context,records.filter(row=>row.kind==='kaban')) : []
  const chatItems = await projectChatNotifications(event, context, records.filter(row=>row.kind==='project-chat'))
  const meetingRows = settings.meetingRoom ? records.filter(row => row.kind === 'meeting-room').slice(0, 100) : []
  const bookingIds = [...new Set(meetingRows.flatMap(row => row.meeting_booking_id ? [row.meeting_booking_id] : []))]
  const liveBookings = bookingIds.length ? await context.client.from(meetingRoomTable).select('id').in('id', bookingIds) : { data: [], error: null }
  if (liveBookings.error) throw createError({ statusCode: 503, statusMessage: 'Notifications unavailable' })
  const liveIds = new Set(liveBookings.data.map(row => row.id))
  const meetingItems = meetingRows.map(row => ({
    id: row.id, kind: 'meeting-room' as const, title: row.title, message: row.message, createdAt: row.created_at,
    readAt: row.read_at, bookingId: row.meeting_booking_id ?? undefined, available: liveIds.has(row.meeting_booking_id),
    vaultId: null, entryId: null, fieldId: null
  }))
  const notifications = records.filter(row => {
    if(row.kind==='project-chat'||row.kind==='kaban'||row.kind==='meeting-room') return false
    if(row.source_vault && !ids.includes(row.source_vault)) return false
    if(row.kind==='shared') return settings.sharedChanges
    return settings.subscriptions && [...active].some(key => row.dedupe_key.startsWith(`subscription/${key}/`))
  }).slice(0,100).map(row=>({id:row.id,kind:row.kind,title:row.title,message:row.message,createdAt:row.created_at,readAt:row.read_at,vaultId:row.vault_id,entryId:row.entry_id,fieldId:row.field_id}))
  return { settings,notifications:[...notifications,...taskItems,...chatItems,...meetingItems].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100) }
})
