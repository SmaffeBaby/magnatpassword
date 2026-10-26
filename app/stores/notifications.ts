import { defineStore } from 'pinia'
import { isCancelledError } from '@tanstack/vue-query'
import type { AppNotification, NotificationSettings } from '~~/shared/types/subscriptions'
import { DEFAULT_NOTIFICATION_SETTINGS } from '~~/shared/utils/subscriptions'

type Inbox = { settings: NotificationSettings; notifications: AppNotification[] }
export const useNotificationsStore = defineStore('notifications', () => {
  const queries = useAccountQueries()
  const settings = ref<NotificationSettings>(structuredClone(DEFAULT_NOTIFICATION_SETTINGS)), items = ref<AppNotification[]>([])
  const busy = ref(false), clearing = ref(false), error = ref('')
  let generation = 0, reading = 0, mutations = 0
  const unread = computed(() => items.value.filter(item => !item.readAt).length)
  const message = (failure: any) => failure?.data?.message || failure?.message || 'Уведомления недоступны'
  const cache = () => queries.set<Inbox>('notifications', '/api/notifications', { settings: settings.value, notifications: items.value })
  async function refresh(force = false) {
    if (busy.value || clearing.value || mutations || !useVaultStore().unlocked) return
    const attempt = generation, sequence = ++reading
    busy.value = true
    try {
      const result = await queries.read<Inbox>('notifications', '/api/notifications', { force })
      if (attempt === generation && sequence === reading) { settings.value = result.settings; items.value = result.notifications; error.value = '' }
    } catch (failure) { if (attempt === generation && sequence === reading && !isCancelledError(failure)) error.value = message(failure) }
    finally { if (attempt === generation && sequence === reading) busy.value = false }
  }
  async function saveSettings(next: NotificationSettings) {
    if (busy.value || clearing.value || mutations || !useVaultStore().unlocked) return false
    const attempt = generation
    busy.value = true; mutations++; error.value = ''
    try {
      const result = await sharedRequest<{ settings: NotificationSettings }>('/api/notifications/settings', { method: 'PUT', body: next })
      if (attempt !== generation) return false
      settings.value = result.settings
      await queries.invalidate('notifications')
      return true
    } catch (failure) { if (attempt === generation) error.value = message(failure); return false }
    finally { if (attempt === generation) { busy.value = false; mutations-- } }
  }
  async function markRead(ids: string[]) {
    if (!ids.length || clearing.value || mutations || !useVaultStore().unlocked) return
    const attempt = generation
    ++reading; mutations++; busy.value = false
    try {
      await queries.invalidate('notifications')
      if (attempt !== generation) return
      await sharedRequest('/api/notifications/read', { method: 'POST', body: { ids } })
      if (attempt === generation) {
        const now = new Date().toISOString()
        items.value = items.value.map(item => ids.includes(item.id) ? { ...item, readAt: now } : item)
        cache(); error.value = ''
      }
    } catch (failure) { if (attempt === generation) error.value = message(failure) }
    finally { if (attempt === generation) mutations-- }
  }
  async function clear(ids?: string[]) {
    if (clearing.value || mutations || !useVaultStore().unlocked || ids?.length === 0) return false
    const attempt = generation
    clearing.value = true; ++reading; busy.value = false; error.value = ''
    try {
      await queries.invalidate('notifications')
      if (attempt !== generation) return false
      await sharedRequest('/api/notifications', { method: 'DELETE', body: ids ? { ids } : { all: true } })
      if (attempt !== generation) return false
      items.value = ids ? items.value.filter(item => !ids.includes(item.id)) : []
      cache()
      return true
    } catch (failure) { if (attempt === generation) error.value = message(failure); return false }
    finally { if (attempt === generation) clearing.value = false }
  }
  function lock() { generation++; reading++; mutations = 0; items.value = []; settings.value = structuredClone(DEFAULT_NOTIFICATION_SETTINGS); busy.value = false; clearing.value = false; error.value = '' }
  return { settings, items, busy, clearing, error, unread, refresh, saveSettings, markRead, clear, lock }
})
