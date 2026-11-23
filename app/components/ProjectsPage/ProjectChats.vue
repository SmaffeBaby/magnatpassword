<script setup lang="ts">
import { useQuery, useInfiniteQuery, useQueryClient } from '@tanstack/vue-query'
import type { Credential } from '~~/shared/types/vault'
import type { Project } from '~~/shared/types/projects'
import type { ChatMessageDraft, ProjectChat, ProjectChatHeader, ProjectChatMessage, ProjectChatFile, ProjectChatPage } from '~~/shared/types/project-chats'
import type { ProjectDocument, ProjectDocumentFolder } from '~~/shared/types/project-documents'
import type { ProjectPassword } from '~~/shared/types/project-passwords'
import { canEditProjectSection, canViewProjectSection } from '~~/shared/utils/project-permissions'
import { shouldSendChatKey, chatMentionOptions, firstUnreadChatSeq, chatSelectionRange } from '~~/shared/utils/project-chat-input'
import PersonAvatar from '~/components/Shared/PersonAvatar.vue'
import { documentSize } from '~~/shared/utils/project-documents'
import { copyText } from '~/utils/browser'
import FileUpload from '~/components/Shared/FileUpload.vue'
import CredentialDetails from '~/components/PasswordPage/CredentialDetails.vue'
import { useChatMessageMenu } from '~/composables/chats/useChatMessageMenu'
import ChatForwardModal from '~/components/Chats/ChatForwardModal.vue'
import BookingPicker from '~/components/MeetingRoom/BookingPicker.vue'
import type { MeetingRoomReference } from '~~/shared/types/meeting-room'
import { meetingRoomCompleted } from '~~/shared/utils/meeting-room'
import { dateLabel } from '~~/shared/utils/subscriptions'
import ChatTaskPicker from '~/components/Chats/ChatTaskPicker.vue'
import ProjectChatActivities from './ProjectChatActivities.vue'
import ProjectChatAttachment from './ProjectChatAttachment.vue'
import ProjectChatInfo from './ProjectChatInfo.vue'
const props = defineProps<{ project: Project; embedded?: boolean; personal?: boolean; initialChatId?: string; initialMessageSeq?: number }>()
const auth = useAuthStore(), route = useRoute(), router = useRouter(), queryClient = useQueryClient(), toast = useToast()
const selectedId = ref(props.initialChatId ?? (!props.embedded && typeof route.query.chat === 'string' ? route.query.chat : ''))
function writeRoute(value: Parameters<typeof router.replace>[0]) { if (!props.embedded) void router.replace(value) }
const messageAnchor = ref<number | null>(props.initialMessageSeq ?? (!props.embedded && Number(route.query.message) > 0 ? Number(route.query.message) : null))
const pendingJump = ref(messageAnchor.value)
let focusJump = false
watch(messageAnchor, seq => { pendingJump.value = seq; focusJump = false }, { flush: 'sync' })
const { base, chats, messages, rows, connected, refresh } = useProjectChats(() => props.project.id, selectedId, messageAnchor)
const current = computed(() => chats.data.value?.find(chat => chat.id === selectedId.value))
const typing = useChatTyping(() => props.project.id, selectedId, () => !!current.value)
const typingNames = computed(() => (typing.people.data.value??[]).map(id=>memberName(id)).join(', '))
const {chatSearch} = toRefs(useSavedFilters(() => `project-chats:${props.project.id}`, {chatSearch:''}))
const visibleChats = computed(() => (chats.data.value ?? []).filter(chat => chat.name.toLocaleLowerCase('ru').includes(chatSearch.value.toLocaleLowerCase('ru'))))
const error = ref(''), busy = ref(false), managing = ref(false), manageId = ref(''), manageRevision = ref(0), manageName = ref(''), manageMembers = ref<string[]>([])
const picker = ref<'upload' | 'documents' | 'passwords' | null>(null), pickerSearch = ref(''), mobileConversation = ref(!!selectedId.value)
const saveToDocuments = ref(!props.personal && canEditProjectSection(props.project, 'documents')), uploadFolder = ref('root')
const canViewDocuments = computed(() => !props.personal && canViewProjectSection(props.project, 'documents'))
const canSaveDocuments = computed(() => !props.personal && canEditProjectSection(props.project, 'documents'))
const eligibleMembers = computed(() => props.project.members.filter(member => member.permission !== 'hidden' && member.hasAccess))
const memberName = (id: string | null) => props.project.members.find(member => member.userId === id)?.fullName || props.project.members.find(member => member.userId === id)?.email || 'Участник проекта'
const documents = useQuery({ queryKey: computed(() => ['account', auth.user?.id, 'project-documents', props.project.id]), queryFn: ({ signal }) => sharedRequest<ProjectDocument[]>(`/api/projects/${props.project.id}/documents`, { signal }), enabled: computed(() => canViewDocuments.value && picker.value === 'documents'), retry: false })
const folders = useQuery({ queryKey: computed(() => ['account', auth.user?.id, 'project-documents', props.project.id, 'folders']), queryFn: ({ signal }) => sharedRequest<ProjectDocumentFolder[]>(`/api/projects/${props.project.id}/documents/folders`, { signal }), enabled: computed(() => canSaveDocuments.value && picker.value === 'upload'), retry: false })
function folderPath(id: string | null) { const names: string[] = [], seen = new Set<string>(); while (id && !seen.has(id)) { seen.add(id); const folder = folders.data.value?.find(folder => folder.id === id); if (!folder) break; names.unshift(folder.name); id = folder.parentId } return names.join(' / ') }
const folderOptions = computed(() => [{ label: 'Документы проекта /', value: 'root' }, ...(folders.data.value ?? []).map(folder => ({ label: folderPath(folder.id), value: folder.id }))])
const passwords = useQuery({ queryKey: computed(() => ['account', auth.user?.id, 'project-passwords', props.project.id]), queryFn: ({ signal }) => sharedRequest<ProjectPassword[]>(`/api/projects/${props.project.id}/passwords`, { signal }), enabled: computed(() => !!selectedId.value && !props.personal), retry: false })
const matchingFiles = computed(() => (documents.data.value ?? []).filter(file => file.name.toLocaleLowerCase('ru').includes(pickerSearch.value.toLocaleLowerCase('ru'))))
const matchingPasswords = computed(() => (passwords.data.value ?? []).filter(row => `${row.entry.title} ${row.entry.username}`.toLocaleLowerCase('ru').includes(pickerSearch.value.toLocaleLowerCase('ru'))))
const drafts = reactive<Record<string, ChatMessageDraft>>({})
const hub = useChatHubStore()
const header = useQuery({
  queryKey: computed(() => ['account', auth.user?.id, 'project-chats', props.project.id, selectedId.value, 'header']),
  queryFn: ({ signal }) => sharedRequest<ProjectChatHeader>(`${base.value}/${selectedId.value}/header`, { signal }),
  enabled: computed(() => !!auth.user && !!current.value),
  refetchInterval: computed(() => props.personal ? 30_000 : connected.value ? false : 15_000)
})
const peer = computed(() => header.data.value?.peer)
const headerName = computed(() => peer.value?.name || current.value?.name || '')
const headerAvatar = computed(() => {
  if (!props.personal) return header.data.value?.avatar || props.project.profile?.avatar
  if (peer.value) return peer.value.avatarUrl
  return hub.items.find(item => !item.projectId && item.id === selectedId.value)?.people.find(person => person.userId !== auth.user?.id)?.avatarUrl
})
const shortActivityDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
const headerStatus = computed(() => {
  if (!props.personal) return `${props.project.name} · Участников: ${current.value?.members.length ?? 0}`
  if (peer.value?.online) return 'В сети'
  const lastSeen = peer.value?.lastSeenAt
  if (lastSeen) return `Был(а) ${shortActivityDate.format(new Date(lastSeen))}`
  if (header.isSuccess.value || header.isError.value) return 'Активность неизвестна'
  return ''
})
const headerStatusTitle = computed(() => props.personal ? headerStatus.value : current.value?.members.map(member => memberName(member.userId)).join(', '))
const canEditAvatar = computed(() => !!current.value && !props.personal && current.value.createdBy === auth.user?.id)
const avatarDialog = ref(false), avatarDraft = ref(''), avatarError = ref(''), avatarBusy = ref(false)
const avatarRevision = ref(0)
const avatarAccept = 'image/png,image/jpeg,image/webp'

function editAvatar() {
  if (!current.value || avatarBusy.value) return
  avatarDraft.value = header.data.value?.avatar ?? ''
  avatarRevision.value = current.value.revision
  avatarError.value = ''
  avatarDialog.value = true
}

function chooseAvatar(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = ''
  if (!avatarAccept.split(',').includes(file.type) || file.size > 500_000 || !file.size) {
    avatarError.value = 'Выберите PNG, JPEG или WebP до 500 КБ'
    return
  }
  avatarError.value = ''
  avatarBusy.value = true
  const reader = new FileReader()
  reader.onload = () => { avatarDraft.value = String(reader.result) }
  reader.onerror = () => { avatarError.value = 'Не удалось прочитать изображение' }
  reader.onloadend = () => { avatarBusy.value = false }
  reader.readAsDataURL(file)
}

async function saveAvatar() {
  const chat = current.value
  if (!chat || !canEditAvatar.value || avatarBusy.value) return
  avatarBusy.value = true
  avatarError.value = ''
  try {
    await sharedRequest(`${base.value}/${chat.id}/header`, {
      method: 'PUT',
      body: { avatar: avatarDraft.value, revision: avatarRevision.value }
    })
    await refresh()
    avatarDialog.value = false
  } catch (failure: any) {
    avatarError.value = failure?.data?.message || 'Не удалось сохранить аватар'
    if (failure?.statusCode === 409) {
      await refresh()
      if (current.value?.id === chat.id) avatarRevision.value = current.value.revision
    }
  } finally { avatarBusy.value = false }
}
watch(selectedId, () => { avatarDialog.value = false })
const bookingPicker = ref(false)
const bookingClock = useMeetingRoomClock()
watch([selectedId, () => auth.user?.id], () => { bookingPicker.value = false })
function addBooking(booking: MeetingRoomReference) {
  if (draft.value.retry || draft.value.bookings.length >= 10 || draft.value.bookings.some(item => item.id === booking.id)) return
  draft.value.bookings.push(booking)
}
function openBooking(booking: MeetingRoomReference) {
  if (!booking.available) return
  useChatHubStore().opened = false
  void useServiceTabsStore().open({ path: '/meeting-room', query: { booking: booking.id } })
}

const forwardKey = computed(() => hub.draftKey(props.personal ? null : props.project.id, selectedId.value))
const forwardDraft = computed(() => hub.forwardDrafts[forwardKey.value])
const draft = computed(() => {
  const entries = props.embedded ? hub.messageDrafts : drafts
  const key = forwardKey.value
  entries[key] ??= { text: '', files: [], passwordIds: [], nonce: '', retry: false, sending: false, tasks: [], bookings: [] }
  return entries[key]!
})
const sending = computed(() => draft.value.sending)
const attachmentCount = computed(() => draft.value.files.length + draft.value.passwordIds.length)
const hasMessageContent = computed(() => !!(draft.value.text.trim() || attachmentCount.value || draft.value.poll || draft.value.todo || draft.value.tasks.length || draft.value.bookings.length || forwardDraft.value))
const canSend = computed(() => !!current.value && !sending.value && !busy.value && hasMessageContent.value)
const inlinePassword = ref<Credential|null>(null)
const activePasswordId = ref(''), activePassword = computed(() => passwords.data.value?.find(row => row.id === activePasswordId.value))
const passwordDetail = computed(() => inlinePassword.value ? {...inlinePassword.value,vaultId:props.project.id,vaultName:current.value?.name||props.project.name} : activePassword.value ? { ...activePassword.value.entry, vaultId: props.project.id, vaultName: props.project.name } : null)
const passwordTitle = (id: string) => passwords.data.value?.find(row => row.id === id)?.entry.title || (passwords.isPending.value ? 'Загружаем пароль…' : 'Пароль недоступен')
async function copy(value: string, trigger?: HTMLElement) { try { await copyText(value, trigger); toast.add({ title: 'Скопировано', color: 'success' }) } catch { toast.add({ title: 'Не удалось скопировать', color: 'error' }) } }
function selectChat(id: string) { if (busy.value || sending.value) return; messageAnchor.value = null; selectedId.value = id; mobileConversation.value = true; error.value = ''; writeRoute({ query: { ...route.query, chat: id, message: undefined } }) }
watch(()=>props.initialMessageSeq,value=>{if(props.embedded){messageAnchor.value=value??null;atBottom.value=!value}})
watch(() => route.query.message, value => { if(props.embedded)return; messageAnchor.value = Number(value) > 0 ? Number(value) : null })
watch(() => route.query.chat, id => { if (!props.embedded && typeof id === 'string') selectedId.value = id })
watch(chats.data, list => { if (list && !list.some(chat => chat.id === selectedId.value)) { selectedId.value = list[0]?.id ?? ''; if (!selectedId.value) mobileConversation.value = false } }, { immediate: true })
function manage(chat?: ProjectChat) { manageId.value = chat?.id ?? ''; manageRevision.value = chat?.revision ?? 0; manageName.value = chat?.name ?? ''; manageMembers.value = chat?.members.map(member => member.userId) ?? [auth.user!.id]; error.value = ''; managing.value = true }
async function saveChat() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { const result = await sharedRequest<{ id: string }>(manageId.value ? `${base.value}/${manageId.value}` : base.value, { method: manageId.value ? 'PUT' : 'POST', body: { name: manageName.value, members: manageMembers.value.filter(id => eligibleMembers.value.some(member => member.userId === id)), ...(manageId.value ? { revision: manageRevision.value } : {}) } }); await refresh(); managing.value = false; busy.value = false; selectChat(result.id) }
  catch (failure: any) { error.value = failure?.data?.message || 'Не удалось сохранить беседу'; if ([403, 404, 409].includes(failure?.statusCode)) await refresh() }
  finally { busy.value = false }
}
function showPicker(value: typeof picker.value) { if (!current.value || draft.value.retry) return; picker.value = value; pickerSearch.value = ''; error.value = '' }
async function upload(event: Event) {
  const input = event.target as HTMLInputElement, files = Array.from(input.files ?? []), chat = selectedId.value, target = draft.value
  if (!files.length || busy.value) return
  if (target.files.length + files.length > 10) { error.value = 'В одном сообщении можно прикрепить до 10 файлов'; input.value = ''; return }
  busy.value = true; error.value = ''
  try {
    for (const file of files) { const body = new FormData(); body.append('file', file); body.append('saveToDocuments', String(saveToDocuments.value && canSaveDocuments.value)); if (uploadFolder.value !== 'root') body.append('folderId', uploadFolder.value); const uploaded = await sharedRequest<ProjectChatFile>(`${base.value}/${chat}/files`, { method: 'POST', body }); target.files.push(uploaded) }
    if (saveToDocuments.value && canSaveDocuments.value) await queryClient.invalidateQueries({ queryKey: ['account', auth.user?.id, 'project-documents', props.project.id] })
    picker.value = null
  } catch (failure: any) { error.value = failure?.data?.message || 'Не удалось загрузить вложение' }
  finally { busy.value = false; input.value = '' }
}
async function attachDocument(file: ProjectDocument) {
  if (busy.value || draft.value.files.length >= 10) return
  busy.value = true; error.value = ''
  try { draft.value.files.push(await sharedRequest<ProjectChatFile>(`${base.value}/${selectedId.value}/files/from-project`, { method: 'POST', body: { fileId: file.id, revision: file.revision } })); picker.value = null }
  catch (failure: any) { error.value = failure?.data?.message || 'Не удалось прикрепить документ' }
  finally { busy.value = false }
}
function attachPassword(id: string) { if (draft.value.passwordIds.length >= 10) return; if (!draft.value.passwordIds.includes(id)) draft.value.passwordIds.push(id); picker.value = null }
async function removeFile(file: ProjectChatFile) {
  if (busy.value || sending.value || draft.value.retry) return
  busy.value = true; error.value = ''
  try { await sharedRequest(`${base.value}/${selectedId.value}/files/${file.id}`, { method: 'DELETE' }); draft.value.files = draft.value.files.filter(item => item.id !== file.id) }
  catch (failure: any) { error.value = failure?.data?.message || 'Не удалось убрать вложение' }
  finally { busy.value = false }
}
async function send() {
  if (!canSend.value) return
  const chat = selectedId.value, target = draft.value, forward = forwardDraft.value, key = forwardKey.value
  if (!target.nonce) target.nonce = crypto.randomUUID()
  target.sending = true; error.value = ''; typing.stop()
  try {
    if (forward) {
      for (let i=0;i<forward.source.messageIds.length;i+=100) await sharedRequest('/api/chats/forward',{method:'POST',body:{operationId:forward.operationId,source:{...forward.source,messageIds:forward.source.messageIds.slice(i,i+100)},target:{projectId:props.personal?null:props.project.id,chatId:chat}}})
      if (hub.forwardDrafts[key]?.operationId===forward.operationId) delete hub.forwardDrafts[key]
    }
    if (target.text.trim() || target.files.length || target.passwordIds.length || target.poll || target.todo || target.tasks.length || target.bookings.length) await sharedRequest(`${base.value}/${chat}/messages`, { method: 'POST', body: { id: target.nonce, text: target.text, fileIds: target.files.map(file => file.id), passwordIds: [...target.passwordIds], poll: target.poll, todo: target.todo, tasks: target.tasks.map(task=>({taskId:task.taskId,boardId:task.boardId})), bookingIds: target.bookings.map(booking => booking.id) } })
    target.tasks = []; target.bookings = []; target.poll = undefined; target.todo = undefined; target.text = ''; target.files = []; target.passwordIds = []; target.nonce = ''; target.retry = false
    atBottom.value = true; await refresh()
  } catch (failure: any) { target.retry = true; error.value = failure?.data?.message || 'Сообщение не отправлено. Повторите отправку.'; await refresh() }
  finally { target.sending = false }
}
function enter(event: KeyboardEvent) { if (event.key === 'Escape') { mentionDismissed.value = true; return }; if (shouldSendChatKey(event)) { event.preventDefault(); if (suggestedMentions.value.length) insertMention(suggestedMentions.value[0]!.handle); else void send() } }
const actionBusy = ref(false), editingMessage = ref<ProjectChatMessage | null>(null), editText = ref(''), deletingMessage = ref<ProjectChatMessage | null>(null)
type Selection = Pick<ProjectChatMessage,'id'|'seq'|'revision'|'authorId'>
const selectionMode = ref(false), selectedMessages = ref<Selection[]>([]), deletingBatch = ref<Selection[] | null>(null)
const selectionAnchor = ref<number|null>(null)
let selectionShift = false
function captureSelectionShift(event:Event) { selectionShift = event instanceof MouseEvent && event.shiftKey }
async function selectMessage(message: ProjectChatMessage, checked: boolean, shift = false) {
  if (message.authorId !== auth.user?.id || message.deletedAt || message.activity || actionBusy.value) return
  const range = shift || selectionShift; selectionShift = false
  if (range && selectionAnchor.value !== null) {
    const chat=selectedId.value, anchor=selectionAnchor.value; actionBusy.value=true
    try { const all=await sharedRequest<Selection[]>(`${base.value}/${chat}/messages/selectable`); if(chat===selectedId.value){const found=chatSelectionRange(all,anchor,message.seq,auth.user!.id);selectedMessages.value=[...new Map([...selectedMessages.value,...found].map(item=>[item.id,item])).values()]}}
    catch(failure:any){error.value=failure?.data?.message||'Не удалось выделить сообщения'}finally{actionBusy.value=false}
  } else {
    selectedMessages.value = checked ? [...selectedMessages.value.filter(item => item.id !== message.id), message] : selectedMessages.value.filter(item => item.id !== message.id)
    selectionAnchor.value=message.seq
  }
}
async function selectOwnMessages() { if(actionBusy.value)return;actionBusy.value=true;try{selectedMessages.value=await sharedRequest<Selection[]>(`${base.value}/${selectedId.value}/messages/selectable`)}catch(failure:any){error.value=failure?.data?.message||'Не удалось выделить сообщения'}finally{actionBusy.value=false} }
function closeSelection() { selectionMode.value = false; selectedMessages.value = []; selectionAnchor.value=null }
function deleteSelected() {
  const items = deletingBatch.value
  if (!items?.length) return
  void mutateMessage(async () => { for(let offset=0;offset<items.length;offset+=5000){const chunk=items.slice(offset,offset+5000);await sharedRequest(`${base.value}/${selectedId.value}/messages/delete`, { method: 'POST', body: { messages: chunk.map(message => ({ id: message.id, revision: message.revision })) } });const ids=new Set(chunk.map(item=>item.id));selectedMessages.value=selectedMessages.value.filter(item=>!ids.has(item.id));deletingBatch.value=deletingBatch.value?.filter(item=>!ids.has(item.id))??null};deletingBatch.value=null;closeSelection() })
}
watch(rows, visible => { selectedMessages.value = selectedMessages.value.filter(message => { const row=visible.find(row=>row.id===message.id);return !row||row.revision===message.revision&&row.authorId===auth.user?.id&&!row.deletedAt }) })
watch(selectedId, () => { closeSelection(); deletingBatch.value = null })
const forwarding=ref<{projectId:string|null;chatId:string;messageIds:string[]}|null>(null),taskPicker=ref(false)
function startForward(ids:string[]){forwarding.value={projectId:props.personal?null:props.project.id,chatId:selectedId.value,messageIds:ids}}
function addTask(task:{taskId:string;boardId:string;title:string}){if(!draft.value.tasks.some(item=>item.taskId===task.taskId))draft.value.tasks.push(task);taskPicker.value=false}
function openTask(task:ProjectChatMessage['tasks'][number]) { if(!task.available)return;useChatHubStore().opened=false;void useServiceTabsStore().open({path:task.projectId?`/projects/${task.projectId}/tasks`:'/kaban',query:{task:task.taskId,...(!task.projectId?{vault:task.vaultId||'personal'}:{})}}) }
const panel = ref<'info' | 'pins' | 'search' | null>(null), messageSearch = ref(''), searchTerm = ref('')
const conversationVisible = computed(() => panel.value !== 'pins' && panel.value !== 'info')
const infoTrigger = ref<HTMLButtonElement | null>(null)
let pinsOpenedFromInfo = false
function closeInfo() {
  panel.value = null
  void nextTick(() => infoTrigger.value?.focus())
}
function writeFromInfo() {
  panel.value = null
  void nextTick(() => chatInput.value?.textareaRef?.focus())
}
watch(selectedId, () => { panel.value = null })
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(messageSearch, value => { if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(() => { searchTerm.value = value.trim() }, 300) })
const searchFeed = useInfiniteQuery({ queryKey: computed(() => ['account', auth.user?.id, 'project-chats', props.project.id, selectedId.value, 'search', searchTerm.value]),
  initialPageParam: null as number | null,
  queryFn: ({ signal, pageParam }) => { const query = new URLSearchParams({ search: searchTerm.value }); if (pageParam) query.set('before', String(pageParam)); return sharedRequest<ProjectChatPage>(`${base.value}/${selectedId.value}/messages?${query}`, { signal }) },
  getNextPageParam: page => page.nextBefore ?? undefined,
  enabled: computed(() => !!current.value && panel.value === 'search' && !!searchTerm.value), retry: false })
const pinsFeed = useInfiniteQuery({
  queryKey: computed(() => ['account', auth.user?.id, 'project-chats', props.project.id, selectedId.value, 'pins']),
  initialPageParam: null as number | null,
  queryFn: ({ signal, pageParam }) => {
    const query = new URLSearchParams({ pinned: 'true' })
    if (pageParam) query.set('before', String(pageParam))
    return sharedRequest<ProjectChatPage>(`${base.value}/${selectedId.value}/messages?${query}`, { signal })
  },
  getNextPageParam: page => page.nextBefore ?? undefined,
  enabled: computed(() => !!current.value),
  refetchInterval: computed(() => connected.value ? false : 15000),
  retry: false
})
const pinnedPreview = computed(() => pinsFeed.data.value?.pages[0]?.messages.at(-1))
const pinnedRows = computed(() => [...(pinsFeed.data.value?.pages ?? [])].reverse().flatMap(page => page.messages))
const pinsScroller = ref<HTMLElement | null>(null)
watch([pinsScroller, () => pinnedRows.value.length], ([element, count], [previous, previousCount]) => {
  if (element && count && (element !== previous || !previousCount)) element.scrollTop = element.scrollHeight
}, { flush: 'post' })
async function olderPins() {
  const element = pinsScroller.value
  if (!element || pinsFeed.isFetching.value) return
  const height = element.scrollHeight
  await pinsFeed.fetchNextPage()
  await nextTick()
  if (element === pinsScroller.value) element.scrollTop += element.scrollHeight - height
}
const searchRows = computed(() => (searchFeed.data.value?.pages ?? []).flatMap(page => [...page.messages].reverse()))
watch([searchFeed.isFetching, searchFeed.hasNextPage, () => searchRows.value.length], ([fetching, more, count]) => { if (panel.value === 'search' && searchTerm.value && !fetching && more && !count && !searchFeed.error.value) void searchFeed.fetchNextPage() })
function jumpToMessage(message: Pick<ProjectChatMessage, 'seq'>) {
  panel.value = null
  messageAnchor.value = message.seq
  pendingJump.value = message.seq
  focusJump = true
  atBottom.value = false
  mobileConversation.value = true
  writeRoute({ query: { ...route.query, chat: selectedId.value, message: String(message.seq) } })
}
function scrollToAnchor() {
  const element = scroller.value
  const seq = pendingJump.value
  if (!element?.clientHeight || seq === null || messages.isPending.value) return
  const target = element.querySelector<HTMLElement>(`[data-message-seq="${seq}"]`)
  if (!target) return
  const offset = target.getBoundingClientRect().top - element.getBoundingClientRect().top
  element.scrollTop += offset - Math.max(0, (element.clientHeight - target.offsetHeight) / 2)
  if (focusJump) target.focus({ preventScroll: true })
  pendingJump.value = null
}
function latest() { messageAnchor.value = null; atBottom.value = true; writeRoute({ query: { ...route.query, message: undefined } }) }
const summary = (message: ProjectChatMessage) => message.text || message.poll?.question || message.todo?.title || message.tasks[0]?.title || message.bookings?.[0]?.title || (message.files.length ? message.files.map(file => file.name).join(', ') : 'Пароль проекта')
const headerActions = computed(() => [
  { label: 'Закреплённые сообщения', icon: 'i-lucide-pin', onSelect: togglePins },
  { label: selectionMode.value ? 'Выйти из режима выбора' : 'Выбрать мои сообщения', icon: 'i-lucide-list-checks', onSelect: () => { if (selectionMode.value) closeSelection(); else selectionMode.value = true } },
  { label: current.value?.muted ? 'Включить уведомления' : 'Отключить уведомления', icon: current.value?.muted ? 'i-lucide-bell-off' : 'i-lucide-bell', disabled: actionBusy.value, onSelect: toggleMute },
  ...(canEditAvatar.value ? [
    { label: 'Настройки беседы', icon: 'i-lucide-users-round', disabled: busy.value || sending.value, onSelect: () => manage(current.value) },
    { label: 'Аватар беседы', icon: 'i-lucide-image', disabled: avatarBusy.value, onSelect: editAvatar }
  ] : [])
])
function togglePins() {
  if (panel.value === 'pins') {
    panel.value = pinsOpenedFromInfo ? 'info' : null
    return
  }
  pinsOpenedFromInfo = panel.value === 'info'
  panel.value = 'pins'
}
async function mutateMessage(action: () => Promise<unknown>) {
  if (actionBusy.value) return
  actionBusy.value = true; error.value = ''
  try { await action(); editingMessage.value = null; deletingMessage.value = null; await refresh() }
  catch (failure: any) { error.value = failure?.data?.message || 'Не удалось изменить сообщение'; await refresh() }
  finally { actionBusy.value = false }
}
function interact(message: ProjectChatMessage, body: { action: string; itemId?: string | null; value?: boolean }) { void mutateMessage(() => sharedRequest(`${base.value}/${selectedId.value}/messages/${message.id}/interact`, { method: 'POST', body })) }
const { menu: messageMenu, closeMenu: closeMessageMenu, startPress, openFromMouse, openFromKeyboard, openFromTimestamp, restoreFocus } = useChatMessageMenu()
const contextMessage = computed(() => rows.value.find(message => message.id === messageMenu.value?.messageId))
const messageMenuItems = computed(() => contextMessage.value ? messageActions(contextMessage.value) : [])
watch([selectedId, conversationVisible], closeMessageMenu)
watch(contextMessage, message => {
  if (messageMenu.value && (!message || message.deletedAt || message.activity)) closeMessageMenu()
})

function messageActions(message: ProjectChatMessage) {
  if (message.deletedAt || message.activity) return []
  return [
    ...(message.authorId === auth.user?.id ? [{ label: 'Редактировать', icon: 'i-lucide-pencil', onSelect: () => { error.value = ''; editingMessage.value = message; editText.value = message.text } }] : []),
    ...(message.text ? [{ label: 'Копировать текст', icon: 'i-lucide-copy', onSelect: () => copy(message.text) }] : []),
    { label: 'Переслать', icon: 'i-lucide-forward', onSelect: () => startForward([message.id]) },
    ...(message.authorId === auth.user?.id ? [{ label: 'Выбрать', icon: 'i-lucide-square-check', onSelect: () => { selectionMode.value = true; selectMessage(message, true) } }] : []),
    { label: message.pinned ? 'Открепить' : 'Закрепить', icon: message.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin', onSelect: () => interact(message, { action: 'pin', value: !message.pinned }) },
    ...(message.authorId === auth.user?.id ? [{ label: 'Удалить', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { error.value = ''; deletingMessage.value = message } }] : [])
  ]
}
function saveMessage() { const message = editingMessage.value; if (message) void mutateMessage(() => sharedRequest(`${base.value}/${selectedId.value}/messages/${message.id}`, { method: 'PUT', body: { revision: message.revision, text: editText.value } })) }
function deleteMessage() { const message = deletingMessage.value; if (message) void mutateMessage(() => sharedRequest(`${base.value}/${selectedId.value}/messages/${message.id}`, { method: 'DELETE', body: { revision: message.revision } })) }
async function toggleMute() { if (!current.value || actionBusy.value) return; const muted = !current.value.muted; await mutateMessage(() => sharedRequest(`${base.value}/${selectedId.value}/preferences`, { method: 'PUT', body: { muted } })) }
const activityDialog = ref<'poll' | 'todo' | null>(null), activityTitle = ref(''), activityItems = ref<string[]>([])
function createActivity(kind: 'poll' | 'todo') { activityDialog.value = kind; activityTitle.value = ''; activityItems.value = kind === 'poll' ? ['', ''] : ['']; error.value = '' }
function addActivity() { const labels = activityItems.value.map(label => label.trim()).filter(Boolean); const title = activityTitle.value.trim(); if (!title || labels.length < (activityDialog.value === 'poll' ? 2 : 1)) { error.value = 'Укажите заголовок и заполните пункты'; return }; const items = labels.map(label => ({ id: crypto.randomUUID(), label })); if (activityDialog.value === 'poll') draft.value.poll = { question: title, options: items }; else draft.value.todo = { title, items }; activityDialog.value = null }
const chatInput = ref<{ textareaRef?: HTMLTextAreaElement } | null>(null), mentionCaret = ref(0), mentionDismissed = ref(false)
const mentionOptions = computed(() => chatMentionOptions((current.value?.members ?? []).map(member => ({ id: member.userId, name: memberName(member.userId) }))))
const mentionMatch = computed(() => draft.value.text.slice(0, mentionCaret.value).match(/(?:^|[^\p{L}\p{N}_])@([\p{L}\p{N}_]*)$/u))
const suggestedMentions = computed(() => !mentionDismissed.value && mentionMatch.value ? mentionOptions.value.filter(member => member.handle.toLocaleLowerCase('ru').includes(mentionMatch.value![1]!.toLocaleLowerCase('ru'))).slice(0, 8) : [])
function trackCaret(event?: Event) { if (event instanceof KeyboardEvent && event.key === 'Escape') return; mentionCaret.value = chatInput.value?.textareaRef?.selectionStart ?? draft.value.text.length; mentionDismissed.value = false }
function insertMention(handle: string) { const before = draft.value.text.slice(0, mentionCaret.value), start = before.lastIndexOf('@'); draft.value.text = before.slice(0, start) + '@' + handle + ' ' + draft.value.text.slice(mentionCaret.value); mentionDismissed.value = true; void nextTick(() => { const input = chatInput.value?.textareaRef; input?.focus(); const caret = start + handle.length + 2; input?.setSelectionRange(caret, caret) }) }
function messageParts(message: ProjectChatMessage) { return message.text.split(/(@[\p{L}\p{N}_]+)/gu).map(text => ({ text, mention: text.startsWith('@') && mentionOptions.value.some(member => '@' + member.handle.toLocaleLowerCase('ru') === text.toLocaleLowerCase('ru')) })) }
const unreadBoundary = ref<number | null>(null), unreadOpening = ref(true)
const firstUnreadSeq = computed(() => firstUnreadChatSeq(rows.value, unreadBoundary.value, auth.user?.id))
const visibleRows = computed(() => rows.value.filter(row => !row.deletedAt))
let awayBoundary: number | null = null, openingEpoch = 0
async function snapshotUnread() {
  const attempt = ++openingEpoch, chat = selectedId.value
  unreadOpening.value = true
  await nextTick(); await refresh()
  if (attempt !== openingEpoch || selectedId.value !== chat || stopped) return
  unreadBoundary.value = current.value?.unreadCount ? current.value.members.find(member => member.userId === auth.user?.id)?.lastReadSeq ?? 0 : -1
  unreadOpening.value = false; await nextTick(); observeMessages()
}
function rememberAway() { if (current.value && awayBoundary === null) awayBoundary = Math.max(current.value.members.find(member => member.userId === auth.user?.id)?.lastReadSeq ?? 0, readSent[selectedId.value] ?? 0) }
async function resumeUnread() { if (document.visibilityState !== 'visible' || !document.hasFocus()) { rememberAway(); return }; if (awayBoundary !== null) { const boundary = awayBoundary; awayBoundary = null; unreadOpening.value = true; await refresh(); unreadBoundary.value = rows.value.some(message => message.seq > boundary && message.authorId !== auth.user?.id && !message.deletedAt) ? boundary : -1; unreadOpening.value = false; await nextTick() }; observeMessages() }
const scroller = ref<HTMLElement | null>(null), atBottom = ref(true), loadingOlder = ref(false)
const time = (value: string) => new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
const day = (value: string) => new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value))
function activityLabel(message: ProjectChatMessage) {
  const activity = message.activity
  if (!activity) return ''
  const own = message.authorId === auth.user?.id
  const actor = own ? 'Вы' : message.authorName || memberName(message.authorId)
  const action = (verb: string) => `${actor} ${verb}${own ? 'и' : '(а)'}`
  switch (activity.kind) {
    case 'created': return `${action('создал')} беседу`
    case 'pinned': return `${action('закрепил')} сообщение`
    case 'unpinned': return `${action('открепил')} сообщение`
    case 'avatar-changed': return `${action('обновил')} аватар беседы`
    case 'avatar-removed': return `${action('удалил')} аватар беседы`
    case 'renamed': return `${action('изменил')} название беседы на «${activity.name}»`
    case 'members-added':
    case 'members-removed': {
      const names = activity.memberNames.join(', ')
      const remaining = activity.memberCount - activity.memberNames.length
      const introduction = activity.kind === 'members-added' ? action('добавил') : `${action('удалил')} из беседы`
      return `${introduction}: ${names}${remaining > 0 ? ` и ещё ${remaining}` : ''}`
    }
  }
}
const readers = (message: ProjectChatMessage) => current.value?.members.filter(member => member.userId !== message.authorId && member.lastReadSeq >= message.seq) ?? []
const readTitle = (message: ProjectChatMessage) => { const users = readers(message); return users.length ? `Прочитали: ${users.map(member => memberName(member.userId)).join(', ')}` : 'Ещё не прочитано' }
function onScroll() { const el = scroller.value; if (el) atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 100 }
async function older() {
  const el = scroller.value
  if (!el || loadingOlder.value) return
  loadingOlder.value = true
  const height = el.scrollHeight, anchor = messageAnchor.value, chat = selectedId.value
  await messages.fetchNextPage()
  await nextTick()
  if (anchor === messageAnchor.value && chat === selectedId.value) el.scrollTop += el.scrollHeight - height
  loadingOlder.value = false
  observeMessages()
}
let observer: IntersectionObserver | undefined, readTimer: ReturnType<typeof setTimeout> | undefined, pendingRead = 0, stopped = false
const readSent: Record<string, number> = {}
function observeMessages() {
  observer?.disconnect()
  if (!conversationVisible.value || unreadOpening.value || !scroller.value || !current.value || document.visibilityState !== 'visible' || !document.hasFocus()) return
  observer = new IntersectionObserver(entries => {
    if (unreadOpening.value || !current.value || document.visibilityState !== 'visible' || !document.hasFocus()) return
    const own = current.value.members.find(member => member.userId === auth.user?.id)?.lastReadSeq ?? 0
    for (const entry of entries) if (entry.isIntersecting) pendingRead = Math.max(pendingRead, Number((entry.target as HTMLElement).dataset.seq))
    if (pendingRead <= Math.max(own, readSent[selectedId.value] ?? 0) || readTimer) return
    const chat = selectedId.value
    readTimer = setTimeout(async () => {
      readTimer = undefined
      if (stopped || !conversationVisible.value || unreadOpening.value || selectedId.value !== chat || document.visibilityState !== 'visible' || !document.hasFocus()) return
      const seq = pendingRead; readSent[chat] = seq
      try { await sharedRequest(`${base.value}/${chat}/read`, { method: 'PUT', body: { seq } }) }
      catch { delete readSent[chat] }
    }, 300)
  }, { root: scroller.value, threshold: 0.5 })
  for (const element of scroller.value.querySelectorAll('[data-seq]')) observer.observe(element)
}
watch(selectedId, async () => { unreadBoundary.value = null; awayBoundary = null; pendingRead = 0; if (readTimer) clearTimeout(readTimer); readTimer = undefined; atBottom.value = true; activePasswordId.value = ''; await snapshotUnread(); await nextTick(); if (scroller.value && !messageAnchor.value && atBottom.value) scroller.value.scrollTop = scroller.value.scrollHeight; observeMessages() })
watch([scroller, rows, panel, pendingJump, messageAnchor], () => {
  if (pendingJump.value !== null) scrollToAnchor()
  else if (scroller.value && !messageAnchor.value && atBottom.value && !loadingOlder.value && conversationVisible.value) scroller.value.scrollTop = scroller.value.scrollHeight
  observeMessages()
}, { flush: 'post' })
watch(() => auth.user?.id, () => { closeSelection(); forwarding.value=null;inlinePassword.value=null; for (const id of Object.keys(drafts)) delete drafts[id]; managing.value = false; picker.value = null; activePasswordId.value = '' })
onMounted(() => { void snapshotUnread(); window.addEventListener('focus', resumeUnread); window.addEventListener('blur', rememberAway); document.addEventListener('visibilitychange', resumeUnread) })
onBeforeUnmount(() => { stopped = true; openingEpoch++; observer?.disconnect(); if (readTimer) clearTimeout(readTimer); if (searchTimer) clearTimeout(searchTimer); window.removeEventListener('focus', resumeUnread); window.removeEventListener('blur', rememberAway); document.removeEventListener('visibilitychange', resumeUnread) })
</script>
<template>
  <section class="project-chats" :class="{'chat-embedded':embedded,'chat-embedded-directory':embedded&&!initialChatId}">
    <div v-if="!embedded" class="chats-intro"><p>Отдельные беседы с участниками проекта, файлами и доступами к сервисам.</p></div>
    <UAlert v-if="chats.error.value" color="error" title="Не удалось загрузить беседы" :actions="[{label:'Повторить',onClick:()=>refresh()}]"/>
    <div v-else class="chats-shell" :class="{'chat-mobile-conversation':mobileConversation,'chats-with-panel':panel === 'search' && !!current}">
      <aside class="chats-sidebar"><header><h2>Чаты проекта</h2><UButton icon="i-lucide-square-pen" aria-label="Создать беседу" color="neutral" variant="ghost" @click="manage()"/></header><UInput v-model="chatSearch" icon="i-lucide-search" placeholder="Поиск беседы" aria-label="Поиск беседы" class="chat-search"/><p v-if="chats.isPending.value" class="chat-hint">Загружаем беседы…</p><nav v-else aria-label="Беседы проекта"><button v-for="chat in visibleChats" :key="chat.id" class="chat-list-item" :class="{'is-active':selectedId===chat.id}" :disabled="busy||sending" @click="selectChat(chat.id)"><span class="chat-avatar"><UIcon name="i-lucide-messages-square"/></span><span class="chat-list-label"><strong>{{chat.name}}</strong><small>{{chat.members.length}} участн. · {{time(chat.updatedAt)}}</small></span><UIcon v-if="chat.muted" name="i-lucide-bell-off" class="chat-muted-icon"/><UBadge v-if="chat.unreadCount" color="primary" variant="solid" size="sm">{{chat.unreadCount}}</UBadge></button><p v-if="!visibleChats.length" class="chat-hint">{{chatSearch?'Беседы не найдены':'Создайте первую беседу и пригласите участников.'}}</p></nav></aside>
      <div v-if="current" v-show="conversationVisible" class="chat-conversation">
        <header class="chat-header">
          <div class="chat-header-row">
            <div class="chat-identity">
              <UButton v-if="!embedded || !initialChatId" class="chat-mobile-back chat-header-button" icon="i-lucide-arrow-left" aria-label="К списку бесед" color="neutral" variant="ghost" @click="mobileConversation = false"/>
              <button ref="infoTrigger" type="button" class="chat-identity-trigger" :aria-label="`Открыть сведения о беседе ${headerName}`" @click="panel = 'info'">
                <PersonAvatar class="chat-header-avatar" :name="headerName" :src="headerAvatar"/>
                <span class="chat-identity-text">
                  <span class="chat-identity-title" :title="headerName">{{ headerName }}</span>
                  <small v-if="headerStatus" :class="{ 'is-online': peer?.online }" :title="headerStatusTitle">{{ headerStatus }}</small>
                </span>
                <UIcon class="chat-info-chevron" name="i-lucide-chevron-right"/>
              </button>
            </div>
            <div class="chat-header-actions">
              <UButton class="chat-header-button" icon="i-lucide-search" aria-label="Поиск сообщений" color="neutral" variant="ghost" :aria-expanded="panel === 'search'" @click="panel = panel === 'search' ? null : 'search'"/>
              <UDropdownMenu :items="headerActions" :content="{ align: 'end' }">
                <UButton class="chat-header-button" icon="i-lucide-ellipsis" aria-label="Действия с беседой" color="neutral" variant="ghost"/>
              </UDropdownMenu>
            </div>
          </div>
          <div v-if="pinnedPreview" class="chat-pinned">
            <button type="button" class="chat-pinned-preview" aria-label="Перейти к закреплённому сообщению" :title="summary(pinnedPreview)" @click="jumpToMessage(pinnedPreview)">
              <span class="chat-pin-marker" aria-hidden="true">
                <i v-for="segment in Math.min(3, pinnedRows.length)" :key="segment"/>
              </span>
              <ProjectChatAttachment
                v-if="pinnedPreview.files[0]"
                :key="`${pinnedPreview.files[0].id}:${pinnedPreview.files[0].revision}`"
                :file="pinnedPreview.files[0]"
                :project-id="project.id"
                :chat-id="current.id"
                preview-mode="thumbnail"
              />
              <span>
                <strong>Закреплённое сообщение</strong>
                <small>{{ summary(pinnedPreview) }}</small>
              </span>
            </button>
            <UButton class="chat-header-button" icon="i-lucide-list" aria-label="Все закреплённые сообщения" color="neutral" variant="ghost" :aria-expanded="panel === 'pins'" @click="togglePins"/>
          </div>
        </header>
        <div v-if="selectionMode" class="chat-selection-toolbar"><span>Выбрано: {{selectedMessages.length}}</span><UButton label="Выбрать все мои сообщения" color="neutral" variant="ghost" size="sm" :disabled="actionBusy" @click="selectOwnMessages"/><UButton label="Переслать" icon="i-lucide-forward" color="neutral" variant="soft" size="sm" :disabled="!selectedMessages.length||actionBusy" @click="startForward(selectedMessages.map(item=>item.id))"/><UButton label="Удалить выбранные" icon="i-lucide-trash-2" color="error" variant="soft" size="sm" :disabled="!selectedMessages.length||actionBusy" @click="error='';deletingBatch=[...selectedMessages]"/><UButton label="Отмена" color="neutral" variant="ghost" size="sm" :disabled="actionBusy" @click="closeSelection"/></div>
        <div ref="scroller" class="chat-messages" role="log" aria-label="Сообщения беседы" aria-live="polite" @scroll.passive="onScroll" @wheel.passive="closeMessageMenu"
          @contextmenu.capture="openFromMouse($event, actionBusy)"
          @mousedown.capture="openFromMouse($event, actionBusy)">
          <div class="chat-history-action"><UButton v-if="messageAnchor" label="К последним сообщениям" icon="i-lucide-arrow-down" color="neutral" variant="soft" size="sm" @click="latest"/><UButton v-if="messages.hasNextPage.value" label="Загрузить предыдущие сообщения" color="neutral" variant="soft" size="sm" :loading="loadingOlder" @click="older"/></div>
          <UAlert v-if="messages.error.value" color="error" title="Не удалось загрузить сообщения" :actions="[{label:'Повторить',onClick:()=>messages.refetch()}]"/>
          <p v-else-if="messages.isPending.value" class="chat-hint">Загружаем переписку…</p>
          <p v-else-if="!rows.length" class="chat-welcome">Начните обсуждение в «{{current.name}}»</p>
          <template v-if="!messages.error.value">
            <template v-for="(message,index) in visibleRows" :key="message.id">
              <div v-if="!index||day(visibleRows[index-1]!.createdAt)!==day(message.createdAt)" class="chat-date">{{day(message.createdAt)}}</div>
              <div v-if="message.seq===firstUnreadSeq" class="chat-unread-divider" role="separator" aria-label="Новые сообщения"><span>Новые сообщения</span></div>
              <div v-if="message.activity" tabindex="-1" class="chat-service-entry" :data-message-seq="message.seq" :data-seq="message.seq">
                <button v-if="message.activity.kind === 'pinned'" type="button" class="chat-service-note"
                  :title="time(message.createdAt)" @click="jumpToMessage({ seq: message.activity.messageSeq })">
                  {{activityLabel(message)}}
                </button>
                <span v-else class="chat-service-note" :title="time(message.createdAt)">{{activityLabel(message)}}</span>
              </div>
              <article v-else :data-message-seq="message.seq" :data-chat-message-id="message.deletedAt ? undefined : message.id" tabindex="-1" class="chat-message" :class="{'is-own':message.authorId===auth.user?.id,'is-highlighted':message.seq===messageAnchor,'mentions-me':message.mentionIds.includes(auth.user?.id||''),'is-selected':selectedMessages.some(item=>item.id===message.id)}">
                <UCheckbox v-if="selectionMode&&message.authorId===auth.user?.id" class="chat-message-select" @click.capture="captureSelectionShift" :model-value="selectedMessages.some(item=>item.id===message.id)" :aria-label="`Выбрать сообщение от ${time(message.createdAt)}`" :disabled="actionBusy" @update:model-value="value=>selectMessage(message,value===true)"/>
                <PersonAvatar v-if="message.authorId!==auth.user?.id" class="chat-message-avatar" :name="message.authorName||memberName(message.authorId)" :src="message.authorAvatarUrl" :title="message.authorName||memberName(message.authorId)"/>
                <div
                  class="chat-bubble"
                  :class="{ 'chat-context-trigger': !message.deletedAt }"
                  :tabindex="message.deletedAt ? undefined : 0"
                  :aria-haspopup="message.deletedAt ? undefined : 'menu'"
                  :aria-keyshortcuts="message.deletedAt ? undefined : 'Shift+F10 ContextMenu'"
                  @pointerdown="!message.deletedAt && !actionBusy && startPress($event, message.id)"
                  @keydown.self="!message.deletedAt && !actionBusy && openFromKeyboard($event, message.id)"
                >
                  <strong v-if="!personal && message.authorId!==auth.user?.id" class="chat-message-author">{{message.authorName||memberName(message.authorId)}}</strong>
                    <small v-if="message.forwardedFrom" class="chat-forwarded">Переслано от {{message.forwardedFrom.authorName}}</small>
                    <p v-if="message.text" class="chat-text"><span v-for="(part,i) in messageParts(message)" :key="i" :class="{'chat-mention':part.mention}">{{part.text}}</span></p>
                    <button v-for="task in message.tasks" :key="task.taskId" class="chat-task-card" :disabled="!task.available" @click="openTask(task)"><UIcon name="i-lucide-columns-3"/><span><strong>{{task.title}}</strong><small>{{!task.available?'Нет доступа к задаче':task.completed?'Кабан · Завершена':'Кабан · Открыть задачу'}}</small></span></button>
                    <button v-for="booking in message.bookings" :key="booking.id" type="button" class="chat-task-card"
                      :class="{ 'chat-booking-completed': booking.available && meetingRoomCompleted(booking.date, booking.end, bookingClock) }"
                      :disabled="!booking.available" @click="openBooking(booking)">
                      <UIcon name="i-lucide-calendar-clock"/><span><strong>{{ booking.title }}</strong><small>{{ booking.available ? `${dateLabel(booking.date)} · ${booking.start}–${booking.end}` : 'Бронь отменена' }}</small></span>
                    </button>
                    <button v-for="(password,i) in message.passwordCopies" :key="`${password.id}:${i}`" class="chat-password" @click="inlinePassword=password"><UIcon name="i-lucide-key-round"/><span><strong>{{password.title}}</strong><small>Пересланный пароль · открыть</small></span></button>
                    <ProjectChatActivities :message="message" :user-id="auth.user?.id" :busy="actionBusy" @interact="body=>interact(message,body)"/>
                    <ProjectChatAttachment v-for="file in message.files" :key="file.id" :project-id="project.id" :chat-id="current.id" :file="file"/>
                    <button v-for="id in message.passwordIds" :key="id" class="chat-password" :disabled="!passwords.data.value?.some(row=>row.id===id)" @click="activePasswordId=id"><UIcon name="i-lucide-key-round"/><span><strong>{{passwordTitle(id)}}</strong><small>Пароль проекта · нажмите, чтобы открыть</small></span></button>
                  <footer :data-seq="message.seq"><UIcon v-if="message.pinned" name="i-lucide-pin" aria-label="Закреплено"/><small v-if="message.editedAt&&!message.deletedAt" class="chat-edited" :title="`Изменено ${time(message.editedAt)}`">ред.</small><button v-if="!message.deletedAt" type="button" class="chat-message-time" aria-haspopup="menu"
                    :aria-label="`Действия с сообщением в ${time(message.createdAt)}`" title="Действия с сообщением" :disabled="actionBusy"
                    @click="openFromTimestamp($event, message.id)"><time :datetime="message.createdAt">{{time(message.createdAt)}}</time></button><UIcon v-if="message.authorId===auth.user?.id&&!message.deletedAt" name="i-lucide-check-check" class="chat-read-check" :class="{'is-read':readers(message).length>0}" :aria-label="readTitle(message)" :title="readTitle(message)"/></footer>
                </div>
              </article>
            </template>
          </template>
        </div>
        <!-- Mount with the virtual anchor so the menu can position itself without a trigger. -->
        <UDropdownMenu
          v-if="messageMenu"
          :open="true"
          :items="messageMenuItems"
          :modal="false"
          :content="{ reference: messageMenu.reference, positionStrategy: 'fixed', side: 'bottom', align: 'start', onEscapeKeyDown: restoreFocus }"
          @update:open="open => { if (!open) closeMessageMenu() }"
        />
        <div class="chat-typing" aria-live="polite"><Transition name="chat-typing"><span v-if="typingNames"><i class="typing-dots" aria-hidden="true"><b/><b/><b/></i>{{typingNames}} печатает</span></Transition></div>
        <form class="chat-composer" @submit.prevent="send">
          <UAlert v-if="error&&!managing&&!picker&&!editingMessage&&!deletingMessage&&!activityDialog&&!deletingBatch" color="error" :description="error"/>
          <div v-if="forwardDraft" class="chat-forward-draft"><UIcon name="i-lucide-forward"/><span><strong>Пересылаемых сообщений: {{forwardDraft.source.messageIds.length}}</strong><small>Добавьте комментарий или отправьте без него.</small></span><UButton icon="i-lucide-x" aria-label="Отменить пересылку" color="neutral" variant="ghost" :disabled="sending" @click="delete hub.forwardDrafts[forwardKey]"/></div>
          <div v-if="draft.tasks.length" class="chat-draft-activities"><span v-for="task in draft.tasks" :key="task.taskId"><UIcon name="i-lucide-columns-3"/>{{task.title}}<UButton icon="i-lucide-x" aria-label="Убрать задачу" color="neutral" variant="ghost" size="xs" :disabled="sending||draft.retry" @click="draft.tasks=draft.tasks.filter(item=>item.taskId!==task.taskId)"/></span></div>
          <div v-if="draft.bookings.length" class="chat-draft-activities">
            <span v-for="booking in draft.bookings" :key="booking.id"><UIcon name="i-lucide-calendar-clock"/>{{ booking.title }}
              <UButton icon="i-lucide-x" aria-label="Убрать бронь" color="neutral" variant="ghost" size="xs" :disabled="sending || draft.retry"
                @click="draft.bookings = draft.bookings.filter(item => item.id !== booking.id)" />
            </span>
          </div>
          <div v-if="draft.poll||draft.todo" class="chat-draft-activities"><span v-if="draft.poll"><UIcon name="i-lucide-chart-bar"/>Голосование: {{draft.poll.question}}<UButton icon="i-lucide-x" aria-label="Убрать голосование" color="neutral" variant="ghost" size="xs" :disabled="sending||draft.retry" @click="draft.poll=undefined"/></span><span v-if="draft.todo"><UIcon name="i-lucide-list-todo"/>Список дел: {{draft.todo.title}}<UButton icon="i-lucide-x" aria-label="Убрать список дел" color="neutral" variant="ghost" size="xs" :disabled="sending||draft.retry" @click="draft.todo=undefined"/></span></div>
          <div v-if="suggestedMentions.length" class="chat-mention-picker" role="listbox" aria-label="Упомянуть участника"><button v-for="member in suggestedMentions" :key="member.id" type="button" role="option" :aria-selected="false" @mousedown.prevent @click="insertMention(member.handle)"><PersonAvatar :name="member.name"/><span>{{member.name}}<small>@{{member.handle}}</small></span></button></div>
          <div v-if="attachmentCount" class="chat-draft-files"><span v-for="file in draft.files" :key="file.id"><UIcon name="i-lucide-paperclip"/>{{file.name}}<UButton icon="i-lucide-x" :aria-label="`Убрать вложение: ${file.name}`" color="neutral" variant="ghost" size="xs" :disabled="busy||sending||draft.retry" @click="removeFile(file)"/></span><span v-for="id in draft.passwordIds" :key="id"><UIcon name="i-lucide-key-round"/>{{passwordTitle(id)}}<UButton icon="i-lucide-x" :aria-label="`Убрать пароль: ${passwordTitle(id)}`" color="neutral" variant="ghost" size="xs" :disabled="sending||draft.retry" @click="draft.passwordIds=draft.passwordIds.filter(value=>value!==id)"/></span></div>
          <UButton v-if="draft.retry&&!sending" label="Изменить черновик" color="neutral" variant="ghost" @click="draft.retry=false;draft.nonce=''"/>
          <div class="chat-compose-row">
            <UDropdownMenu :items="[{label:'Загрузить файл или изображение',icon:'i-lucide-upload',onSelect:()=>showPicker('upload')},...(canViewDocuments?[{label:'Из документов проекта',icon:'i-lucide-folder-open',onSelect:()=>showPicker('documents')}]:[]),...(!personal?[{label:'Пароль проекта',icon:'i-lucide-key-round',onSelect:()=>showPicker('passwords')}]:[]),{label:'Задача Кабана',icon:'i-lucide-columns-3',onSelect:()=>taskPicker=true},{label:'Переговорная комната',icon:'i-lucide-calendar-clock',disabled:draft.bookings.length>=10,onSelect:()=>bookingPicker=true},{label:'Голосование',icon:'i-lucide-chart-bar',onSelect:()=>createActivity('poll')},{label:'Список дел',icon:'i-lucide-list-todo',onSelect:()=>createActivity('todo')}]"><UButton type="button" class="chat-compose-attach" icon="i-lucide-paperclip" aria-label="Добавить вложение" color="neutral" variant="outline" :disabled="busy||sending||draft.retry"/></UDropdownMenu>
            <UTextarea
              ref="chatInput"
              v-model="draft.text"
              aria-label="Сообщение"
              aria-description="Enter — отправить. Shift+Enter — новая строка."
              placeholder="Сообщение…"
              :maxlength="10000"
              :rows="1"
              autoresize
              class="chat-input"
              :disabled="sending || draft.retry"
              @keydown="enter"
              @input="trackCaret($event); typing.input(!!draft.text.trim())"
              @keyup="trackCaret"
              @click="trackCaret"
              @blur="typing.stop"
            />
            <UButton
              v-if="hasMessageContent || sending"
              type="submit"
              class="chat-compose-send"
              :icon="draft.retry ? 'i-lucide-refresh-cw' : 'i-lucide-send'"
              :aria-label="draft.retry ? 'Повторить отправку' : 'Отправить сообщение'"
              :loading="sending"
              :disabled="!canSend"
            />
          </div>
        </form>
      </div>
      <div v-else class="chat-no-selection"><UIcon name="i-lucide-messages-square"/><h2>Обсуждайте проект вместе</h2><p>{{chats.isPending.value?'Загружаем переписку…':'Выберите беседу или создайте новую.'}}</p><UButton v-if="!personal&&!chats.isPending.value" label="Создать беседу" icon="i-lucide-plus" @click="manage()"/></div>
      <ProjectChatInfo
        v-if="panel === 'info' && current"
        :key="current.id"
        :chat="current"
        :project-id="project.id"
        :personal="!!personal"
        :name="headerName"
        :avatar="headerAvatar"
        :status="headerStatus"
        :online="peer?.online"
        :can-manage="canEditAvatar"
        :mute-busy="actionBusy"
        :error="!managing && !avatarDialog ? error : ''"
        @close="closeInfo"
        @write="writeFromInfo"
        @mute="toggleMute"
        @pins="togglePins"
        @manage="manage(current)"
        @avatar="editAvatar"
        @jump="jumpToMessage"
      />
      <section v-if="panel === 'pins' && current" class="chat-pins-view" aria-label="Закреплённые сообщения">
        <header class="chat-pins-header">
          <UButton class="chat-pins-back" icon="i-lucide-arrow-left" aria-label="Назад" color="neutral" variant="ghost" @click="togglePins"/>
          <div class="chat-identity">
            <PersonAvatar class="chat-header-avatar" :name="headerName" :src="headerAvatar"/>
            <div class="chat-identity-text">
              <h2>Закреплённые сообщения</h2>
              <small>{{ headerName }}<template v-if="pinnedRows.length && !pinsFeed.hasNextPage.value"> · {{ pinnedRows.length }}</template></small>
            </div>
          </div>
        </header>
        <div ref="pinsScroller" class="chat-messages chat-pins-feed">
          <UAlert v-if="pinsFeed.error.value" color="error" title="Не удалось загрузить закреплённые сообщения" :actions="[{ label: 'Повторить', onClick: () => pinsFeed.refetch() }]"/>
          <p v-if="pinsFeed.isPending.value" class="chat-hint">Загружаем закреплённые…</p>
          <p v-else-if="!pinnedRows.length && !pinsFeed.error.value" class="chat-welcome">Закреплённых сообщений пока нет</p>
          <div v-if="pinsFeed.hasNextPage.value" class="chat-history-action">
            <UButton label="Загрузить более ранние" color="neutral" variant="soft" :loading="pinsFeed.isFetchingNextPage.value" @click="olderPins"/>
          </div>
          <template v-for="(message, index) in pinnedRows" :key="message.id">
            <div v-if="!index || day(pinnedRows[index - 1]!.createdAt) !== day(message.createdAt)" class="chat-date">{{ day(message.createdAt) }}</div>
            <div class="chat-message" :class="{ 'is-own': message.authorId === auth.user?.id }">
              <PersonAvatar v-if="message.authorId !== auth.user?.id" class="chat-message-avatar" :name="message.authorName || memberName(message.authorId)" :src="message.authorAvatarUrl"/>
              <button type="button" class="chat-bubble chat-pinned-message" title="Перейти к сообщению в беседе" @click="jumpToMessage(message)">
                <strong v-if="!personal && message.authorId !== auth.user?.id" class="chat-message-author">{{ message.authorName || memberName(message.authorId) }}</strong>
                <small v-if="message.forwardedFrom" class="chat-forwarded">Переслано от {{ message.forwardedFrom.authorName }}</small>
                <span v-if="message.text" class="chat-text">{{ message.text }}</span>
                <span v-if="message.poll || message.todo" class="chat-pinned-reference">
                  <UIcon :name="message.poll ? 'i-lucide-chart-bar' : 'i-lucide-list-todo'"/>{{ message.poll?.question || message.todo?.title }}
                </span>
                <ProjectChatAttachment v-for="file in message.files" :key="`${file.id}:${file.revision}`" :file="file" :project-id="project.id" :chat-id="current.id" preview-mode="pinned"/>
                <span v-for="task in message.tasks" :key="task.taskId" class="chat-pinned-reference"><UIcon name="i-lucide-columns-3"/>{{ task.title }}</span>
                <span v-for="booking in message.bookings" :key="booking.id" class="chat-pinned-reference"><UIcon name="i-lucide-calendar-clock"/>{{ booking.title }}</span>
                <span v-if="message.passwordIds.length || message.passwordCopies.length" class="chat-pinned-reference"><UIcon name="i-lucide-key-round"/>Пароль проекта</span>
                <span class="chat-pinned-meta"><UIcon name="i-lucide-pin" aria-label="Закреплено"/><time :datetime="message.createdAt">{{ time(message.createdAt) }}</time></span>
              </button>
            </div>
          </template>
        </div>
      </section>
      <aside v-if="panel === 'search' && current" class="chat-side-panel" aria-label="Поиск сообщений">
        <header><h3>Поиск сообщений</h3><UButton icon="i-lucide-x" aria-label="Закрыть панель" color="neutral" variant="ghost" @click="panel = null"/></header>
        <UInput v-model="messageSearch" placeholder="Поиск по всей переписке" aria-label="Поиск по всей переписке" icon="i-lucide-search" class="chat-panel-search"/>
        <div class="chat-panel-results">
          <p v-if="!searchTerm" class="chat-hint">Введите текст сообщения, заголовок голосования или пункт списка.</p>
          <UAlert v-else-if="searchFeed.error.value" color="error" title="Не удалось загрузить сообщения" :actions="[{ label: 'Повторить', onClick: () => searchFeed.refetch() }]"/>
          <template v-else>
            <button v-for="message in searchRows" :key="message.id" class="chat-panel-result" @click="jumpToMessage(message)"><strong>{{ message.authorName || memberName(message.authorId) }}</strong><span>{{ summary(message) }}</span><small>{{ day(message.createdAt) }} · {{ time(message.createdAt) }}</small></button>
            <p v-if="searchFeed.isFetching.value" class="chat-hint">Ищем в переписке…</p>
            <p v-else-if="!searchRows.length" class="chat-hint">Сообщения не найдены</p>
            <UButton v-if="searchFeed.hasNextPage.value" label="Загрузить ещё" color="neutral" variant="ghost" :loading="searchFeed.isFetchingNextPage.value" @click="searchFeed.fetchNextPage()"/>
          </template>
        </div>
      </aside>
    </div>
    <UModal v-model:open="avatarDialog" title="Аватар беседы" description="Загрузите изображение для этой беседы. По умолчанию отображается фото проекта." :dismissible="!avatarBusy">
      <template #body>
        <form class="chat-modal-form" @submit.prevent="saveAvatar">
          <PersonAvatar class="chat-avatar-preview" :name="headerName" :src="avatarDraft || project.profile?.avatar"/>
          <FileUpload label="Выбрать аватар беседы" hint="PNG, JPEG или WebP до 500 КБ" :accept="avatarAccept" :disabled="avatarBusy" @change="chooseAvatar"/>
          <UButton v-if="avatarDraft" type="button" label="Использовать фото проекта" color="neutral" variant="ghost" :disabled="avatarBusy" @click="avatarDraft = ''; avatarError = ''"/>
          <UAlert v-if="avatarError" color="error" :description="avatarError"/>
          <UButton type="submit" label="Сохранить" :loading="avatarBusy"/>
        </form>
      </template>
    </UModal>
    <UModal v-model:open="managing" :title="manageId?'Настройки беседы':'Создать беседу'" description="В беседу можно добавить только участников этого проекта. Приглашённые увидят всю историю сообщений и вложения." :dismissible="!busy"><template #body><form class="chat-modal-form" @submit.prevent="saveChat"><UFormField label="Название беседы" required><UInput v-model="manageName" placeholder="Например, Дизайнерский чат" required :maxlength="120" class="w-full"/></UFormField><fieldset class="chat-member-picker"><legend>Участники</legend><UCheckbox v-for="member in eligibleMembers" :key="member.userId" :model-value="manageMembers.includes(member.userId)" :label="`${member.fullName||member.email}${member.userId===auth.user?.id?' (вы)':''}`" :disabled="busy||member.userId===auth.user?.id" @update:model-value="value=>manageMembers=value?[...new Set([...manageMembers,member.userId])]:manageMembers.filter(id=>id!==member.userId)"/></fieldset><UAlert v-if="error" color="error" :description="error"/><UButton type="submit" :label="manageId?'Сохранить':'Создать беседу'" :loading="busy" :disabled="!manageName.trim()"/></form></template></UModal>
    <UModal :open="!!picker" :title="picker==='upload'?'Загрузить вложения':picker==='documents'?'Документы проекта':'Поделиться паролем проекта'" :dismissible="!busy" @update:open="value=>{if(!value)picker=null}"><template #body><div class="chat-modal-form"><UAlert v-if="error" color="error" :description="error"/><template v-if="picker==='upload'"><UCheckbox v-if="!personal" v-model="saveToDocuments" label="Сохранить также в «Документы проекта»" :disabled="!canSaveDocuments||busy"/><p v-if="!canSaveDocuments&&!personal" class="chat-hint">Вложения сохранятся в беседе. Для сохранения в документах нужны права редактирования раздела.</p><USelect v-if="saveToDocuments&&canSaveDocuments" v-model="uploadFolder" :items="folderOptions" aria-label="Папка в документах проекта" :disabled="busy||folders.isPending.value"/><UAlert v-if="folders.error.value" color="error" title="Не удалось загрузить папки" :actions="[{label:'Повторить',onClick:()=>folders.refetch()}]"/><FileUpload label="Выбрать файлы или изображения" hint="До 20 МБ на файл, до 10 вложений в сообщении." multiple :disabled="busy||draft.files.length>=10" @change="upload"/><p class="chat-hint">После загрузки нажмите «Отправить» в беседе.<template v-if="!personal"> Копия, сохранённая в документах, останется там, даже если убрать вложение из черновика.</template></p></template><template v-else><UInput v-model="pickerSearch" icon="i-lucide-search" placeholder="Поиск" aria-label="Поиск вложений"/><template v-if="picker==='documents'"><p class="chat-hint">В чат отправится копия документа. Она будет доступна участникам беседы независимо от доступа к оригиналу.</p><p v-if="documents.isPending.value">Загружаем файлы…</p><UAlert v-else-if="documents.error.value" color="error" title="Не удалось загрузить документы" :actions="[{label:'Повторить',onClick:()=>documents.refetch()}]"/><div v-else class="chat-picker-list"><button v-for="file in matchingFiles" :key="file.id" :disabled="busy||draft.files.length>=10" @click="attachDocument(file)"><UIcon name="i-lucide-file"/><span>{{file.name}}<small>{{documentSize(file.size)}}</small></span><UIcon name="i-lucide-plus"/></button><p v-if="!matchingFiles.length" class="chat-hint">Доступных файлов по этому запросу нет.</p></div></template><template v-else><p class="chat-hint">Все участники проекта уже имеют доступ к паролям этого раздела.</p><p v-if="passwords.isPending.value">Загружаем пароли…</p><UAlert v-else-if="passwords.error.value" color="error" title="Не удалось загрузить пароли" :actions="[{label:'Повторить',onClick:()=>passwords.refetch()}]"/><div v-else class="chat-picker-list"><button v-for="row in matchingPasswords" :key="row.id" :disabled="draft.passwordIds.length>=10||draft.passwordIds.includes(row.id)" @click="attachPassword(row.id)"><UIcon name="i-lucide-key-round"/><span>{{row.entry.title}}<small>{{row.entry.username}}</small></span><UIcon :name="draft.passwordIds.includes(row.id)?'i-lucide-check':'i-lucide-plus'"/></button><p v-if="!matchingPasswords.length" class="chat-hint">Добавьте используемые доступы в раздел «Пароли проекта».</p></div><UButton :to="`/projects/${project.id}/passwords`" label="Пароли проекта" icon="i-lucide-external-link" color="neutral" variant="outline"/></template></template></div></template></UModal>
    <UModal :open="!!editingMessage" title="Редактировать сообщение" :description="editingMessage?.forwardedFrom?'Изменение текста уберёт подпись исходного автора пересылки.':'Изменить текст может только отправитель.'" :dismissible="!actionBusy" @update:open="value=>{if(!value)editingMessage=null}"><template #body><form class="chat-modal-form" @submit.prevent="saveMessage"><UTextarea v-model="editText" aria-label="Текст сообщения" :rows="4" :maxlength="10000" class="w-full"/><UAlert v-if="error" color="error" :description="error"/><UButton type="submit" label="Сохранить" :loading="actionBusy"/></form></template></UModal>
    <UModal :open="!!deletingMessage" title="Удалить сообщение?" description="Сообщение будет удалено для всех участников беседы." :dismissible="!actionBusy" @update:open="value=>{if(!value)deletingMessage=null}"><template #body><p class="chat-hint">Сообщение исчезнет из переписки для всех участников.</p><UAlert v-if="error" color="error" :description="error"/></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="actionBusy" @click="deletingMessage=null"/><UButton label="Удалить" color="error" :loading="actionBusy" @click="deleteMessage"/></template></UModal>
    <UModal :open="!!activityDialog" :title="activityDialog==='poll'?'Добавить голосование':'Добавить список дел'" description="После добавления нажмите «Отправить» в беседе." @update:open="value=>{if(!value)activityDialog=null}"><template #body><form class="chat-modal-form" @submit.prevent="addActivity"><UFormField :label="activityDialog==='poll'?'Вопрос':'Название списка'" required><UInput v-model="activityTitle" required :maxlength="activityDialog==='poll'?300:200" class="w-full"/></UFormField><div v-for="(_,i) in activityItems" :key="i" class="chat-activity-item"><UInput v-model="activityItems[i]" :aria-label="`Пункт ${i+1}`" :placeholder="activityDialog==='poll'?'Вариант ответа':'Что нужно сделать'" required :maxlength="activityDialog==='poll'?160:300" class="flex-1"/><UButton v-if="activityItems.length>(activityDialog==='poll'?2:1)" icon="i-lucide-x" :aria-label="`Убрать пункт ${i+1}`" color="neutral" variant="ghost" @click="activityItems.splice(i,1)"/></div><UButton label="Добавить пункт" icon="i-lucide-plus" color="neutral" variant="outline" :disabled="activityItems.length>=(activityDialog==='poll'?20:100)" @click="activityItems.push('')"/><UAlert v-if="error" color="error" :description="error"/><UButton type="submit" label="Добавить в сообщение"/></form></template></UModal>
    <UModal :open="!!deletingBatch" title="Удалить выбранные сообщения?" :description="`Сообщений: ${deletingBatch?.length||0}. Они исчезнут из переписки для всех участников.`" :dismissible="!actionBusy" @update:open="value=>{if(!value)deletingBatch=null}"><template #body><p class="chat-hint">Можно удалять только свои сообщения.</p><UAlert v-if="error" color="error" :description="error"/></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="actionBusy" @click="deletingBatch=null"/><UButton label="Удалить выбранные" color="error" :loading="actionBusy" @click="deleteSelected"/></template></UModal>
    <ChatForwardModal v-if="forwarding" :source="forwarding" :in-page="!embedded" @close="forwarding=null" @prepared="closeSelection"/>
    <BookingPicker v-if="bookingPicker" allow-create @choose="addBooking" @close="bookingPicker = false" />
    <ChatTaskPicker v-if="taskPicker" :project-id="personal?undefined:project.id" @close="taskPicker=false" @choose="addTask"/>
    <CredentialDetails :entry="passwordDetail" :open="!!passwordDetail" :categories="[]" :links="[]" :busy="false" readonly @close="activePasswordId='';inlinePassword=null" @copy="copy"/>
  </section>
</template>
<style scoped>
.project-chats{display:grid;gap:16px;min-width:0}.chats-intro{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;color:#8292a8;font-size:12px;line-height:1.7}.chat-connection{display:flex;align-items:center;gap:6px;font-size:11px}.chat-connection i{width:6px;height:6px;border-radius:50%;background:#c69838}.chat-connection.is-connected i{background:#22a06b}.chats-shell{display:grid;grid-template-columns:280px minmax(0,1fr);height: min(760px,78vh);min-height:480px;border:1px solid #e2e8f0;border-radius:20px;background:white;overflow:hidden}.chats-sidebar{min-width:0;min-height:0;display:flex;flex-direction:column;border-right:1px solid #e8edf3}.chats-sidebar>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:15px 16px}.chats-sidebar h2{font-weight:600;font-size:14px;color:#334155}.chat-search{margin:0 12px 12px}.chats-sidebar nav{overflow:auto;min-height:0;flex:1}.chat-list-item{display:flex;align-items:center;gap:10px;padding:15px 12px;width:100%;text-align:left}.chat-list-item:hover{background:#f8fafc}.chat-list-item.is-active{background:#eef2ff}.chat-avatar{display:grid;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:50%;background:#e7ecf5;color:#6b7e9a;font-size:20px}.chat-list-label{min-width:0;flex:1;display:grid;gap:6px}.chat-list-label strong{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569}.chat-list-label small{font-size:10px;color:#94a3b8}.chat-conversation{display:flex;flex-direction:column;min-width:0;min-height:0}.chat-messages{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:12px 22px 20px;background:#f1f4f8;background-image:radial-gradient(#c9d3df55 .8px,transparent .8px);background-size:18px 18px;scrollbar-gutter:stable}.chat-history-action{text-align:center;margin-bottom:12px}.chat-date{width:fit-content;margin:16px auto;padding:4px 10px;border-radius:12px;background:#e0e6ee;color:#64748b;font-size:10px}.chat-message{display:flex;margin:8px 0;justify-content:flex-start}.chat-message.is-own{justify-content:flex-end}.chat-bubble{display:grid;gap:8px;min-width:100px;max-width:min(80%,600px);padding:10px 13px 7px;border-radius:14px 14px 14px 4px;background:white;box-shadow:0 1px 2px #33415512;overflow-wrap:anywhere}.is-own .chat-bubble{background:#e2f1e9;border-radius:14px 14px 4px 14px}.chat-message-author{font-size:11px;color:#6477a1}.chat-text{white-space:pre-wrap;font-size:13px;line-height:1.65;color:#334155}.chat-bubble footer{display:flex;align-items:center;justify-content:flex-end;gap:4px;font-size:9px;color:#94a3b8}.chat-read-check{width:17px;height:17px;color:#64748b}.chat-read-check.is-read{color:#008a43}.chat-password{display:flex;align-items:center;gap:10px;padding:10px;text-align:left;border:1px solid #cbd5e1;border-radius:10px}.chat-password>span{display:grid;gap:5px}.chat-password strong{font-size:12px}.chat-password small{font-size:10px;color:#8292a8}.chat-draft-files{display:flex;gap:6px;flex-wrap:wrap;max-height:110px;overflow:auto}.chat-draft-files>span{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:8px;background:#f1f5f9;max-width:100%;overflow-wrap:anywhere;font-size:11px;color:#64748b}.chat-no-selection{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:24px;background:#f6f8fb;color:#8292a8}.chat-no-selection>.iconify{font-size:48px}.chat-no-selection h2{font-size:20px;color:#475569}.chat-no-selection p,.chat-hint{font-size:12px;line-height:1.7;color:#8292a8}.chat-hint{padding:6px 12px}.chat-welcome{text-align:center;font-size:12px;color:#8292a8;margin:40px 0}.chat-mobile-back{display:none}.chat-modal-form{display:grid;gap:18px}.chat-member-picker{display:grid;gap:12px;max-height:320px;overflow:auto}.chat-member-picker legend{font-size:13px;font-weight:600;margin-bottom:12px}.chat-picker-list{display:grid;gap:8px;max-height:45vh;overflow:auto}.chat-picker-list>button{display:flex;align-items:center;gap:10px;padding:12px;border:1px solid #e2e8f0;border-radius:10px;text-align:left;font-size:13px}.chat-picker-list>button>span{display:grid;gap:5px;flex:1;overflow-wrap:anywhere}.chat-picker-list small{font-size:11px;color:#94a3b8}.chat-picker-list>button:hover{background:#f8fafc}.chat-picker-list>button:disabled{opacity:.5}.chat-list-item:focus-visible,.chat-picker-list>button:focus-visible{outline:2px solid #6366f1;outline-offset:-2px}@media(max-width:1000px){.chats-shell{grid-template-columns:230px minmax(0,1fr)}.chat-bubble{max-width:90%}}@media(max-width:700px){.chats-shell{grid-template-columns:minmax(0,1fr);height:75dvh;min-height:430px}.chat-conversation,.chat-no-selection{display:none}.chat-mobile-conversation .chats-sidebar{display:none}.chat-mobile-conversation .chat-conversation{display:flex}.chat-mobile-back{display:flex}.chat-messages{padding:10px}.chat-bubble{max-width:94%}.chats-intro{font-size:11px}}

.chats-shell{position:relative}.chats-with-panel{grid-template-columns:250px minmax(0,1fr) 280px}.chat-message{align-items:flex-end;gap:8px}.chat-message-avatar{width:30px;height:30px;flex:0 0 30px;border-radius:50%;overflow:hidden}.chat-context-trigger{-webkit-touch-callout:none;touch-action:pan-y pinch-zoom}.chat-message-time{border-radius:4px;color:inherit;cursor:pointer}.chat-message-time:hover{text-decoration:underline}.chat-message-time:focus-visible{outline:2px solid #6295b8;outline-offset:2px}.chat-context-trigger:focus-visible{outline:2px solid #6295b8;outline-offset:2px}.chat-message.mentions-me .chat-bubble{border-left:3px solid #3b82b6}.chat-message.is-highlighted .chat-bubble{outline:2px solid #82a9ca;outline-offset:3px}.chat-edited{font-size:9px;color:#8292a8}.chat-deleted{font-size:12px;font-style:italic;color:#8292a8}.chat-mention{color:#176da1;font-weight:600}.chat-muted-icon{width:14px;height:14px;color:#8292a8}.chat-side-panel{min-height:0;min-width:0;display:flex;flex-direction:column;border-left:1px solid #e2e8f0;background:#fff}.chat-side-panel>header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px;border-bottom:1px solid #e8edf3}.chat-side-panel h3{font-size:13px;font-weight:600}.chat-panel-search{margin:12px}.chat-panel-results{overflow:auto;flex:1;min-height:0;padding:8px}.chat-panel-result{display:grid;gap:7px;padding:13px 9px;border-bottom:1px solid #e8edf3;text-align:left;width:100%}.chat-panel-result strong{font-size:11px;color:#6477a1}.chat-panel-result span{font-size:12px;color:#475569;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}.chat-panel-result small{font-size:10px;color:#94a3b8}.chat-panel-result:hover{background:#f5f8fb}.chat-mention-picker{max-height:220px;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;background:white}.chat-mention-picker>button{display:flex;gap:10px;align-items:center;padding:8px 12px;width:100%;text-align:left}.chat-mention-picker>button:hover{background:#eef2ff}.chat-mention-picker>button>span:last-child{display:grid;gap:3px;font-size:12px}.chat-mention-picker small{font-size:10px;color:#8292a8}.chat-activity-item,.chat-draft-activities>span{display:flex;gap:8px;align-items:center}.chat-draft-activities{display:grid;gap:5px;font-size:12px;color:#64748b}.chat-draft-activities>span{padding:5px 10px;background:#f1f5f9;border-radius:8px;overflow-wrap:anywhere}.chat-unread-divider{display:flex;align-items:center;gap:12px;margin:22px 0;color:#718096;font-size:11px;letter-spacing:.2px}.chat-unread-divider::before,.chat-unread-divider::after{content:'';height:1px;flex:1;background:#c6ced8}.chat-unread-divider span{white-space:nowrap}.chat-history-action{display:flex;justify-content:center;gap:8px;flex-wrap:wrap}
@media(max-width:1150px){.chats-with-panel{grid-template-columns:230px minmax(0,1fr)}.chat-side-panel{position:absolute;right:0;top:0;bottom:0;width:min(330px,90%);z-index:20;box-shadow:-10px 0 30px #33415520}}
@media(max-width:700px){.chats-with-panel{grid-template-columns:minmax(0,1fr)}.chat-message-avatar{width:26px;height:26px;flex-basis:26px}.chat-side-panel{width:100%}.chat-bubble{max-width:calc(100% - 34px)}.is-own .chat-bubble{max-width:94%}}
.chat-selection-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:10px 14px;border-bottom:1px solid #dce3ed;background:#f4f7fb;font-size:12px;color:#64748b}.chat-message.is-selected{background:#d5e6f480;border-radius:12px;outline:1px solid #a8c3dc}.chat-message-select{flex-shrink:0;align-self:center;margin:0 4px}
.chat-message:has(.chat-message-select) .chat-bubble{max-width:calc(100% - 34px)}
.chat-forwarded{display:block;font-size:11px;color:#7a8b9f}.chat-task-card{display:flex;align-items:center;gap:10px;text-align:left;padding:10px;border:1px solid #b9c9d6;border-radius:10px}.chat-task-card>span{display:grid;gap:5px}.chat-task-card strong{font-size:12px}.chat-task-card small{font-size:10px;color:#8292a8}.chat-task-card:disabled{opacity:.65}.chat-embedded{display:flex;flex-direction:column;gap:0;min-height:0;height:100%}.chat-embedded .chats-shell{height:100%;flex:1;min-height:0;border:0;border-radius:0;grid-template-columns:minmax(0,1fr)}.chat-embedded:not(.chat-embedded-directory) .chats-sidebar{display:none}.chat-embedded.chats-with-panel .chats-shell{grid-template-columns:minmax(0,1fr) 260px}.chat-embedded .chat-side-panel{position:absolute;inset:0 0 0 auto;width:min(330px,100%);z-index:20}.chat-embedded.chat-embedded-directory .chats-shell{grid-template-columns:220px minmax(0,1fr)}@media(max-width:700px){.chat-embedded.chat-embedded-directory .chats-shell{grid-template-columns:minmax(0,1fr)}}
.chat-embedded{container-type:inline-size;container-name:chat-pane}@container chat-pane (max-width:650px){.chat-embedded-directory .chats-shell{grid-template-columns:minmax(0,1fr)}.chat-embedded-directory .chat-conversation{display:none}.chat-embedded-directory .chat-mobile-conversation .chats-sidebar{display:none}.chat-embedded-directory .chat-mobile-conversation .chat-conversation{display:flex}.chat-embedded-directory .chat-mobile-back{display:flex}}
</style>

<style scoped>.chat-forward-draft{display:flex;align-items:center;gap:10px;padding:8px 10px;border-left:3px solid #6295b8;background:#f1f5f9;border-radius:6px}.chat-forward-draft>span{display:grid;gap:4px;flex:1}.chat-forward-draft strong{font-size:12px;color:#475569}.chat-forward-draft small{font-size:11px;color:#8292a8}</style>

<style scoped>.chat-typing{height:24px;flex-shrink:0;padding:3px 18px;background:#f1f4f8;font-size:11px;color:#64748b}.chat-typing>span{display:flex;align-items:center;gap:8px}.typing-dots{display:flex;gap:3px;align-items:center;height:16px}.typing-dots b{width:4px;height:4px;border-radius:50%;background:#64748b;animation:chat-typing-dot 1.2s ease-in-out infinite}.typing-dots b:nth-child(2){animation-delay:.16s}.typing-dots b:nth-child(3){animation-delay:.32s}.chat-typing-enter-active,.chat-typing-leave-active{transition:opacity .2s ease}.chat-typing-enter-from,.chat-typing-leave-to{opacity:0}@keyframes chat-typing-dot{0%,60%,100%{transform:translateY(0);opacity:.45}30%{transform:translateY(-3px);opacity:1}}@media(prefers-reduced-motion:reduce){.typing-dots b{animation:none}.chat-typing-enter-active,.chat-typing-leave-active{transition:none}}</style>

<style scoped>
.chat-header {
  display: grid;
  gap: 7px;
  flex-shrink: 0;
  min-width: 0;
  padding: 9px clamp(8px, 2vw, 16px) 6px;
  background: #f1f4f8;
}
.chat-header-row {
  display: flex;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
}
.chat-identity,
.chat-header-actions,
.chat-pinned {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border: 1px solid #dce5ef;
  background: #fff;
  border-radius: 16px;
}
.chat-identity { flex: 1; padding: 4px 12px 4px 5px; }
.chat-identity-trigger { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; border-radius: 10px; text-align: left; }
.chat-identity-trigger:hover { background: #eff5fb; }
.chat-identity-trigger:focus-visible { outline: 2px solid #356c9e; outline-offset: 2px; }
.chat-info-chevron { margin-left: auto; flex-shrink: 0; color: #637b96; }
.chat-identity .chat-header-avatar { height: 34px; width: 34px; border-radius: 50%; }
.chat-identity-text { display: grid; gap: 2px; min-width: 0; }
.chat-identity-title, .chat-identity-text h2,
.chat-identity-text small,
.chat-pinned-preview small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-identity-title, .chat-identity-text h2 { color: #26374d; font-size: 14px; line-height: 18px; font-weight: 650; }
.chat-identity-text small { color: #5d6f85; font-size: 11px; line-height: 15px; }
.chat-identity-text small.is-online { color: #147354; font-weight: 600; }
.chat-header-actions { gap: 2px; padding: 0 4px; }
.chat-header .chat-header-button { flex-shrink: 0; border-radius: 10px; }

.chat-pinned {
  justify-content: space-between;
  padding-right: 4px;
  border-radius: 16px;
  background: #f7faff;
}
.chat-pinned-preview {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  flex: 1;
  margin: 3px 0 3px 3px;
  padding: 3px 8px 3px 5px;
  border-radius: 6px;
  color: #356c9e;
  text-align: left;
}
.chat-pinned-preview:hover { background: #ecf4fd; }
.chat-pinned-preview:focus-visible { outline: 2px solid #356c9e; outline-offset: -2px; }
.chat-pinned-preview > span:last-child { display: grid; gap: 1px; min-width: 0; }
.chat-pinned-preview strong { font-size: 11px; }
.chat-pinned-preview small { font-size: 12px; color: #334155; }
.chat-pin-marker {
  display: flex;
  flex: 0 0 3px;
  flex-direction: column;
  align-self: stretch;
  min-height: 28px;
  gap: 2px;
  margin-right: 2px;
}
.chat-pin-marker i { flex: 1; border-radius: 3px; background: #c8d8e8; }
.chat-pin-marker i:last-child { background: #356c9e; }
.chat-pins-view { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: #f1f4f8; }
.chat-pins-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px clamp(8px, 2vw, 16px) 6px;
}
.chat-pins-back { flex-shrink: 0; padding: 9px; border: 1px solid #dce5ef; border-radius: 12px; background: #fff; }
.chat-pins-feed { padding-block: 8px 18px; }
@media (hover: none) and (pointer: coarse) { .chat-context-trigger { user-select:none; -webkit-user-select:none; } }
.chat-service-entry { display:flex; justify-content:center; margin:4px 0; text-align:center; }
.chat-service-note { max-width:min(90%,560px); padding:3px 10px; border-radius:14px; color:#536176; background:#e1e6ee; font-size:11px; line-height:1.5; overflow-wrap:anywhere; }
button.chat-service-note:hover { text-decoration:underline; }
button.chat-service-note:focus-visible { outline:2px solid #356c9e; outline-offset:2px; }
.chat-pinned-message { text-align: left; min-width: 0; }
.chat-pinned-message:hover { box-shadow: 0 0 0 1px #b4cada; }
.chat-pinned-message:focus-visible { outline: 2px solid #356c9e; outline-offset: 2px; }
.chat-pinned-reference { display: flex; align-items: center; gap: 8px; color: #526781; font-size: 12px; }
.chat-pinned-reference > .iconify { flex-shrink: 0; }
.chat-pinned-meta { display: flex; justify-content: flex-end; align-items: center; gap: 4px; font-size: 10px; color: #526781; }
.chat-avatar-preview { width: 64px; height: 64px; font-size: 20px; border-radius: 50%; }

.chat-composer {
  position: relative;
  display: grid;
  gap: 8px;
  flex-shrink: 0;
  padding: 10px clamp(8px, 2vw, 16px) 12px;
  background: #f1f4f8;
}

.chat-compose-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.chat-input { flex: 1; min-width: 0; }
.chat-input :deep(textarea) {
  min-height: 42px;
  max-height: 126px;
  padding: 10px 15px;
  border-radius: 22px;
  background: #fff;
  font-size: 14px;
  line-height: 22px;
  overflow-y: auto;
  resize: none;
}

.chat-compose-attach,
.chat-compose-send {
  display: grid;
  place-items: center;
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  padding: 0;
  border-radius: 50%;
}
.chat-compose-attach { background: #fff; color: #475569; }
.chat-compose-attach:not(:disabled):hover { background: #e8edf6; }
.chat-compose-send { background: #356c9e; color: #fff; }
.chat-compose-send:not(:disabled):hover { background: #285782; }
</style>

<style scoped>
.chat-task-card.chat-booking-completed{background:color-mix(in srgb,var(--ui-success) 14%,var(--ui-bg))}
</style>
