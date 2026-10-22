import { defineStore } from 'pinia'
import type { AppNotification,NotificationSettings } from '~~/shared/types/subscriptions'
import { DEFAULT_NOTIFICATION_SETTINGS } from '~~/shared/utils/subscriptions'
export const useNotificationsStore=defineStore('notifications',()=>{
 const settings=ref<NotificationSettings>(structuredClone(DEFAULT_NOTIFICATION_SETTINGS)),items=ref<AppNotification[]>([]),busy=ref(false),error=ref('')
 let generation=0
 const unread=computed(()=>items.value.filter(n=>!n.readAt).length)
 const message=(e:any)=>e?.data?.message||e?.message||'Уведомления недоступны'
 async function refresh(){
  if(busy.value||!useVaultStore().unlocked)return
  const attempt=generation;busy.value=true
  try{const result=await sharedRequest<{settings:NotificationSettings;notifications:AppNotification[]}>('/api/notifications');if(attempt===generation){settings.value=result.settings;items.value=result.notifications;error.value=''}}catch(e){if(attempt===generation)error.value=message(e)}finally{if(attempt===generation)busy.value=false}
 }
 async function saveSettings(next:NotificationSettings){
  if(busy.value)return false
  const attempt=generation;busy.value=true;error.value=''
  try{const result=await sharedRequest<{settings:NotificationSettings}>('/api/notifications/settings',{method:'PUT',body:next});if(attempt!==generation)return false;settings.value=result.settings;return true}catch(e){if(attempt===generation)error.value=message(e);return false}finally{if(attempt===generation)busy.value=false}
 }
 async function markRead(ids:string[]){
  const attempt=generation
  try{await sharedRequest('/api/notifications/read',{method:'POST',body:{ids}});if(attempt===generation){const now=new Date().toISOString();items.value=items.value.map(n=>ids.includes(n.id)?{...n,readAt:now}:n)}}catch(e){if(attempt===generation)error.value=message(e)}
 }
 function lock(){generation++;items.value=[];settings.value=structuredClone(DEFAULT_NOTIFICATION_SETTINGS);busy.value=false;error.value=''}
 return {settings,items,busy,error,unread,refresh,saveSettings,markRead,lock}
})
