import type { VaultSource } from '~~/shared/types/sharing'
import type { SubscriptionPayment } from '~~/shared/types/subscriptions'
import { sourcePayments, currencyTotals, amountLabel } from '~~/shared/utils/subscription-finances'
import { sourceEntries } from '~~/shared/utils/vault-sources'
import { validDate, todayDate, dateLabel, addPeriod } from '~~/shared/utils/subscriptions'
import { createId } from '~/utils/browser'

export function usePaymentHistory(props: { sources: VaultSource[]; subscriptionKey?: string }) {
  const vault = useVaultStore(), shared = useSharedVaultsStore(), filtersStore = useFiltersStore()
  const filters = useSubscriptionFilters({ get entries() { return sourceEntries(props.sources) }, get groups() { return props.sources.map(source => ({ id: source.id, name: source.name })) } }, 'history')
  const { from, to } = toRefs(filtersStore.history)
  const subscription = computed({ get: () => props.subscriptionKey || filtersStore.history.subscription, set: value => { filtersStore.history.subscription = value } })
  const allPayments = computed(() => sourcePayments(props.sources))
  const rowKey = (entry: { sharedCardId?: string; vaultId: string; id: string }, fieldId: string) => `${entry.sharedCardId ? 'shared:' + entry.sharedCardId : entry.vaultId + '/' + entry.id}/${fieldId}`
  const paymentKey = (payment: ReturnType<typeof sourcePayments>[number]) => rowKey({ sharedCardId: payment.sharedCardId, vaultId: payment.vaultId, id: payment.entryId }, payment.fieldId)
  const options = computed(() => {
    const items = new Map(filters.rows.value.map(row => [rowKey(row.entry, row.field.id), { label: `${row.entry.title} · ${row.field.label} · ${row.entry.vaultName}`, value: rowKey(row.entry, row.field.id) }]))
    for (const payment of allPayments.value) if (!items.has(paymentKey(payment))) items.set(paymentKey(payment), { label: `${payment.service} · ${payment.label} (архив)`, value: paymentKey(payment) })
    return [...items.values()]
  })
  const validRange = computed(() => (!from.value || validDate(from.value)) && (!to.value || validDate(to.value)) && (!from.value || !to.value || from.value <= to.value))
  const payments = computed(() => allPayments.value.filter(payment =>
    (subscription.value === 'all' || paymentKey(payment) === subscription.value) &&
    (filters.group.value === 'all' || payment.vaultIds.includes(filters.group.value)) &&
    (filters.currency.value === 'all' || payment.currency === filters.currency.value) &&
    `${payment.service} ${payment.label} ${payment.vaultNames.join(' ')}`.toLowerCase().includes(filters.search.value.trim().toLowerCase()) && validRange.value &&
    (!from.value || todayDate(new Date(payment.paidAt)) >= from.value) && (!to.value || todayDate(new Date(payment.paidAt)) <= to.value)
  ).sort((a,b) => b.paidAt.localeCompare(a.paidAt)))
  const totals = computed(() => currencyTotals(payments.value))
  const busy = computed(() => vault.busy || shared.busy || shared.loading)
  const error = ref(''), editorOpen = ref(false), deleteOpen = ref(false)
  const deleting = ref<ReturnType<typeof sourcePayments>[number] | null>(null)
  const draft = ref<SubscriptionPayment | null>(null), draftSubscription = ref(''), paidOn = ref('')
  const editing = ref(false)
  let originalPaidAt = '', originalPaidOn = ''
  const addOptions = computed(() => filters.rows.value.map(row => ({ label: `${row.entry.title} · ${row.field.label} · ${row.entry.vaultName}`, value: rowKey(row.entry, row.field.id) })))
  function setDefaults(key: string) {
    const row = filters.rows.value.find(row => rowKey(row.entry, row.field.id) === key)
    if (!row || !draft.value) return
    Object.assign(draft.value, { entryId: row.entry.id, fieldId: row.field.id, service: row.entry.title, label: row.field.label, amount: row.subscription.price, currency: row.subscription.currency, periodFrom: row.subscription.startsOn, periodUntil: addPeriod(row.subscription.startsOn, row.subscription.periodCount, row.subscription.periodUnit) })
  }
  watch(draftSubscription, key => { if (!editing.value) setDefaults(key) })
  function add() {
    editing.value = false; error.value = ''; paidOn.value = todayDate(); originalPaidAt = ''; originalPaidOn = ''
    draft.value = { id: createId(), entryId: '', fieldId: '', service: '', label: '', amount: 0, currency: 'RUB', paidAt: '', periodFrom: '', periodUntil: '' }
    draftSubscription.value = addOptions.value.some(option => option.value === subscription.value) ? subscription.value : addOptions.value[0]?.value ?? ''
    setDefaults(draftSubscription.value); editorOpen.value = true
  }
  function edit(payment: ReturnType<typeof sourcePayments>[number]) {
    editing.value = true; error.value = ''; draftSubscription.value = paymentKey(payment)
    const { id, entryId, fieldId, service, label, amount, currency, paidAt, periodFrom, periodUntil } = payment
    draft.value = { id, entryId, fieldId, service, label, amount, currency, paidAt, periodFrom, periodUntil }
    originalPaidAt = paidAt; originalPaidOn = todayDate(new Date(paidAt)); paidOn.value = originalPaidOn; editorOpen.value = true
  }
  function canManage(payment: ReturnType<typeof sourcePayments>[number]) {
    return payment.sharedCardId ? shared.cards.some(card => card.id === payment.sharedCardId && !card.archived) : props.sources.some(source => source.id === payment.vaultId)
  }
  async function persist(key: string, payment?: SubscriptionPayment, paymentId?: string) {
    if (busy.value) return false
    if (key.startsWith('shared:')) {
      const id = key.slice(7).split('/')[0]!
      const ok = payment ? await shared.savePayment(id, payment) : await shared.deletePayment(id, paymentId!)
      if (!ok) error.value = shared.error || 'Не удалось сохранить историю. Повторите после загрузки данных.'
      return ok
    }
    const source = props.sources.find(source => key.startsWith(source.id + '/'))
    if (!source) { error.value = 'Хранилище недоступно'; return false }
    const next = JSON.parse(JSON.stringify(source.data)) as VaultSource['data']
    next.entries = next.entries.filter(entry => !entry.sharedCardId)
    next.subscriptionPayments = (next.subscriptionPayments ?? []).filter(item => !item.sharedCardId)
    const index = next.subscriptionPayments.findIndex(item => item.id === (payment?.id ?? paymentId))
    if (payment) { if (index >= 0) next.subscriptionPayments[index] = payment; else next.subscriptionPayments.push(payment) }
    else if (index >= 0) next.subscriptionPayments.splice(index, 1)
    if (next.subscriptionPayments.length > 20000) { error.value = 'Достигнут предел записей истории'; return false }
    const ok = source.id === 'personal' ? await vault.save(next) : await shared.save(source.id, next)
    if (!ok) error.value = vault.error || shared.error || 'Не удалось сохранить историю'
    return ok
  }
  async function save() {
    error.value = ''
    const payment = draft.value
    if (!payment || !draftSubscription.value || !payment.entryId || !validDate(paidOn.value) || !validDate(payment.periodFrom) || !validDate(payment.periodUntil) || payment.periodUntil <= payment.periodFrom || !Number.isFinite(payment.amount) || payment.amount < 0 || payment.amount > 1_000_000_000) { error.value = 'Проверьте подписку, сумму, дату оплаты и оплаченный период.'; return }
    payment.paidAt = paidOn.value === originalPaidOn ? originalPaidAt : new Date(paidOn.value + 'T12:00:00+03:00').toISOString()
    if (await persist(draftSubscription.value, { ...payment })) editorOpen.value = false
  }
  function askDelete(payment: ReturnType<typeof sourcePayments>[number]) { error.value = ''; deleting.value = payment; deleteOpen.value = true }
  async function remove() {
    const payment = deleting.value
    if (!payment) return
    error.value = ''
    if (await persist(paymentKey(payment), undefined, payment.id)) { deleteOpen.value = false; deleting.value = null }
  }
  return { ...filters, subscription, from, to, options, addOptions, validRange, payments, totals, busy, error, editorOpen, deleteOpen, deleting, draft, draftSubscription, paidOn, editing, add, edit, canManage, save, askDelete, remove, dateLabel, amountLabel }
}
