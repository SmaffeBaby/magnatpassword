import type { RouteLocationNormalized, RouteLocationRaw } from 'vue-router'
import { z } from 'zod'
import { applicationForPath } from '~~/shared/utils/branding'
import { documentEditors } from '~~/shared/utils/project-documents'
import { officeSourceSchema } from '~~/shared/utils/office'
import { projectStages } from '~~/shared/utils/project-dashboard'
import { projectTaskView, projectTaskViews } from '~~/shared/utils/project-task-planning'

const editorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('office'), source: officeSourceSchema }),
  z.object({ kind: z.literal('chat'), projectId: z.union([z.uuid(), z.literal('personal')]), chatId: z.uuid(), fileId: z.uuid() }),
  z.object({ kind: z.literal('space'), projectId: z.uuid(), spaceId: z.uuid(), fileId: z.uuid() }),
  z.object({ kind: z.literal('local') })
])
export type ServiceTabEditor = z.infer<typeof editorSchema>
const tabSchema = z.object({
  id: z.uuid(),
  path: z.string().refine(path => /^\/(?![/\\])/.test(path) && !/\\/.test(path)),
  label: z.string().optional(),
  editor: editorSchema.optional()
})
const savedTabsSchema = z.object({ tabs: z.array(tabSchema), activeId: z.uuid().nullable() })
type ServiceTab = z.infer<typeof tabSchema>
type SavedTabs = z.infer<typeof savedTabsSchema>
type TabStorage = 'sessionStorage' | 'localStorage'
const stateKey = 'magnatServiceTab'
const storagePrefix = 'magnat-service-tabs:'

function readSnapshot(storage: TabStorage, key: string): SavedTabs | undefined {
  try {
    const result = savedTabsSchema.safeParse(JSON.parse(window[storage].getItem(key) ?? 'null'))
    return result.success ? result.data : undefined
  } catch { return undefined }
}

function writeSnapshot(storage: TabStorage, key: string, snapshot: string) {
  try { window[storage].setItem(key, snapshot) }
  catch { /* Navigation still works when browser storage is unavailable. */ }
}

export function describeService(path: string) {
  const [, root, section] = path.split('/')
  if (root === 'office') {
    const editor = documentEditors.find(item => item.key === section)
    return editor ? { slug: `office-${editor.key}`, name: editor.label } : null
  }
  if (root === 'spaces') return { slug: 'spaces', name: 'Пространства' }
  if (root === 'meeting-room') return { slug: 'meeting-room', name: 'Переговорная комната' }
  if (root === 'profile' || root === 'settings') return { slug: 'account', name: 'Профиль' }
  return applicationForPath(path)
}

const pageTitles: Record<string, string> = {
  '/': 'Главная',
  '/projects': 'Все проекты',
  '/profile': 'Мой профиль',
  '/settings/account': 'Настройки аккаунта',
  '/settings/app-version': 'Версия приложения',
  '/password/categories': 'Категории',
  '/categories': 'Категории',
  '/finances/subscriptions': 'Ближайшие подписки',
  '/finances/calendar': 'Календарь подписок',
  '/finances/history': 'История списаний',
  '/relationships/map': 'Карта взаимосвязей',
  '/downloads': 'Загрузки'
}
const recordSections: Record<string, string> = {
  calendar: 'Календарь договоров',
  counterparties: 'Контрагенты',
  'legal-entities': 'Наши юр. лица',
  'document-templates': 'Шаблоны документов'
}
const projectSections: Record<string, string> = {
  ...recordSections,
  spaces: 'Пространства',
  chats: 'Чаты проекта',
  passwords: 'Пароли проекта',
  documents: 'Документы проекта',
  economy: 'Экономика проекта',
  relationships: 'Взаимосвязь'
}

export function servicePageTitle(fullPath: string): string {
  const url = fullPath.split('#', 1)[0]!
  const queryStart = url.indexOf('?')
  const pathname = queryStart < 0 ? url : url.slice(0, queryStart)
  const path = pathname.replace(/\/$/, '') || '/'
  const [, root, id, section] = path.split('/')
  const params = new URLSearchParams(queryStart < 0 ? '' : url.slice(queryStart + 1))
  const view = projectTaskView(params.get('view'))
  if ((root === 'projects' && section === 'tasks') || root === 'kaban' || root === 'kaban-legacy') {
    if (view !== 'board' || root !== 'kaban') return projectTaskViews.find(item => item.value === view)!.label
    const filter = params.get('view')
    return filter === 'mine' ? 'Мои задачи' : filter === 'all' ? 'Все задачи' : 'Все проекты'
  }
  if (root === 'projects' && id) {
    if (!section) return 'Обзор проекта'
    const stage = projectStages.find(stage => stage.key === section)
    return stage?.label ?? (Object.hasOwn(projectSections, section) ? projectSections[section] : undefined) ?? 'Проекты'
  }
  if (path === '/projects' || path === '/contract-register') {
    const tab = params.get('tab')
    if (tab && Object.hasOwn(recordSections, tab) && recordSections[tab]) return recordSections[tab]
  }
  if (root === 'team' && id) return 'Профиль участника'
  if (path === '/password' && params.get('view') === 'favorites') return 'Избранное'
  return pageTitles[path] ?? describeService(path)?.name ?? 'Все сервисы'
}

export const useServiceTabsStore = defineStore('service-tabs', () => {
  const router = useRouter()
  const tabs = ref<ServiceTab[]>([])
  const activeId = ref('')
  const headerBottom = ref(0)
  const active = computed(() => tabs.value.find(tab => tab.id === activeId.value))
  const pending = new Map<string, ServiceTab>()
  const closeHandlers = new Map<string, () => boolean>()
  const replacements = new Map<string, RouteLocationRaw>()
  const savedViews = new Map<string, unknown>()
  let removeHook: (() => void) | undefined
  let accountId: string | undefined
  let lastSnapshot: string | undefined

  function restorable(tab: ServiceTab) {
    if (/^\/auth(?:[/?#]|$)/.test(tab.path)) return false
    try {
      const route = router.resolve(tab.path)
      return route.path !== '/' && route.matched.length > 0
    }
    catch { return false }
  }

  function persist() {
    if (!import.meta.client || !accountId) return
    const saved = tabs.value.filter(restorable)
    const current = saved.find(tab => tab.id === activeId.value) ?? saved.at(-1)
    const snapshot = JSON.stringify({ tabs: saved, activeId: current?.id ?? null })
    if (snapshot === lastSnapshot) return
    const key = storagePrefix + accountId
    writeSnapshot('sessionStorage', key, snapshot)
    writeSnapshot('localStorage', key, snapshot)
    lastSnapshot = snapshot
  }

  function setAccount(id?: string) {
    if (!import.meta.client || id === accountId) return
    if (accountId) {
      persist()
      accountId = undefined
      lastSnapshot = undefined
      reset()
    }
    if (!id) return
    accountId = id
    const route = router.currentRoute.value
    const key = storagePrefix + id
    const durable = readSnapshot('localStorage', key)
    const saved = readSnapshot('sessionStorage', key) ?? durable
    if (saved) {
      const seen = new Set<string>()
      tabs.value = saved.tabs.filter(tab => {
        if (seen.has(tab.id) || !restorable(tab)) return false
        seen.add(tab.id)
        return true
      })
      lastSnapshot = JSON.stringify(saved)
      writeSnapshot('sessionStorage', key, lastSnapshot)
      if (!durable) writeSnapshot('localStorage', key, lastSnapshot)

      const historyId = window.history.state?.[stateKey]
      const matching = tabs.value.filter(tab => tab.path === route.fullPath)
      const historyTab = matching.find(tab => tab.id === historyId)
      const previous = tabs.value.find(tab => tab.id === saved.activeId)
      const restoreRoute = () => {
        const restoredTab = historyTab ?? matching.find(tab => tab.id === saved.activeId) ?? matching[0]
        activeId.value = restoredTab?.id ?? ''
        window.history.replaceState({ ...window.history.state, [stateKey]: restoredTab?.id ?? null }, '')
        sync(route)
      }
      const launchingHome = route.path === '/' && historyId !== null && !route.hash && Object.keys(route.query).every(key => key === 'native' || key === 'appVersion')
      if (launchingHome && !historyTab && previous && router.resolve(previous.path).path !== '/') {
        activeId.value = previous.id
        void visit(previous.path, previous.id, true).catch(() => false).then(success => {
          if (!success && accountId === id && router.currentRoute.value === route) restoreRoute()
        })
        return
      }
      restoreRoute()
    }
    persist()
  }

  watch([tabs, activeId], persist, { deep: true })

  function sync(to: RouteLocationNormalized, from?: RouteLocationNormalized) {
    if (!import.meta.client) return
    const state = window.history.state?.[stateKey]
    if (to.path === '/') {
      activeId.value = ''
      if (state !== null && (typeof state === 'string' || (from && from.path !== '/'))) {
        window.history.replaceState({ ...window.history.state, [stateKey]: null }, '')
      }
      return
    }

    const fromHome = from?.path === '/'
    const matchesDestination = (tab: ServiceTab) => !tab.editor && tab.path === to.fullPath
    const existing = fromHome && typeof state !== 'string'
      ? (active.value && matchesDestination(active.value) ? active.value : tabs.value.find(matchesDestination))
      : undefined
    const fromService = from && describeService(from.path), toService = describeService(to.path)
    const crossService = !!fromService && !!toService && fromService.slug !== toService.slug
    const leavingEditor = !!active.value?.editor && !to.path.startsWith('/office/')
    const keepActive = !fromHome && !crossService && !leavingEditor
    const id = typeof state === 'string' ? state : existing?.id ?? ((keepActive && activeId.value) || crypto.randomUUID())
    let tab = tabs.value.find(item => item.id === id)
    if (!tab) {
      const draft = pending.get(id)
      tabs.value.push({ id, path: to.fullPath, label: draft?.label, editor: draft?.editor })
      tab = tabs.value.at(-1)!
    }
    if (tab.label && !tab.editor && tab.path !== to.fullPath) {
      const previous = router.resolve(tab.path)
      if ((previous.path !== to.path && !(previous.path === '/kaban' && to.path === '/kaban-legacy')) ||
          previous.query.chat !== to.query.chat || previous.query.task !== to.query.task) tab.label = undefined
    }
    tab.path = to.fullPath
    activeId.value = id
    if (state !== id) window.history.replaceState({ ...window.history.state, [stateKey]: id }, '')
  }

  function start() {
    if (removeHook) return
    sync(router.currentRoute.value)
    removeHook = router.afterEach((to, from, failure) => { if (!failure) sync(to, from) })
    window.addEventListener('pagehide', persist)
  }

  async function visit(to: RouteLocationRaw, id: string | null, replace = false) {
    const target = router.resolve(to)
    const options = { path: target.path, query: target.query, hash: target.hash, state: { [stateKey]: target.path === '/' ? null : id }, force: true }
    const failure = await (replace ? router.replace(options) : router.push(options))
    return !failure
  }

  function open(to: RouteLocationRaw, label?: string, id: string = crypto.randomUUID(), editor?: ServiceTabEditor) {
    const target = router.resolve(to)
    if (target.path === '/') return visit(to, null)
    const tab = { id, path: target.fullPath, label, editor }
    pending.set(id, tab)
    return visit(to, id).finally(() => pending.delete(id))
  }

  function select(id: string) {
    const tab = tabs.value.find(item => item.id === id)
    if (tab && id !== activeId.value) return visit(tab.path, id)
  }

  async function replace(to: RouteLocationRaw) {
    if (router.resolve(to).path === '/') return visit(to, null)
    const id = activeId.value || crypto.randomUUID()
    const handler = closeHandlers.get(id)
    if (handler) {
      replacements.set(id, to)
      if (!handler()) replacements.delete(id)
      return
    }
    if (!await visit(to, id)) return false
    const tab = tabs.value.find(item => item.id === id)
    if (tab) { tab.label = undefined; tab.editor = undefined }
    return true
  }

  async function remove(id: string) {
    const index = tabs.value.findIndex(tab => tab.id === id)
    if (index < 0) return true
    const replacement = replacements.get(id)
    if (replacement) {
      replacements.delete(id)
      if (!await visit(replacement, id, true)) return false
      const tab = tabs.value.find(item => item.id === id)
      if (tab) { tab.label = undefined; tab.editor = undefined }
      return true
    }
    if (activeId.value === id) {
      const next = tabs.value[index + 1] ?? tabs.value[index - 1]
      if (!await visit(next?.path ?? '/', next?.id ?? null, true)) return false
    }
    tabs.value = tabs.value.filter(tab => tab.id !== id)
    savedViews.delete(id)
    closeHandlers.delete(id)
    return true
  }

  async function close(id: string) {
    replacements.delete(id)
    const handler = closeHandlers.get(id)
    if (!handler) return remove(id)
    if (id === activeId.value || await select(id)) handler()
  }

  function move(id: string, position: number) {
    const index = tabs.value.findIndex(tab => tab.id === id)
    if (index < 0 || !Number.isInteger(position)) return false
    const target = Math.max(0, Math.min(tabs.value.length - 1, position))
    if (index === target) return false
    const reordered = [...tabs.value]
    const [tab] = reordered.splice(index, 1)
    reordered.splice(target, 0, tab!)
    tabs.value = reordered
    return true
  }

  function setCloseHandler(id: string, handler?: () => boolean) {
    if (handler) closeHandlers.set(id, handler)
    else closeHandlers.delete(id)
  }
  function cancelReplacement(id: string) { replacements.delete(id) }

  function setEditor(id: string, editor: ServiceTabEditor, label: string) {
    const tab = tabs.value.find(item => item.id === id)
    if (tab) { tab.editor = editor; tab.label = label }
  }

  function reset() {
    tabs.value = []
    activeId.value = ''
    pending.clear()
    closeHandlers.clear()
    replacements.clear()
    savedViews.clear()
    if (import.meta.client) {
      window.history.replaceState({ ...window.history.state, [stateKey]: null }, '')
      sync(router.currentRoute.value)
    }
  }

  function saveView(id: string, view: unknown) {
    if (tabs.value.some(tab => tab.id === id)) savedViews.set(id, view)
  }
  function readView<T>(id: string) { return savedViews.get(id) as T | undefined }

  return { tabs, activeId, active, headerBottom, start, setAccount, open, select, replace, remove, close, move, setEditor, setCloseHandler, cancelReplacement, saveView, readView }
})
