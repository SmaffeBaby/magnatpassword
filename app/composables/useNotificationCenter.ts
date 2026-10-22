import type { NotificationSettings, AppNotification } from '~~/shared/types/subscriptions'
export function useNotificationCenter(openEntry:(notification:AppNotification)=>void){
 const store=useNotificationsStore(),open=ref(false),settingsOpen=ref(false),draft=reactive<NotificationSettings>(JSON.parse(JSON.stringify(store.settings)))
 async function showInbox(){open.value=true;await store.refresh()}
 function showSettings(){Object.assign(draft,JSON.parse(JSON.stringify(store.settings)));settingsOpen.value=true}
 async function save(){if(await store.saveSettings(JSON.parse(JSON.stringify(draft)))){settingsOpen.value=false;await store.refresh()}}
 function addLead(){if(draft.leadDays.length<12)draft.leadDays.push(1)}
 function removeLead(index:number){draft.leadDays.splice(index,1)}
 async function choose(notification:AppNotification){await store.markRead([notification.id]);if(notification.entryId){open.value=false;openEntry(notification)}}
 const stamp=(value:string)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value))
 return {store,open,settingsOpen,draft,showInbox,showSettings,save,addLead,removeLead,choose,stamp}
}
