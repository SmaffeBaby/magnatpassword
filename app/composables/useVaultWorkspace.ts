import type { Credential, Category } from '~~/shared/types/vault'
import { generatePassword, safeUrl } from '~~/shared/utils/crypto'

export function useVaultWorkspace(props: { embedded?: boolean; mode?: string }) {
  const { productName } = useAccountBrand()
  const vault = useVaultStore(), auth = useAuthStore(), toast = useToast()
  const active = ref('all'), query = ref(''), sort = ref('updated'), mobileOpen = ref(false)
  const entryOpen = ref(false), categoryOpen = ref(false), deleteOpen = ref(false), showPassword = ref(false)
  const deleting = ref<Credential | Category | null>(null), deletingCategory = ref(false), formError = ref('')
  const blankEntry = (): Credential => ({ id: '', title: '', url: '', username: '', password: '', notes: '', categoryId: '', favorite: false, createdAt: '', updatedAt: '' })
  const form = reactive<Credential>(blankEntry())
  const categoryForm = reactive<Category>({ id: '', name: '', icon: 'i-lucide-folder', color: '#6366f1' })
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6']
  const icons = ['i-lucide-folder', 'i-lucide-briefcase-business', 'i-lucide-user-round', 'i-lucide-landmark', 'i-lucide-app-window', 'i-lucide-globe', 'i-lucide-gamepad-2', 'i-lucide-shopping-bag']
  const categoryOptions = computed(() => [{ label: 'Без категории', value: '__none' }, ...vault.data.categories.map(c => ({ label: c.name, value: c.id }))])
  const selectedCategory = computed({ get: () => form.categoryId || '__none', set: value => { form.categoryId = value === '__none' ? '' : value } })
  const favorites = computed(() => vault.data.entries.filter(e => e.favorite).length)
  const category = (id: string) => vault.data.categories.find(c => c.id === id)
  const title = computed(() => active.value === 'all' ? 'Все пароли' : active.value === 'favorites' ? 'Избранное' : category(active.value)?.name ?? 'Все пароли')
  const filtered = computed(() => vault.data.entries.filter(e => (active.value === 'all' || (active.value === 'favorites' ? e.favorite : e.categoryId === active.value)) && [e.title, e.username, e.url, e.notes].some(v => v.toLowerCase().includes(query.value.toLowerCase()))).sort((a, b) => sort.value === 'title' ? a.title.localeCompare(b.title, 'ru') : b.updatedAt.localeCompare(a.updatedAt)))
  const categoryMode = computed(() => props.mode === 'categories')
  const copyData = () => JSON.parse(JSON.stringify(vault.data))
  function editEntry(entry?: Credential) { Object.assign(form, entry ?? { ...blankEntry(), categoryId: category(active.value)?.id ?? '' }); showPassword.value = false; formError.value = ''; entryOpen.value = true }
  function editCategory(value?: Category) { Object.assign(categoryForm, value ?? { id: '', name: '', icon: 'i-lucide-folder', color: '#6366f1' }); formError.value = ''; categoryOpen.value = true }
  function select(id: string) { active.value = id; mobileOpen.value = false }
  async function saveEntry() {
    formError.value = ''
    if (!form.title.trim() || !form.password) { formError.value = 'Укажите название и пароль'; return }
    if (form.url && !safeUrl(form.url)) { formError.value = 'Укажите корректный HTTP или HTTPS адрес'; return }
    const next = copyData(), now = new Date().toISOString()
    const entry = { ...form, title: form.title.trim(), url: form.url ? safeUrl(form.url)! : '', id: form.id || crypto.randomUUID(), createdAt: form.createdAt || now, updatedAt: now }
    const index = next.entries.findIndex((e: Credential) => e.id === entry.id)
    if (index >= 0) next.entries[index] = entry; else next.entries.push(entry)
    if (await vault.save(next)) { entryOpen.value = false; Object.assign(form, blankEntry()); toast.add({ title: 'Карточка сохранена', icon: 'i-lucide-check', color: 'success' }) }
  }
  async function saveCategory() {
    if (!categoryForm.name.trim()) return
    if (vault.data.categories.some(c => c.id !== categoryForm.id && c.name.toLowerCase() === categoryForm.name.trim().toLowerCase())) { formError.value = 'Категория с таким названием уже существует'; return }
    const next = copyData(), value = { ...categoryForm, id: categoryForm.id || crypto.randomUUID(), name: categoryForm.name.trim() }
    const index = next.categories.findIndex((c: Category) => c.id === value.id)
    if (index >= 0) next.categories[index] = value; else next.categories.push(value)
    if (await vault.save(next)) { categoryOpen.value = false; toast.add({ title: 'Категория сохранена', color: 'success' }) }
  }
  async function favorite(entry: Credential) { const next = copyData(); const value = next.entries.find((e: Credential) => e.id === entry.id); value.favorite = !value.favorite; await vault.save(next) }
  function askDelete(value: Credential | Category, isCategory = false) { deleting.value = value; deletingCategory.value = isCategory; deleteOpen.value = true }
  async function remove() {
    if (!deleting.value) return
    const next = copyData()
    if (deletingCategory.value) { next.categories = next.categories.filter((c: Category) => c.id !== deleting.value!.id); next.entries.forEach((e: Credential) => { if (e.categoryId === deleting.value!.id) e.categoryId = '' }) }
    else next.entries = next.entries.filter((e: Credential) => e.id !== deleting.value!.id)
    if (await vault.save(next)) { if (active.value === deleting.value.id) active.value = 'all'; deleteOpen.value = false; deleting.value = null }
  }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); toast.add({ title: 'Скопировано в буфер обмена', description: 'История буфера обмена управляется вашей системой.', icon: 'i-lucide-copy', color: 'success' }) }
    catch { toast.add({ title: 'Браузер не разрешил копирование', color: 'error' }) }
  }
  function host(url: string) { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'Приложение или сервис' } }
  watch(() => vault.unlocked, value => { if (!value) { entryOpen.value = false; categoryOpen.value = false; deleteOpen.value = false; Object.assign(form, blankEntry()); query.value = ''; deleting.value = null; Object.assign(categoryForm, { id: '', name: '', icon: 'i-lucide-folder', color: '#6366f1' }) } })
  onBeforeUnmount(() => Object.assign(form, blankEntry()))
  return { vault, auth, active, query, sort, mobileOpen, entryOpen, categoryOpen, deleteOpen, showPassword, deleting, deletingCategory, formError, form, categoryForm, colors, icons, categoryOptions, selectedCategory, favorites, category, title, filtered, categoryMode, editEntry, editCategory, select, saveEntry, saveCategory, favorite, askDelete, remove, copy, host, generatePassword, safeUrl, productName }
}
