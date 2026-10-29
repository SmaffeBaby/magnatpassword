import type { Ref, ComputedRef } from 'vue'
import type { Credential, CustomField } from '~~/shared/types/vault'
import type { VaultSource } from '~~/shared/types/sharing'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
import { addPeriod, todayDate, validDate } from '~~/shared/utils/subscriptions'
import { createId } from '~/utils/browser'

export function useFinanceSubscriptions(context: {
  sources: ComputedRef<VaultSource[]>; allEntries: ComputedRef<ScopedCredential[]>; workspaceId: Ref<string>;
  canEditEntry: (entry: ScopedCredential) => boolean; canManageCategoryVault: (id: string) => boolean
}) {
  const shared = useSharedVaultsStore(), vault = useVaultStore(), toast = useToast()
  const editable = ref(true)
  const open = ref(false), draft = ref<Credential | null>(null), error = ref(''), recordId = ref(''), revision = ref(0)
  const targets = ref<string[]>(['personal']), canShare = ref(true), canCategorize = ref(true)
  const cards = computed(() => context.allEntries.value.filter(entry => entry.kind !== 'subscription'))
  const field = computed(() => draft.value?.financeSubscription)
  const vaultOptions = computed(() => context.sources.value.filter(source => source.id === 'personal' || shared.groups.some(group => group.id === source.id && group.canEdit)).map(source => ({ label: source.name, value: source.id })))
  const categoryOptions = computed(() => context.sources.value.filter(source => targets.value.includes(source.id)).flatMap(source => source.data.categories.map(category => ({ label: `${category.name} · ${source.name}`, value: category.id }))))
  const categories = computed({ get: () => draft.value?.categoryIds ?? [], set: (value: string[]) => { if (draft.value) { draft.value.categoryIds = value; draft.value.categoryId = value[0] ?? '' } } })
  function edit(entry?: ScopedCredential) {
    editable.value = !entry || context.canEditEntry(entry)
    const record = entry?.sharedCardId ? shared.cards.find(card => card.id === entry.sharedCardId) : undefined
    recordId.value = record?.id ?? ''; revision.value = record?.revision ?? 0
    canShare.value = !record || record.canManageSharing !== false
    canCategorize.value = !record || record.canManageCategories !== false
    targets.value = record ? (record.vaultIds.length ? [...record.vaultIds] : ['personal']) : [context.workspaceId.value === 'all' ? 'personal' : context.workspaceId.value]
    const today = todayDate(), now = new Date().toISOString(), id = createId()
    draft.value = record ? structuredClone(toRaw(record.entry)) : {
      id, kind: 'subscription', title: '', url: '', username: '', password: '', notes: '', categoryId: '', categoryIds: [], favorite: false, createdAt: now, updatedAt: now,
      financeSubscription: { id, label: 'Подписка', value: '', type: 'subscription', subscription: { price: 0, currency: 'RUB', periodCount: 1, periodUnit: 'month', startsOn: today, paidFrom: today, paidUntil: addPeriod(today, 1, 'month'), autoRenew: true } }
    }
    error.value = ''; open.value = true
  }
  function setTargets(values: string[]) {
    const added = values.find(value => !targets.value.includes(value))
    targets.value = added === 'personal' ? ['personal'] : values.filter(value => value !== 'personal')
    if (!targets.value.length) targets.value = ['personal']
    if (draft.value && canCategorize.value) categories.value = categories.value.filter(id => categoryOptions.value.some(option => option.value === id))
  }
  const categoryRequired = computed(() => targets.value.some(id => !context.canManageCategoryVault(id)))
  async function save() {
    if (!editable.value) return
    const entry = draft.value, sub = entry?.financeSubscription?.subscription
    error.value = ''
    if (!entry || !sub || !entry.title.trim() || !entry.financeSubscription?.label.trim()) { error.value = 'Укажите название подписки.'; return }
    if (!Number.isFinite(sub.price) || sub.price < 0 || sub.price > 1e9 || !Number.isInteger(sub.periodCount) || sub.periodCount < 1 || sub.periodCount > 1000 || !validDate(sub.startsOn) || !validDate(sub.paidUntil) || sub.paidUntil < sub.startsOn || (sub.paidFrom && (!validDate(sub.paidFrom) || sub.paidFrom > sub.paidUntil))) { error.value = 'Проверьте стоимость, период и даты подписки.'; return }
    if (categoryRequired.value && !categories.value.length) { error.value = 'Выберите категорию для выбранного хранилища.'; return }
    entry.title = entry.title.trim(); entry.financeSubscription!.label = entry.financeSubscription!.label.trim(); entry.updatedAt = new Date().toISOString()
    if (await shared.saveCard(JSON.parse(JSON.stringify(entry)), canShare.value ? targets.value.filter(id => id !== 'personal') : undefined, recordId.value || undefined, undefined, revision.value || undefined)) {
      open.value = false; toast.add({ title: 'Подписка сохранена', color: 'success' }); await useNotificationsStore().refresh()
    } else error.value = shared.error || 'Не удалось сохранить подписку.'
  }
  const archiveOpen = ref(false)
  async function archive() {
    if (!recordId.value || !editable.value) return
    if (await shared.deleteCard(recordId.value)) { archiveOpen.value = false; open.value = false; toast.add({ title: 'Подписка удалена, история оплат сохранена', color: 'success' }) }
    else error.value = shared.error
  }
  let migrating = false
  async function migrate() {
    if (migrating || shared.loading || shared.busy || !vault.unlocked) return
    const legacy = context.allEntries.value.some(entry => entry.kind !== 'subscription' && entry.customFields?.some(field => field.type === 'subscription'))
    if (!legacy) return
    migrating = true
    try { const result = await shared.migrateSubscriptions(); if (result) await vault.check() } finally { migrating = false }
  }
  watch(open, value => { if (!value) { draft.value = null; error.value = ''; archiveOpen.value = false } })
  return { editable, open, draft, field, error, recordId, targets, canShare, canCategorize, cards, vaultOptions, categoryOptions, categories, categoryRequired, edit, setTargets, save, archiveOpen, archive, migrate }
}
