import { addPeriod, todayDate, validDate, nextPaidUntil, subscriptionRows } from '~~/shared/utils/subscriptions'
import type { AppNotification } from '~~/shared/types/subscriptions'
import type { CustomField } from '~~/shared/types/vault'
import { cardKey } from '~~/shared/utils/relationships'
import type { CredentialLink } from '~~/shared/types/vault'
import type { Credential, Category, VaultData } from '~~/shared/types/vault'
import type { VaultSource } from '~~/shared/types/sharing'
import { createId, copyText } from '~/utils/browser'
import { generatePassword, safeUrl } from '~~/shared/utils/crypto'
import { sourceEntries, sourceCategories, categoryFilterId, type ScopedCredential, type ScopedCategory } from '~~/shared/utils/vault-sources'

export function useVaultWorkspace(props: { embedded?: boolean; mode?: string }) {
  const { productName } = useAccountBrand()
  const vault = useVaultStore(), auth = useAuthStore(), shared = useSharedVaultsStore(), toast = useToast()
  const workspaceId = useState<string>('selected-vault', () => 'all')
  const sources = computed<VaultSource[]>(() => [{ id: 'personal', name: vault.data.name || 'Личное', data: vault.data }, ...shared.groups.map(g => ({ id: g.id, name: g.name, data: g.data }))])
  const visibleSources = computed(() => workspaceId.value === 'all' ? sources.value : sources.value.filter(s => s.id === workspaceId.value))
  const workspaceName = computed(() => workspaceId.value === 'all' ? 'Все хранилища' : sources.value.find(s => s.id === workspaceId.value)?.name ?? 'Хранилище')
  const entries = computed(() => sourceEntries(visibleSources.value)), categories = computed(() => sourceCategories(visibleSources.value))
  const busy = computed(() => vault.busy || shared.busy || shared.loading), error = computed(() => vault.error || shared.error)
  const active = ref('all'), query = ref(''), sort = ref('updated'), mobileOpen = ref(false)
  const entryOpen = ref(false), categoryOpen = ref(false), deleteOpen = ref(false), showPassword = ref(false)
  const editingVaultId = ref('personal'), categoryVaultId = ref('personal')
  const deleting = ref<ScopedCredential | ScopedCategory | null>(null), deletingCategory = ref(false), formError = ref('')
  const blankEntry = (): Credential => ({ id: '', title: '', url: '', username: '', password: '', notes: '', categoryId: '', customFields: [], links: [], favorite: false, createdAt: '', updatedAt: '' })
  const form = reactive<Credential>(blankEntry())
  const subscriptionSettings = useSubscriptionSettings(() => form.customFields ?? [])
  watch(entryOpen, open => { if (!open) subscriptionSettings.subscriptionOpen.value = false })
  const categoryForm = reactive<Category>({ id: '', name: '', icon: 'i-lucide-folder', color: '#6366f1' })
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6']
  const icons = ['i-lucide-folder', 'i-lucide-briefcase-business', 'i-lucide-user-round', 'i-lucide-landmark', 'i-lucide-app-window', 'i-lucide-globe', 'i-lucide-gamepad-2', 'i-lucide-shopping-bag']
  const source = (id: string) => sources.value.find(s => s.id === id)
  const vaultOptions = computed(() => sources.value.map(s => ({ label: s.name, value: s.id })))
  const categoryOptions = computed(() => [{ label: 'Без категории', value: '__none' }, ...(source(editingVaultId.value)?.data.categories ?? []).map(c => ({ label: c.name, value: c.id }))])
  const selectedCategory = computed({ get: () => form.categoryId || '__none', set: value => { form.categoryId = value === '__none' ? '' : value } })
  const favorites = computed(() => entries.value.filter(e => e.favorite).length)
  const category = (filterId: string) => categories.value.find(c => c.filterId === filterId)
  const entryCategory = (entry: ScopedCredential) => source(entry.vaultId)?.data.categories.find(c => c.id === entry.categoryId)
  const categoryCount = (c: ScopedCategory) => entries.value.filter(e => e.vaultId === c.vaultId && e.categoryId === c.id).length
  const calendarMode = computed(() => active.value === 'subscriptions')
  const subscriptionCount = computed(() => subscriptionRows(entries.value).length)
  const graphMode = computed(() => active.value === 'relationships')
  const title = computed(() => calendarMode.value ? 'Календарь подписок' : graphMode.value ? 'Взаимосвязь' : active.value === 'all' ? 'Все пароли' : active.value === 'favorites' ? 'Избранное' : category(active.value)?.name ?? 'Все пароли')
  const filtered = computed(() => entries.value.filter(e => (active.value === 'all' || (active.value === 'favorites' ? e.favorite : categoryFilterId(e.vaultId, e.categoryId) === active.value)) && [e.title, e.username, e.url, e.notes, e.vaultName, ...(e.customFields ?? []).filter(f => f.type !== 'secret').map(f => `${f.label} ${f.value}`)].some(v => v.toLowerCase().includes(query.value.toLowerCase()))).sort((a, b) => sort.value === 'title' ? a.title.localeCompare(b.title, 'ru') : b.updatedAt.localeCompare(a.updatedAt)))
  const categoryMode = computed(() => props.mode === 'categories')
  function copyData(id: string): VaultData | null {
    const value = source(id)?.data
    if (!value) { formError.value = 'Хранилище недоступно. Обновите список.'; return null }
    return JSON.parse(JSON.stringify(value))
  }
  const saveData = (id: string, next: VaultData) => id === 'personal' ? vault.save(next) : shared.save(id, next)
  const defaultTarget = () => category(active.value)?.vaultId ?? (workspaceId.value === 'all' ? 'personal' : workspaceId.value)
  function editEntry(entry?: ScopedCredential) {
    editingVaultId.value = entry?.vaultId ?? defaultTarget()
    const next = entry ?? { ...blankEntry(), categoryId: category(active.value)?.id ?? '' }
    // Copy credential fields only; source labels never enter the encrypted payload.
    for (const name of Object.keys(blankEntry()) as (keyof Credential)[]) (form as any)[name] = JSON.parse(JSON.stringify(next[name] ?? blankEntry()[name]))
    showPassword.value = false; formError.value = ''; entryOpen.value = true
  }
  function editCategory(value?: ScopedCategory) {
    categoryVaultId.value = value?.vaultId ?? defaultTarget()
    Object.assign(categoryForm, { id: value?.id ?? '', name: value?.name ?? '', icon: value?.icon ?? 'i-lucide-folder', color: value?.color ?? '#6366f1' })
    formError.value = ''; categoryOpen.value = true
  }
  function select(id: string) { active.value = id; mobileOpen.value = false }
  const allEntries = computed(() => sourceEntries(sources.value))
  const relationTargets = computed(() => [{ label: 'Выберите карточку', value: '__none' }, ...allEntries.value.filter(e => !(e.id === form.id && e.vaultId === editingVaultId.value)).map(e => ({ label: `${e.title} · ${e.vaultName}`, value: cardKey(e.vaultId, e.id) }))])
  const fieldTypes = [{ label: 'Текст', value: 'text' }, { label: 'Секрет', value: 'secret' }, { label: 'Ссылка', value: 'url' }, { label: 'Подписка', value: 'subscription' }]
  const baseFieldOptions = [{ label: 'Вся карточка', value: 'card' }, { label: 'Название', value: 'title' }, { label: 'Сайт', value: 'url' }, { label: 'Логин', value: 'username' }, { label: 'Пароль', value: 'password' }, { label: 'Заметка', value: 'notes' }]
  const sourceFieldOptions = computed(() => [...baseFieldOptions, ...(form.customFields ?? []).map(f => ({ label: f.label || 'Без названия', value: f.id }))])
  function addCustomField() { (form.customFields ??= []).push({ id: createId(), label: '', value: '', type: 'text' }) }
  function changeFieldType(field: CustomField, type: string) {
    if (!['text','secret','url','subscription'].includes(type)) return
    field.type = type as CustomField['type']
    if (type === 'subscription') {
      const today = todayDate()
      field.subscription ??= {price:0,currency:'RUB',periodCount:1,periodUnit:'month',startsOn:today,paidFrom:today,paidUntil:addPeriod(today,1,'month'),autoRenew:true}
      field.label ||= 'Подписка'; field.value = ''
      subscriptionSettings.editSubscription(field)
    } else delete field.subscription
  }
  async function renewSubscription(entry: ScopedCredential, fieldId: string) {
    if (busy.value) return
    const next = copyData(entry.vaultId), value = next?.entries.find(e => e.id === entry.id)
    const sub = value?.customFields?.find(f => f.id === fieldId)?.subscription
    if (!next || !value || !sub) return
    const until = nextPaidUntil(sub)
    if (!until) { toast.add({title:'Не удалось рассчитать срок подписки',color:'error'}); return }
    sub.paidFrom = sub.paidUntil; sub.paidUntil = until; value.updatedAt = new Date().toISOString()
    if (await saveData(entry.vaultId,next)) { toast.add({title:'Оплата отмечена, срок продлён',color:'success'}); await useNotificationsStore().refresh() }
  }
  function openNotification(notification: AppNotification) {
    const entry = allEntries.value.find(e => e.id === notification.entryId && e.vaultId === notification.vaultId)
    if (entry) editEntry(entry)
    else toast.add({title:'Карточка больше недоступна',color:'neutral'})
  }
  function removeCustomField(id: string) { form.customFields = form.customFields?.filter(f => f.id !== id); for (const link of form.links ?? []) if (link.sourceFieldId === id) link.sourceFieldId = 'card' }
  function addLink() { (form.links ??= []).push({ id: createId(), targetVaultId: '', targetEntryId: '', sourceFieldId: 'card', targetFieldId: 'card', label: '' }) }
  function removeLink(id: string) { form.links = form.links?.filter(l => l.id !== id) }
  function linkTarget(link: CredentialLink) { return link.targetEntryId ? cardKey(link.targetVaultId, link.targetEntryId) : '__none' }
  function setLinkTarget(link: CredentialLink, key: string) { const target = allEntries.value.find(e => cardKey(e.vaultId, e.id) === key); link.targetVaultId = target?.vaultId || ''; link.targetEntryId = target?.id || ''; link.targetFieldId = 'card' }
  function targetFieldOptions(link: CredentialLink) { const target = allEntries.value.find(e => e.id === link.targetEntryId && e.vaultId === link.targetVaultId); return [...baseFieldOptions, ...(target?.customFields ?? []).map(f => ({ label: f.label, value: f.id }))] }
  const incomingLinks = computed(() => allEntries.value.flatMap(e => (e.links ?? []).filter(l => l.targetEntryId === form.id && l.targetVaultId === editingVaultId.value).map(l => ({ key: `${e.vaultId}/${l.id}`, title: e.title, vaultName: e.vaultName, label: l.label }))))
  async function saveEntry() {
    formError.value = ''
    if (!form.title.trim() || !form.password) { formError.value = 'Укажите название и пароль'; return }
    if (form.url && !safeUrl(form.url)) { formError.value = 'Укажите корректный HTTP или HTTPS адрес'; return }
    if ((form.customFields ?? []).some(f => !f.label.trim())) { formError.value = 'Укажите названия дополнительных полей'; return }
    if ((form.customFields ?? []).some(f => f.type === 'subscription' && (!f.subscription || !validDate(f.subscription.startsOn) || !validDate(f.subscription.paidUntil) || f.subscription.paidUntil < f.subscription.startsOn || !Number.isFinite(f.subscription.price) || f.subscription.price < 0 || !Number.isInteger(f.subscription.periodCount) || f.subscription.periodCount < 1))) { formError.value = 'Проверьте цену, период и даты подписки'; return }
    if ((form.links ?? []).some(l => !l.targetEntryId || !l.targetVaultId || l.targetEntryId === form.id && l.targetVaultId === editingVaultId.value)) { formError.value = 'Выберите другую карточку для каждой связи'; return }
    const next = copyData(editingVaultId.value), now = new Date().toISOString()
    if (!next) return
    const entry: Credential = { ...JSON.parse(JSON.stringify(form)), title: form.title.trim(), url: form.url ? safeUrl(form.url)! : '', id: form.id || createId(), createdAt: form.createdAt || now, updatedAt: now }
    const index = next.entries.findIndex(e => e.id === entry.id)
    if (index >= 0) next.entries[index] = entry; else next.entries.push(entry)
    if (await saveData(editingVaultId.value, next)) { entryOpen.value = false; Object.assign(form, blankEntry()); toast.add({ title: 'Карточка сохранена', icon: 'i-lucide-check', color: 'success' }) }
  }
  async function saveCategory() {
    formError.value = ''
    if (!categoryForm.name.trim()) return
    const next = copyData(categoryVaultId.value)
    if (!next) return
    if (next.categories.some(c => c.id !== categoryForm.id && c.name.toLowerCase() === categoryForm.name.trim().toLowerCase())) { formError.value = 'Категория с таким названием уже существует'; return }
    const value = { ...categoryForm, id: categoryForm.id || createId(), name: categoryForm.name.trim() }
    const index = next.categories.findIndex(c => c.id === value.id)
    if (index >= 0) next.categories[index] = value; else next.categories.push(value)
    if (await saveData(categoryVaultId.value, next)) { categoryOpen.value = false; toast.add({ title: 'Категория сохранена', color: 'success' }) }
  }
  async function favorite(entry: ScopedCredential) {
    const next = copyData(entry.vaultId), value = next?.entries.find(e => e.id === entry.id)
    if (!next || !value) return
    value.favorite = !value.favorite; await saveData(entry.vaultId, next)
  }
  function askDelete(value: ScopedCredential | ScopedCategory, isCategory = false) { deleting.value = value; deletingCategory.value = isCategory; deleteOpen.value = true }
  async function remove() {
    const target = deleting.value
    if (!target) return
    const next = copyData(target.vaultId)
    if (!next) return
    if (deletingCategory.value) { next.categories = next.categories.filter(c => c.id !== target.id); next.entries.forEach(e => { if (e.categoryId === target.id) e.categoryId = '' }) }
    else next.entries = next.entries.filter(e => e.id !== target.id)
    if (await saveData(target.vaultId, next)) { if (active.value === categoryFilterId(target.vaultId, target.id)) active.value = 'all'; deleteOpen.value = false; deleting.value = null }
  }
  async function copy(value: string) {
    try { await copyText(value); toast.add({ title: 'Скопировано в буфер обмена', description: 'История буфера обмена управляется вашей системой.', icon: 'i-lucide-copy', color: 'success' }) }
    catch { toast.add({ title: 'Браузер не разрешил копирование', color: 'error' }) }
  }
  function host(url: string) { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'Приложение или сервис' } }
  watch(workspaceId, () => { if (!['relationships', 'subscriptions'].includes(active.value)) active.value = 'all'; query.value = ''; mobileOpen.value = false })
  function resetEntryCategory() { if (!form.id) form.categoryId = '' }
  watch(() => shared.groups.map(g => g.id), () => {
    if (!['all', 'favorites', 'relationships', 'subscriptions'].includes(active.value) && !category(active.value)) active.value = 'all'
    if (deleting.value && deleting.value.vaultId !== 'personal' && !source(deleting.value.vaultId)) { deleting.value = null; deleteOpen.value = false }
    if (!['all', 'personal'].includes(workspaceId.value) && !shared.groups.some(g => g.id === workspaceId.value)) workspaceId.value = 'all'
    if (entryOpen.value && editingVaultId.value !== 'personal' && !source(editingVaultId.value)) { entryOpen.value = false; Object.assign(form, blankEntry()) }
    if (categoryOpen.value && categoryVaultId.value !== 'personal' && !source(categoryVaultId.value)) categoryOpen.value = false
  })
  watch(() => vault.unlocked, value => { if (!value) { entryOpen.value = false; categoryOpen.value = false; deleteOpen.value = false; Object.assign(form, blankEntry()); query.value = ''; deleting.value = null; workspaceId.value = 'all'; Object.assign(categoryForm, { id: '', name: '', icon: 'i-lucide-folder', color: '#6366f1' }) } })
  onBeforeUnmount(() => Object.assign(form, blankEntry()))
  return { ...subscriptionSettings, calendarMode, subscriptionCount, changeFieldType, renewSubscription, openNotification, graphMode, allEntries, relationTargets, fieldTypes, sourceFieldOptions, incomingLinks, addCustomField, removeCustomField, addLink, removeLink, linkTarget, setLinkTarget, targetFieldOptions, vault, auth, shared, workspaceId, workspaceName, entries, categories, busy, error, editingVaultId, categoryVaultId, vaultOptions, entryCategory, categoryCount, resetEntryCategory, active, query, sort, mobileOpen, entryOpen, categoryOpen, deleteOpen, showPassword, deleting, deletingCategory, formError, form, categoryForm, colors, icons, categoryOptions, selectedCategory, favorites, category, title, filtered, categoryMode, editEntry, editCategory, select, saveEntry, saveCategory, favorite, askDelete, remove, copy, host, generatePassword, safeUrl, productName }
}
