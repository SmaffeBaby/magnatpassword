import type { ChatDirectoryItem, ChatMessageDraft } from '~~/shared/types/project-chats'
export const useChatHubStore = defineStore('chat-hub', () => {
  const queries = useAccountQueries(), auth = useAuthStore()
  const opened = ref(false), fullscreen = ref(false), width = ref(720), tab = ref<'personal'|'projects'>('personal')
  const items = ref<ChatDirectoryItem[]>([]), loading = ref(false), error = ref('')
  const selected = ref<{projectId:string|null;chatId:string;messageSeq?:number}|null>(null)
  type ForwardDraft = { operationId: string; source: { projectId: string|null; chatId: string; messageIds: string[] } }
  const forwardDrafts = ref<Record<string, ForwardDraft>>({})
  const messageDrafts = ref<Record<string, ChatMessageDraft>>({})
  const draftKey = (projectId:string|null, chatId:string) => `${projectId||'personal'}:${chatId}`
  function prepareForward(source:ForwardDraft['source'], target:{projectId:string|null;chatId:string}, openPanel = true) {
    forwardDrafts.value[draftKey(target.projectId,target.chatId)]={operationId:crypto.randomUUID(),source:{...source,messageIds:[...source.messageIds]}}
    if (openPanel) open(target)
  }
  let epoch=0
  const unread = computed(()=>items.value.filter(item=>!item.muted).reduce((sum,item)=>sum+item.unreadCount,0))
  async function refresh(force=true){if(!auth.user)return;const attempt=epoch;loading.value=true;try{const rows=await queries.read<ChatDirectoryItem[]>('chat-hub','/api/chats',{force});if(attempt===epoch){items.value=rows;error.value=''}}catch(failure:any){if(attempt===epoch)error.value=failure?.data?.message||'Не удалось загрузить чаты'}finally{if(attempt===epoch)loading.value=false}}
  function open(target?:{projectId:string|null;chatId:string;messageSeq?:number}){opened.value=true;if(target){selected.value=target;tab.value=target.projectId?'projects':'personal'}void refresh()}
  async function direct(userId:string){const result=await sharedRequest<{id:string}>('/api/chats/direct',{method:'POST',body:{userId}});await refresh();open({projectId:null,chatId:result.id});return result.id}
  function lock(){epoch++;forwardDrafts.value={};messageDrafts.value={};opened.value=false;selected.value=null;items.value=[];error.value='';loading.value=false}
  watch(()=>auth.user?.id,lock)
  return {opened,fullscreen,width,tab,items,loading,error,selected,unread,refresh,open,direct,lock,forwardDrafts,messageDrafts,draftKey,prepareForward}
})
