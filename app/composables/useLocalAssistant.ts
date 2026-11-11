import type { AssistantAction, AssistantContext, AssistantDraft, AssistantReply, AssistantQueueStatus, AssistantChoice, AssistantConversation } from '~~/shared/types/assistant'
import { assistantPage } from '~~/shared/utils/assistant-help'
import { assistantActionKind } from '~~/shared/utils/assistant'
interface Message { id: string; role: 'user' | 'assistant'; content: string; complete?: boolean; requestContent?: string }
export function useLocalAssistant() {
  const auth = useAuthStore(), vault = useVaultStore(), route = useRoute()
  const visible = computed(() => !!auth.user && vault.unlocked)
  const open = ref(false), capabilities = ref(false), prompt = ref(''), error = ref('')
  const queueStatus = ref<AssistantQueueStatus | null>(null)
  const status = ref<'ready' | 'submitted' | 'streaming'>('ready'), contextBusy = ref(false)
  const busy = computed(() => status.value !== 'ready')
  const messages = ref<Message[]>([]), draft = ref<AssistantDraft | null>(null), action = ref<AssistantAction | null>(null)
  const choice = ref<AssistantChoice | null>(null), conversation = ref<AssistantConversation>({})
  let pendingRequest: { content: string; mode: 'chat' | 'credential' | AssistantAction['kind'] } | null = null
  const links = ref<{ label: string; to: string }[]>([]), files = ref<File[]>([])
  const context = ref<AssistantContext | null>(null)
  const projectId = ref(''), vaultId = ref(''), recordKey = ref('')
  const pendingDraft = useState<AssistantDraft | null>('assistant-draft', () => null)
  let controller: AbortController | undefined, generation = 0, contextGeneration = 0
  const chatMessages = computed(() => messages.value.map(message => ({ id: message.id, role: message.role, parts: message.content ? [{ type: 'text' as const, text: message.content }] : [] })))
  function addMessage(content: string, role: Message['role'] = 'assistant') { const message = { id: crypto.randomUUID(), role, content }; messages.value.push(message); return message.id }
  function stop() { queueStatus.value = null; generation++; controller?.abort(); controller = undefined; status.value = 'ready' }
  function clear() { stop(); choice.value = null; conversation.value = {}; pendingRequest = null; projectId.value = ''; vaultId.value = ''; recordKey.value = ''; messages.value = []; draft.value = null; action.value = null; links.value = []; prompt.value = ''; error.value = ''; files.value = []; pendingDraft.value = null }
  function resetAccount() { clear(); contextGeneration++; context.value = null; projectId.value = ''; vaultId.value = ''; recordKey.value = ''; capabilities.value = false }
  watch(() => auth.user?.id, resetAccount)
  watch(visible, value => { if (!value) { open.value = false; resetAccount() } })
  onBeforeUnmount(resetAccount)
  async function loadContext() {
    if (!visible.value) return
    const current = ++contextGeneration
    contextBusy.value = true
    try {
      const query = new URLSearchParams({ vaultId: vaultId.value || 'personal', ...(projectId.value ? { projectId: projectId.value } : {}) })
      const result = await sharedRequest<AssistantContext>(`/api/assistant/context?${query}`)
      if (contextGeneration === current && visible.value) context.value = result
    } catch (failure: any) { if (contextGeneration === current) { context.value = null; error.value = failure?.data?.message || 'Не удалось обновить доступные данные.' } }
    finally { if (contextGeneration === current) contextBusy.value = false }
  }
  watch(open, value => {
    if (!value) return
    const id = route.path.match(/^\/projects\/([0-9a-f-]{36})(?:\/|$)/i)?.[1]
    if (id && id !== projectId.value) projectId.value = id
    else void loadContext()
  })
  watch(projectId, () => { if (open.value) void loadContext() })
  async function changeVault(id: string) { vaultId.value = id; await loadContext() }
  async function selectChoice(option: { id: string; label: string; disabled?: boolean }) {
    if (option.disabled || contextBusy.value || busy.value || !choice.value || !pendingRequest) return
    const request = { ...pendingRequest }, kind = choice.value.kind
    if (kind === 'vault') await changeVault(option.id)
    if (kind === 'project') projectId.value = option.id
    if (kind === 'record') recordKey.value = option.id
    if (kind === 'person') conversation.value = { ...conversation.value, personId: option.id, personName: option.label, topic: 'person' }
    choice.value = null
    await send(request.mode, request.content, `Выбираю: ${option.label}`)
  }

  function chooseFiles(selected: File[]) {
    if (selected.some(file => !file.size || file.size > 20 * 1024 * 1024) || files.value.length + selected.length > 20) { error.value = 'Можно выбрать до 20 непустых файлов, каждый до 20 МБ.'; return }
    files.value.push(...selected); error.value = ''
    action.value = { kind: 'attach_files', title: '', description: '', dueOn: '', taskName: '', stageName: '' }
  }
  async function send(mode: 'chat' | 'credential' | AssistantAction['kind'] = 'chat', override?: string, display?: string) {
    if (busy.value || !(override || prompt.value.trim())) return
    if (!override && choice.value) {
      const named = choice.value.options.filter(option => option.label.toLocaleLowerCase('ru') === prompt.value.trim().toLocaleLowerCase('ru'))
      if (named.length === 1) { await selectChoice(named[0]!); return }
    }
    const content = override || prompt.value.trim()
    // Resolve a unique explicitly named project before asking the model; IDs never come from model output.
    const matches = context.value?.projects.filter(project => content.toLocaleLowerCase('ru').includes(project.name.toLocaleLowerCase('ru'))) || []
    if (matches.length === 1) projectId.value = matches[0]!.id
    const userId = addMessage(display || content, 'user');
    if (display) messages.value.find(message => message.id === userId)!.requestContent = content;
    if (!display) recordKey.value = '';
    choice.value = null; prompt.value = ''; error.value = ''; queueStatus.value = null; status.value = 'submitted'
    const history = messages.value.filter(message => message.complete !== false).slice(-7).map(message => ({ ...message, content: message.requestContent || (message.role === 'assistant' ? message.content.slice(0, 1800) : message.content) }))
    while (history.length > 1 && history.reduce((n, item) => n + item.content.length, 0) > 4500) history.shift()
    const current = ++generation
    controller = new AbortController()
    const assistantId = addMessage('')
    let complete = false
    try {
      const stream = await sharedRequest<ReadableStream<Uint8Array>>('/api/assistant/chat', { method: 'POST', signal: controller.signal, responseType: 'stream', body: { stream: true, mode, conversation: conversation.value, page: assistantPage(route.path), selection: { ...(projectId.value ? { projectId: projectId.value } : {}), ...(vaultId.value ? { vaultId: vaultId.value } : {}), ...(recordKey.value ? { recordKey: recordKey.value } : {}) }, draft: draft.value, messages: history.map(({ role, content }) => ({ role, content })) } })
      const reader = stream.getReader(), decoder = new TextDecoder()
      let buffer = ''
      function consume(frame: string) {
        const line = frame.split('\n').find(line => line.startsWith('data:'))
        if (!line) return
        const item = JSON.parse(line.slice(5))
        if (current !== generation) return
        const message = messages.value.find(message => message.id === assistantId)!
        if (item.type === 'queue') { queueStatus.value = { state: item.state, position: item.position, waiting: item.waiting, waitedMs: item.waitedMs }; return }
        if (item.type === 'error') { if (item.discard) message.content = ''; throw new Error(item.message) }
        if (item.type === 'delta') { queueStatus.value = null; status.value = 'streaming'; message.content += item.text }
        if (item.type === 'reply') {
          queueStatus.value = null
          const reply = item.reply as AssistantReply
          message.content = reply.message; message.complete = true; complete = true
          if (reply.conversation) conversation.value = { ...conversation.value, ...reply.conversation }
          choice.value = reply.choice || null
          pendingRequest = reply.choice ? { content, mode } : null
          if (reply.projectId && projectId.value !== reply.projectId) projectId.value = reply.projectId
          if (reply.draft) draft.value = reply.draft
          action.value = reply.choice ? null : reply.action ?? action.value; links.value = reply.links || []
        }
      }
      try {
        while (true) {
          const part = await reader.read(); if (part.done) break
          buffer += decoder.decode(part.value, { stream: true }).replace(/\r\n/g, '\n')
          let end: number
          while ((end = buffer.indexOf('\n\n')) >= 0) { const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2); consume(frame) }
        }
        buffer += decoder.decode(); if (buffer.trim()) consume(buffer)
      } finally { reader.releaseLock() }
      if (!complete && current === generation) throw new Error('Ответ прервался. Повторите запрос.')
    } catch (failure: any) {
      const message = messages.value.find(message => message.id === assistantId)
      if (message && !complete) { message.complete = false; message.content = '' }
      if (current === generation) { error.value = failure?.data?.message || failure.message || 'Не удалось получить ответ.'; prompt.value = content }
    } finally { if (current === generation) { queueStatus.value = null; status.value = 'ready'; controller = undefined } }
    // Short acknowledgements can use JSON replies as well as SSE.
  }
  async function review() {
    if (!draft.value) return
    const value = { ...draft.value }; clear(); open.value = false; pendingDraft.value = value
    await navigateTo('/password')
  }
  async function actionDone(message: string) {
    addMessage(message); action.value = null
    await loadContext()
    window.dispatchEvent(new CustomEvent('assistant:updated'))
  }
  return { visible, open, capabilities, prompt, error, status, queueStatus, busy, messages, chatMessages, draft, action, links, files, context, contextBusy, projectId, vaultId, recordKey, choice, conversation, selectChoice, changeVault, send, stop, clear, review, loadContext, chooseFiles, actionDone, addMessage, assistantActionKind }
}
