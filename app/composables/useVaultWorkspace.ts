import { storeToRefs } from 'pinia'
import {projectSharedCards,storedVaultData} from '~~/shared/utils/shared-card-sources'
import {credentialAccounts,entryCategoryIds} from '~~/shared/utils/credentials'
import { paymentForRenewal } from '~~/shared/utils/subscription-finances'
import { addPeriod, todayDate, validDate, nextPaidUntil, subscriptionRows } from '~~/shared/utils/subscriptions'
import type { AppNotification } from '~~/shared/types/subscriptions'
import type { CustomField } from '~~/shared/types/vault'
import { cardKey } from '~~/shared/utils/relationships'
import type { CredentialLink } from '~~/shared/types/vault'
import type { Credential, Category, VaultData } from '~~/shared/types/vault'
import type { VaultSource } from '~~/shared/types/sharing'
import { createId, copyText } from '~/utils/browser'
import { generatePassword, safeUrl } from '~~/shared/utils/crypto'
import { sourceEntries, sourceCategories, categoryInFolder, categoryFilterId, type ScopedCredential, type ScopedCategory } from '~~/shared/utils/vault-sources'

export function useVaultWorkspace(props: { embedded?: boolean; mode?: string }) {
  const { productName } = useAccountBrand()
  const vault = useVaultStore(), auth = useAuthStore(), shared = useSharedVaultsStore(), toast = useToast()
  const filters = useFiltersStore()
  const { workspaceId } = storeToRefs(filters)
  const { query, sort } = toRefs(filters.workspace)
  const sources = computed<VaultSource[]>(() => projectSharedCards([{ id: 'personal', name: vault.data.name || 'Личное', data: vault.data }, ...shared.groups.map(g => ({ id: g.id, name: g.name, data: g.data }))],shared.cards))
  const visibleSources = computed(() => workspaceId.value === 'all' ? sources.value : sources.value.filter(s => s.id === workspaceId.value))
  const workspaceName = computed(() => workspaceId.value === 'all' ? 'Все хранилища' : sources.value.find(s => s.id === workspaceId.value)?.name ?? 'Хранилище')
  const entries = computed(() => sourceEntries(visibleSources.value)), categories = computed(() => sourceCategories(visibleSources.value))
  const busy = computed(() => vault.busy || shared.busy || shared.loading), error = computed(() => vault.error || shared.error)
  const route = useRoute()
  const active = computed({ get: () => !props.embedded && ['upcoming','finances','categories'].includes(props.mode??'') ? props.mode!  : filters.workspace.active, set: value => { filters.workspace.active = value } })
  watch(() => [route.path, route.query.view], () => {
    if (!props.embedded && route.path === '/password') filters.workspace.active = typeof route.query.view === 'string' ? route.query.view : 'all'
  }, { immediate: true })
  watch(() => props.mode, mode => {
    if (props.embedded) filters.workspace.active = mode === 'categories' ? 'categories' : 'all'
  }, { immediate: true })
  const mobileOpen = ref(false)
  const historyOpen = ref(false), historyKey = ref('')
  function openPaymentHistory(entry: ScopedCredential, fieldId: string) { historyKey.value = `${entry.sharedCardId ? 'shared:' + entry.sharedCardId : entry.vaultId + '/' + entry.id}/${fieldId}`; historyOpen.value = true }
  const historyMode = computed(() => active.value === 'history')
  const entryOpen = ref(false), categoryOpen = ref(false), deleteOpen = ref(false), showPassword = ref(false)
  const editingVaultId = ref('personal'), categoryVaultId = ref('personal')
  const deleting = ref<ScopedCredential | ScopedCategory | null>(null), deletingCategory = ref(false), formError = ref('')
  const blankEntry = (): Credential => ({ accounts:[],categoryIds:[],images:[], id: '', title: '', url: '', username: '', password: '', notes: '', categoryId: '', customFields: [], links: [], favorite: false, createdAt: '', updatedAt: '' })
  const form = reactive<Credential>(blankEntry())
  const media=useMediaUploads()
  const targetVaultIds=ref<string[]>(['personal']),editingCardId=ref(''),editingCardRevision=ref(0),editingSourceRevision=ref(0),originVaultId=ref('personal'),viewOpen=ref(false),viewKey=ref(''),sharingEditable=computed(()=>editingCardId.value?!!shared.cards.find(card=>card.id===editingCardId.value)?.canManageSharing:!form.id||canManageCategoryVault(originVaultId.value))
  let entrySession=0
  const subscriptionSettings = useSubscriptionSettings(() => form.customFields ?? [])
  watch(entryOpen, open => { if (!open) {subscriptionSettings.subscriptionOpen.value = false;entrySession++} })
  const canManageCategoryVault=(id:string)=>id==='personal'||shared.groups.some(group=>group.id===id&&group.canManageStructure!==false)
  const structureVaultOptions=computed(()=>vaultOptions.value.filter(option=>canManageCategoryVault(option.value)))
  const categoriesEditable=computed(()=>{if(editingCardId.value)return shared.cards.find(card=>card.id===editingCardId.value)?.canManageCategories!==false;return !form.id||canManageCategoryVault(originVaultId.value)})
  const categoryForm = reactive<Category>({ id: '', name: '', icon: 'i-lucide-folder', color: '#6366f1',svg:undefined })
  const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6']
  const icons = ['i-lucide-folder', 'i-lucide-briefcase-business', 'i-lucide-user-round', 'i-lucide-landmark', 'i-lucide-app-window', 'i-lucide-globe', 'i-lucide-gamepad-2', 'i-lucide-shopping-bag']
  const source = (id: string) => sources.value.find(s => s.id === id)
  const canEditEntry=(entry:ScopedCredential)=>entry.sharedCardId?shared.cards.find(card=>card.id===entry.sharedCardId)?.canEdit!==false:entry.vaultId==='personal'||shared.groups.find(group=>group.id===entry.vaultId)?.canEdit!==false
  const vaultOptions = computed(() => sources.value.filter(source=>source.id==='personal'||shared.groups.find(group=>group.id===source.id)?.canEdit!==false).map(s => ({ label: s.name, value: s.id })))
  const categoryOptions = computed(() => sources.value.filter(source=>targetVaultIds.value.includes(source.id)).flatMap(source=>source.data.categories.map(category=>({label:`${category.name} · ${source.name}`,value:category.id}))))
  const selectedCategory = computed({get:()=>entryCategoryIds(form).filter(id=>categoryOptions.value.some(option=>option.value===id)),set:(values:string[])=>{const hidden=entryCategoryIds(form).filter(id=>!categoryOptions.value.some(option=>option.value===id));form.categoryIds=[...new Set([...hidden,...values])];form.categoryId=form.categoryIds[0]??''}})
  const favorites = computed(() => entries.value.filter(e => e.favorite).length)
  const category = (filterId: string) => categories.value.find(c => c.filterId === filterId)
  const entryCategories = (entry:ScopedCredential)=>sourceCategories(sources.value.filter(source=>(entry.vaultIds??[entry.vaultId]).includes(source.id))).filter(category=>entryCategoryIds(entry).includes(category.id))
  const entryCategory = (entry: ScopedCredential) => entryCategories(entry)[0]
  const categoryCount = (c: ScopedCategory) => allEntries.value.filter(e => (e.vaultIds??[e.vaultId]).includes(c.vaultId) && entryCategoryIds(e).includes(c.id)).length
  const upcomingMode = computed(() => active.value === 'upcoming'), financesMode = computed(() => active.value === 'finances')
  const calendarMode = computed(() => active.value === 'subscriptions')
  const subscriptionCount = computed(() => subscriptionRows(entries.value).length)
  const graphMode = computed(() => active.value === 'relationships')
  const title = computed(() => active.value==='categories' ? 'Категории' : historyMode.value ? 'История списаний' : upcomingMode.value ? 'Ближайшие подписки' : financesMode.value ? 'Финансы' : calendarMode.value ? 'Календарь подписок' : graphMode.value ? 'Взаимосвязь' : active.value === 'all' ? 'Все карточки' : active.value === 'favorites' ? 'Избранное' : category(active.value)?.name ?? 'Все карточки')
  const filtered = computed(() => entries.value.filter(e => (active.value === 'all' || (active.value === 'favorites' ? e.favorite : (e.vaultIds??[e.vaultId]).some(vaultId=>entryCategoryIds(e).some(id=>categoryFilterId(vaultId,id)===active.value)))) && [e.title, ...credentialAccounts(e).flatMap(account=>[account.label,account.username]), e.url, e.notes, ...(e.vaultNames??[e.vaultName]), ...(e.customFields ?? []).filter(f => f.type !== 'secret').map(f => `${f.label} ${f.value}`)].some(v => v.toLowerCase().includes(query.value.toLowerCase()))).sort((a, b) => sort.value === 'title' ? a.title.localeCompare(b.title, 'ru') : b.updatedAt.localeCompare(a.updatedAt)))
  const categoryMode = computed(() => active.value === 'categories')
  function copyData(id: string): VaultData | null {
    const value = source(id)?.data
    if (!value) { formError.value = 'Хранилище недоступно. Обновите список.'; return null }
    return JSON.parse(JSON.stringify(value))
  }
  const saveData = (id: string, next: VaultData) => id === 'personal' ? vault.save(storedVaultData(next)) : shared.save(id, storedVaultData(next))
  const folderOptions=computed(()=>[{label:'Без папки',value:'__none'},...(source(categoryVaultId.value)?.data.categoryFolders??[]).map(folder=>({label:folder.name,value:folder.id}))])
  const selectedFolder=computed({get:()=>categoryForm.folderId??'__none',set:(value:string)=>{categoryForm.folderId=value==='__none'?undefined:value}})
  watch(categoryVaultId,()=>{if(categoryForm.folderId&&!folderOptions.value.some(option=>option.value===categoryForm.folderId))delete categoryForm.folderId})
  const defaultTarget = () => category(active.value)?.vaultId ?? (workspaceId.value === 'all' ? 'personal' : workspaceId.value)
  const folderSettings=useCategoryFolders(()=>sources.value,()=>visibleSources.value,saveData,canManageCategoryVault,defaultTarget)
  function editEntry(entry?: ScopedCredential) {
    if(entry&&!canEditEntry(entry)){toast.add({title:'Доступ только для просмотра',color:'neutral'});return}
    entrySession++;media.mediaError.value='';viewOpen.value=false
    originVaultId.value=entry?.vaultId??defaultTarget();editingCardId.value=entry?.sharedCardId??''
    const linked=entry?.sharedCardId?shared.cards.find(card=>card.id===entry.sharedCardId):undefined
    editingCardRevision.value=linked?.revision??0
    editingSourceRevision.value=originVaultId.value==='personal'?vault.getRevision():shared.groups.find(group=>group.id===originVaultId.value)?.revision??0
    targetVaultIds.value=linked?(linked.vaultIds.length?[...linked.vaultIds]:['personal']):[entry?.vaultId??defaultTarget()]
    editingVaultId.value = entry?.vaultId ?? defaultTarget()
    const next = entry ?? { ...blankEntry(), categoryId: category(active.value)?.id ?? '' }
    // Copy credential fields only; source labels never enter the encrypted payload.
    for (const name of Object.keys(blankEntry()) as (keyof Credential)[]) (form as any)[name] = JSON.parse(JSON.stringify(next[name] ?? blankEntry()[name]))
    form.accounts=entry?JSON.parse(JSON.stringify(credentialAccounts(entry))):[];form.categoryIds=entryCategoryIds(next);form.categoryId=form.categoryIds[0]??''
    showPassword.value = false; formError.value = ''; entryOpen.value = true
  }
  function editCategory(value?: ScopedCategory) {
    categoryVaultId.value = value?.vaultId ?? (canManageCategoryVault(defaultTarget())?defaultTarget():'personal')
    if(!canManageCategoryVault(categoryVaultId.value))return
    Object.assign(categoryForm, { id: value?.id ?? '', name: value?.name ?? '', icon: value?.icon ?? 'i-lucide-folder', color: value?.color ?? '#6366f1',svg:value?.svg,folderId:value?.folderId })
    formError.value = ''; categoryOpen.value = true
  }
  const navigationCategories=computed(()=>{
    const visible=new Set(categories.value.map(category=>category.filterId))
    return sourceCategories(sources.value).filter(category=>visible.has(category.filterId)||folderSettings.folders.value.some(folder=>categoryInFolder(category,folder)))
  })
  async function selectCategory(id:string){
    const category=sourceCategories(sources.value).find(category=>category.filterId===id)
    if(!category)return
    if(workspaceId.value!=='all'&&workspaceId.value!==category.vaultId){workspaceId.value='all';await nextTick()}
    select(id)
  }
  function select(id: string) {
    mobileOpen.value = false
    if (id==='team'||id==='profile') { navigateTo(id==='team'?'/team':'/profile'); return }
    if (props.embedded) { active.value = id; return }
    const path = ({ categories: '/password/categories', upcoming: '/password/subscriptions', finances: '/password/finances' } as Record<string, string>)[id]
    if (path) { navigateTo(path); return }
    filters.workspace.active = id
    navigateTo({ path: '/password', query: id === 'all' ? {} : { view: id } })
  }
  const allEntries = computed(() => sourceEntries(sources.value))
  const viewingEntry=computed(()=>allEntries.value.find(entry=>(entry.sharedCardId||`${entry.vaultId}/${entry.id}`)===viewKey.value)??null)
  const viewingCategories=computed(()=>viewingEntry.value?entryCategories(viewingEntry.value):[])
  const viewingLinks=computed(()=>(viewingEntry.value?.links??[]).map(link=>{const target=allEntries.value.find(entry=>entry.id===link.targetEntryId&&(entry.vaultIds??[entry.vaultId]).includes(link.targetVaultId));return {id:link.id,label:link.label||'Ручная связь',target:target?.title||'Недоступная карточка'}}))
  function viewEntry(entry:ScopedCredential){viewKey.value=entry.sharedCardId||`${entry.vaultId}/${entry.id}`;viewOpen.value=true}
  watch(viewingEntry,entry=>{if(!entry)viewOpen.value=false})
  let openedRouteEntry = ''
  watch(() => [route.query.entry, route.query.vault, allEntries.value] as const, ([entryId, vaultId]) => {
    if (props.embedded || typeof entryId !== 'string' || typeof vaultId !== 'string') return
    const key = `${vaultId}/${entryId}`
    if (openedRouteEntry === key) return
    const entry = allEntries.value.find(item => item.id === entryId && (item.vaultIds ?? [item.vaultId]).includes(vaultId))
    if (entry) { openedRouteEntry = key; viewEntry(entry) }
  }, { immediate: true })

  function setTargetVaults(values:string[]){const added=values.find(id=>!targetVaultIds.value.includes(id));targetVaultIds.value=added==='personal'?['personal']:added&&!canManageCategoryVault(added)?[added]:values.filter(id=>id!=='personal'&&(!added||canManageCategoryVault(id)));if(!targetVaultIds.value.length)targetVaultIds.value=['personal'];editingVaultId.value=targetVaultIds.value[0]!}
  function addAccount(){(form.accounts??=[]).push({id:createId(),label:`Доступ ${(form.accounts?.length??0)+1}`,username:'',password:''})}
  function removeAccount(id:string){form.accounts=form.accounts?.filter(account=>account.id!==id)}
  async function uploadImages(event:Event){const session=entrySession,images=await media.readImages(event,5-(form.images?.length??0));if(session===entrySession&&entryOpen.value)(form.images??=[]).push(...images)}
  async function uploadCategorySvg(event:Event){const categoryId=categoryForm.id,value=await media.readSvg(event);if(value&&categoryOpen.value&&categoryId===categoryForm.id)categoryForm.svg=value}
  const relationTargets = computed(() => [{ label: 'Выберите карточку', value: '__none' }, ...allEntries.value.filter(e => !(e.id === form.id && (e.vaultId === editingVaultId.value || !!editingCardId.value && e.sharedCardId === editingCardId.value))).map(e => ({ label: `${e.title} · ${e.vaultName}`, value: cardKey(e.vaultId, e.id) }))])
  const subscriptionCards = computed(() => allEntries.value.filter(entry => editingCardId.value ? entry.sharedCardId !== editingCardId.value : !(entry.id === form.id && (entry.vaultIds ?? [entry.vaultId]).includes(originVaultId.value))))
  const fieldTypes = [{ label: 'Текст', value: 'text' }, { label: 'Секрет', value: 'secret' }, { label: 'Ссылка', value: 'url' }, { label: 'Подписка', value: 'subscription' }]
  const baseFieldOptions = [{ label: 'Вся карточка', value: 'card' }, { label: 'Название', value: 'title' }, { label: 'Сайт', value: 'url' }, { label: 'Логин', value: 'username' }, { label: 'Пароль', value: 'password' }, { label: 'Заметка', value: 'notes' }]
  const sourceFieldOptions = computed(() => [...baseFieldOptions, ...(form.accounts??[]).map(account=>({label:account.label,value:account.id})), ...(form.customFields ?? []).map(f => ({ label: f.label || 'Без названия', value: f.id }))])
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
    if(!canEditEntry(entry)){toast.add({title:'Доступ только для просмотра',color:'neutral'});return}
    if (busy.value) return
    if(entry.sharedCardId){if(await shared.renewCard(entry.sharedCardId,fieldId))await useNotificationsStore().refresh();return}
    const next = copyData(entry.vaultId), value = next?.entries.find(e => e.id === entry.id)
    const sub = value?.customFields?.find(f => f.id === fieldId)?.subscription
    if (!next || !value || !sub) return
    const until = nextPaidUntil(sub)
    if (!until) { toast.add({title:'Не удалось рассчитать срок подписки',color:'error'}); return }
    const row = subscriptionRows([{...value,vaultId:entry.vaultId,vaultName:entry.vaultName}]).find(row=>row.field.id===fieldId)!
    ;(next.subscriptionPayments ??= []).push(paymentForRenewal(row,until,createId()))
    sub.paidFrom = sub.paidUntil; sub.paidUntil = until; value.updatedAt = new Date().toISOString()
    if (await saveData(entry.vaultId,next)) { toast.add({title:'Оплата отмечена, срок продлён',color:'success'}); await useNotificationsStore().refresh() }
  }
  function openNotification(notification: AppNotification) {
    const entry = allEntries.value.find(e => e.id === notification.entryId && e.vaultId === notification.vaultId)
    if (entry) viewEntry(entry)
    else toast.add({title:'Карточка больше недоступна',color:'neutral'})
  }
  function removeCustomField(id: string) { form.customFields = form.customFields?.filter(f => f.id !== id); for (const link of form.links ?? []) if (link.sourceFieldId === id) link.sourceFieldId = 'card' }
  function addLink() { (form.links ??= []).push({ id: createId(), targetVaultId: '', targetEntryId: '', sourceFieldId: 'card', targetFieldId: 'card', label: '' }) }
  function removeLink(id: string) { form.links = form.links?.filter(l => l.id !== id) }
  function linkTarget(link: CredentialLink) { return link.targetEntryId ? cardKey(link.targetVaultId, link.targetEntryId) : '__none' }
  function setLinkTarget(link: CredentialLink, key: string) { const target = allEntries.value.find(e => cardKey(e.vaultId, e.id) === key); link.targetVaultId = target?.vaultId || ''; link.targetEntryId = target?.id || ''; link.targetFieldId = 'card' }
  function targetFieldOptions(link: CredentialLink) { const target = allEntries.value.find(e => e.id === link.targetEntryId && e.vaultId === link.targetVaultId); return [...baseFieldOptions,...(target?credentialAccounts(target):[]).map(account=>({label:account.label,value:account.id})), ...(target?.customFields ?? []).map(f => ({ label: f.label, value: f.id }))] }
  const incomingLinks = computed(() => allEntries.value.flatMap(e => (e.links ?? []).filter(l => l.targetEntryId === form.id && l.targetVaultId === editingVaultId.value).map(l => ({ key: `${e.vaultId}/${l.id}`, title: e.title, vaultName: e.vaultName, label: l.label }))))
  async function saveEntry() {
    formError.value = ''
    if (!form.title.trim()) { formError.value = 'Укажите название карточки'; return }
    if(media.mediaBusy.value){formError.value='Дождитесь загрузки изображений';return}
    if(form.accounts?.some(account=>!account.label.trim())){formError.value='Укажите название каждого блока доступа';return}
    if (form.url && !safeUrl(form.url)) { formError.value = 'Укажите корректный HTTP или HTTPS адрес'; return }
    if ((form.customFields ?? []).some(f => !f.label.trim())) { formError.value = 'Укажите названия дополнительных полей'; return }
    if ((form.customFields ?? []).some(f => f.type === 'subscription' && (!f.subscription || !validDate(f.subscription.startsOn) || !validDate(f.subscription.paidUntil) || f.subscription.paidUntil < f.subscription.startsOn || !Number.isFinite(f.subscription.price) || f.subscription.price < 0 || !Number.isInteger(f.subscription.periodCount) || f.subscription.periodCount < 1))) { formError.value = 'Проверьте цену, период и даты подписки'; return }
    if ((form.links ?? []).some(l => !l.targetEntryId || !l.targetVaultId || l.targetEntryId === form.id && l.targetVaultId === editingVaultId.value)) { formError.value = 'Выберите другую карточку для каждой связи'; return }
    const next = copyData(editingVaultId.value), now = new Date().toISOString()
    if (!next) return
    form.username=form.accounts?.[0]?.username??'';form.password=form.accounts?.[0]?.password??''
    const entry: Credential = { ...JSON.parse(JSON.stringify(form)), title: form.title.trim(), url: form.url ? safeUrl(form.url)! : '', id: form.id || createId(), createdAt: form.createdAt || now, updatedAt: now }
    const targets=targetVaultIds.value.filter(id=>id!=='personal')
    const existing=!!form.id&&!editingCardId.value
    const origin=existing?{vaultId:originVaultId.value,revision:editingSourceRevision.value}:undefined
    if(await shared.saveCard(entry,sharingEditable.value||!editingCardId.value?targets:undefined,editingCardId.value||undefined,origin,editingCardRevision.value||undefined)){
      if(origin?.vaultId==='personal')await vault.check()
      entryOpen.value=false;Object.assign(form,blankEntry());toast.add({title:'Карточка сохранена',icon:'i-lucide-check',color:'success'})
    }
  }

  async function saveCategory() {
    formError.value = ''
    if (!canManageCategoryVault(categoryVaultId.value)){formError.value='Нет прав на изменение категорий';return}
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
    if(!canEditEntry(entry)){toast.add({title:'Доступ только для просмотра',color:'neutral'});return}
    if(entry.sharedCardId){const card=shared.cards.find(card=>card.id===entry.sharedCardId);if(card)await shared.saveCard({...card.entry,favorite:!entry.favorite},undefined,card.id);return}
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
    if (!deletingCategory.value && 'sharedCardId' in target && target.sharedCardId){if(await shared.deleteCard(target.sharedCardId)){deleteOpen.value=false;viewOpen.value=false;deleting.value=null}return}
    if (deletingCategory.value) { next.categories = next.categories.filter(c => c.id !== target.id); next.entries.forEach(e => { e.categoryIds=entryCategoryIds(e).filter(id=>id!==target.id);e.categoryId=e.categoryIds[0]??'' }) }
    else next.entries = next.entries.filter(e => e.id !== target.id)
    if (await saveData(target.vaultId, next)) { if (active.value === categoryFilterId(target.vaultId, target.id)) active.value = 'all'; deleteOpen.value = false; deleting.value = null }
  }
  async function copy(value: string, trigger?: HTMLElement) {
    try { await copyText(value, trigger); toast.add({ title: 'Скопировано в буфер обмена', description: 'История буфера обмена управляется вашей системой.', icon: 'i-lucide-copy', color: 'success' }) }
    catch { toast.add({ title: 'Браузер не разрешил копирование', color: 'error' }) }
  }
  function host(url: string) { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'Приложение или сервис' } }
  watch(workspaceId, () => { if (!['relationships', 'subscriptions', 'upcoming', 'finances', 'history','categories'].includes(active.value)) active.value = 'all'; query.value = ''; mobileOpen.value = false })
  function resetEntryCategory() { if (!form.id) {form.categoryId='';form.categoryIds=[]} }
  watch(() => shared.groups.map(g => g.id), () => {
    if (!['all', 'favorites', 'relationships', 'subscriptions', 'upcoming', 'finances', 'history','categories'].includes(active.value) && !category(active.value)) active.value = 'all'
    if (deleting.value && deleting.value.vaultId !== 'personal' && !source(deleting.value.vaultId)) { deleting.value = null; deleteOpen.value = false }
    if (!['all', 'personal'].includes(workspaceId.value) && !shared.groups.some(g => g.id === workspaceId.value)) workspaceId.value = 'all'
    if (entryOpen.value && editingVaultId.value !== 'personal' && !source(editingVaultId.value)) { entryOpen.value = false; Object.assign(form, blankEntry()) }
    if (categoryOpen.value && categoryVaultId.value !== 'personal' && !source(categoryVaultId.value)) categoryOpen.value = false
  })
  watch(()=>shared.cards,()=>{if(editingCardId.value&&entryOpen.value&&!shared.cards.some(card=>card.id===editingCardId.value&&!card.archived)){entryOpen.value=false;Object.assign(form,blankEntry())}})
  watch(() => vault.unlocked, value => { if (!value) { historyOpen.value=false;historyKey.value='';viewOpen.value=false;viewKey.value='';entryOpen.value = false; categoryOpen.value = false; deleteOpen.value = false; Object.assign(form, blankEntry()); query.value = ''; deleting.value = null; workspaceId.value = 'all'; Object.assign(categoryForm, { id: '', name: '', icon: 'i-lucide-folder', color: '#6366f1' }) } })
  onBeforeUnmount(() => Object.assign(form, blankEntry()))
  return { canEditEntry, navigationCategories, selectCategory, ...folderSettings, filters, canManageCategoryVault, structureVaultOptions, categoriesEditable, folderOptions, selectedFolder, historyOpen, historyKey, historyMode, openPaymentHistory, sources, subscriptionCards, ...media, targetVaultIds, sharingEditable, setTargetVaults, addAccount, removeAccount, uploadImages, uploadCategorySvg, viewOpen, viewingEntry, viewingCategories, viewingLinks, viewEntry, entryCategories, upcomingMode, financesMode, visibleSources, ...subscriptionSettings, calendarMode, subscriptionCount, changeFieldType, renewSubscription, openNotification, graphMode, allEntries, relationTargets, fieldTypes, sourceFieldOptions, incomingLinks, addCustomField, removeCustomField, addLink, removeLink, linkTarget, setLinkTarget, targetFieldOptions, vault, auth, shared, workspaceId, workspaceName, entries, categories, busy, error, editingVaultId, categoryVaultId, vaultOptions, entryCategory, categoryCount, resetEntryCategory, active, query, sort, mobileOpen, entryOpen, categoryOpen, deleteOpen, showPassword, deleting, deletingCategory, formError, form, categoryForm, colors, icons, categoryOptions, selectedCategory, favorites, category, title, filtered, categoryMode, editEntry, editCategory, select, saveEntry, saveCategory, favorite, askDelete, remove, copy, host, generatePassword, safeUrl, productName }
}
