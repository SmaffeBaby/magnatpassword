<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Project } from '~~/shared/types/projects'
import type { EstimateItem, EstimateView, EstimateFieldType, ProjectEstimate } from '~~/shared/types/estimate'
import { estimateColumns, estimateCell, estimateSnapshot, lineTotal, estimateItemSchema, estimateViewSchema, estimateAmounts, counterpartyLabel } from '~~/shared/utils/estimate'
import ProjectEstimateDetails from './ProjectEstimateDetails.vue'

const props = defineProps<{ project: Project }>()
const auth = useAuthStore(), client = useQueryClient(), supabase = useNuxtApp().$supabase
const queryKey = computed(() => ['account', auth.user?.id, 'project-estimate', props.project.id])
const estimate = useQuery({ queryKey, queryFn: ({ signal }) => sharedRequest<ProjectEstimate>(`/api/projects/${props.project.id}/estimate`, { signal }), retry: false, refetchInterval: 30000 })
const editable = computed(() => props.project.permission !== 'viewer')
const items = computed(() => estimate.data.value?.items ?? [])
const tab = ref<'items' | 'table'>('items'), search = ref(''), error = ref(''), saving = ref(false), exporting = ref('')
const parties = computed(() => estimate.data.value?.counterparties ?? [])
const amounts = computed(() => estimateAmounts(items.value)), selectedAmounts = computed(() => estimateAmounts(snapshot.value.rows))
const formOpen = ref(false), deleteOpen = ref(false), settingsOpen = ref(false), editing = ref(false)
const view = ref<EstimateView>({ hiddenRows: [], hiddenColumns: ['kind','image','link','deadline','vatRate'] }), draftView = ref<EstimateView>({ hiddenRows: [], hiddenColumns: [] })
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
const fresh = (): EstimateItem => ({ id: crypto.randomUUID(), kind: 'product', name: '', image: '', link: '', quantity: 1, price: 0, currency: 'RUB', deadline: '', fields: [], unit: 'шт.', counterpartyId: '', internalCost: false, vatRate: 0, vatGroup: '' })
const draft = ref<EstimateItem>(fresh()), baseItems = ref<EstimateItem[]>([]), baseRevision = ref(0)
const media = useMediaUploads(), formError = ref(''), deleteTarget = ref<EstimateItem | null>(null)
const partySelection = computed({ get: () => draft.value.internalCost ? 'internal' : draft.value.counterpartyId, set: (value: string) => { draft.value.internalCost = value === 'internal'; draft.value.counterpartyId = value === 'internal' ? '' : value } })
const partyMenuValue = computed({get:()=>partySelection.value || 'none',set:(value:string)=>{partySelection.value=value==='none'?'':value}})
const partyOptions = computed(()=>[
  {value:'none',label:'Не выбран',inn:'',description:''},
  {value:'internal',label:'Внутренние затраты',inn:'',description:''},
  ...parties.value.map(party=>({value:party.id,label:party.company+(party.isOwnLegalEntity?' · Наше юр. лицо':''),inn:party.inn,description:party.inn?'ИНН '+party.inn:''}))
])
const fieldTypes: { value: EstimateFieldType; label: string }[] = [{ value: 'text', label: 'Текст' }, { value: 'link', label: 'Ссылка' }, { value: 'money', label: 'Стоимость' }, { value: 'date', label: 'Дата' }, { value: 'number', label: 'Число' }]
const filtered = computed(() => items.value.filter(item => item.name.toLocaleLowerCase('ru').includes(search.value.trim().toLocaleLowerCase('ru'))))
const columns = computed(() => estimateColumns(items.value))
const snapshot = computed(() => estimateSnapshot(items.value, view.value))
const tableRows = computed(() => snapshot.value.rows.filter(item => filtered.value.some(match => match.id === item.id)))
const money = (value: number, currency: string) => `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`
const dateLabel = (value: string) => value ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : '—'
function cellLabel(item: EstimateItem, key: string) {
  if (key === 'number') return snapshot.value.rows.findIndex(row => row.id === item.id) + 1
  if (key === 'counterparty') return item.internalCost ? 'Внутренние затраты' : counterpartyLabel(item.counterpartyId, parties.value) || '—'

  if (key === 'vat' || key === 'net') { const value = selectedAmounts.value[snapshot.value.rows.findIndex(row => row.id === item.id)]?.[key] ?? 0; return money(value, 'RUB') }
  const value = estimateCell(item, key)
  if (key === 'deadline') return dateLabel(String(value))
  if (key === 'price' || key === 'total') return Number(value).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (typeof value === 'number') return value.toLocaleString('ru-RU', { maximumFractionDigits: 6 })
  return value === '' ? '—' : value
}
const storageKey = computed(() => `estimate-view:${auth.user?.id}:${props.project.id}`)
onMounted(() => { try { const cached = JSON.parse(localStorage.getItem(storageKey.value) || 'null'), parsed = estimateViewSchema.safeParse(cached); if (parsed.success) view.value = parsed.data } catch {} })
watch(() => props.project.permission, () => { if (!editable.value) { formOpen.value = false; deleteOpen.value = false } })
watch(() => auth.user?.id, () => { formOpen.value = false; deleteOpen.value = false; settingsOpen.value = false; view.value = { hiddenRows: [], hiddenColumns: [] } })
function capture() { baseItems.value = clone(items.value); baseRevision.value = estimate.data.value?.revision ?? 0 }
function openItem(item?: EstimateItem) {
  if (!editable.value) return
  capture(); draft.value = item ? clone(item) : fresh(); editing.value = !!item; formError.value = ''; media.mediaError.value = ''; formOpen.value = true
}
function addField() { draft.value.fields.push({ id: crypto.randomUUID(), label: '', type: 'text', value: '', currency: 'RUB' }) }
async function upload(event: Event) { const images = await media.readImages(event, 1); if (images[0]) draft.value.image = images[0].data }
function message(failure: any) { return failure?.data?.message || failure?.message || 'Не удалось сохранить смету' }
async function write(nextItems: EstimateItem[]) {
  const userId = auth.user?.id
  let result: ProjectEstimate
  try { result = await sharedRequest<ProjectEstimate>(`/api/projects/${props.project.id}/estimate`, { method: 'PUT', body: { revision: baseRevision.value, items: nextItems } }) }
  catch (failure: any) {
    if (failure?.statusCode === 409) { await estimate.refetch(); throw Error('Смета изменена другим участником. Закройте форму и откройте позицию заново, чтобы увидеть актуальные данные.') }
    throw failure
  }
  if (auth.user?.id !== userId) return false
  client.setQueryData(queryKey.value, result)
  return true
}
async function saveItem() {
  if (saving.value || !editable.value || media.mediaBusy.value) return
  formError.value = ''
  const parsed = estimateItemSchema.safeParse(draft.value)
  if (!parsed.success) { formError.value = parsed.error.issues[0]?.message || 'Проверьте заполненные поля'; return }
  saving.value = true
  try {
    const next = editing.value ? baseItems.value.map(item => item.id === draft.value.id ? parsed.data : item) : [...baseItems.value, parsed.data]
    if (await write(next)) formOpen.value = false
  } catch (failure) { formError.value = message(failure) }
  finally { saving.value = false }
}
function askDelete(item: EstimateItem) { capture(); deleteTarget.value = item; error.value = ''; deleteOpen.value = true }
async function removeItem() {
  if (!deleteTarget.value || saving.value || !editable.value) return
  saving.value = true; error.value = ''
  try { if (await write(baseItems.value.filter(item => item.id !== deleteTarget.value?.id))) deleteOpen.value = false }
  catch (failure) { error.value = message(failure) }
  finally { saving.value = false }
}
function openSettings() { draftView.value = clone(view.value); settingsOpen.value = true }
function toggle(list: string[], key: string, visible: boolean) { return visible ? list.filter(item => item !== key) : [...new Set([...list, key])] }
function applyView() {
  view.value = { hiddenRows: draftView.value.hiddenRows.filter(id => items.value.some(item => item.id === id)), hiddenColumns: draftView.value.hiddenColumns.filter(key => columns.value.some(column => column.key === key)) }
  try { localStorage.setItem(storageKey.value, JSON.stringify(view.value)) } catch {}
  settingsOpen.value = false
}
async function download(format: 'xlsx' | 'pdf') {
  if (exporting.value) return
  exporting.value = format; error.value = ''
  const userId = auth.user?.id
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session || data.session.user.id !== userId) throw Error('Войдите в аккаунт')
    const blob = await $fetch<Blob>(`/api/projects/${props.project.id}/estimate-export`, { method: 'POST', retry: 0, responseType: 'blob', headers: { Authorization: `Bearer ${data.session.access_token}` }, body: { format, view: view.value } })
    if (auth.user?.id !== userId) return
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = `Смета — ${props.project.name.replace(/[\\/:*?"<>|]/g, '-')}.${format}`; document.body.appendChild(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 10000)
  } catch (failure: any) {
    if (failure?.data instanceof Blob) { try { error.value = (JSON.parse(await failure.data.text())).message } catch { error.value = 'Не удалось скачать смету' } }
    else error.value = message(failure)
  } finally { exporting.value = '' }
}
</script>

<template>
  <section class="estimate-workspace" aria-label="Смета проекта">
    <p v-if="estimate.isPending.value" class="estimate-state">Загружаем смету…</p>
    <UAlert v-else-if="estimate.error.value" color="error" title="Не удалось загрузить смету" :actions="[{ label: 'Повторить', onClick: () => estimate.refetch() }]" />
    <template v-else>
      <ProjectEstimateDetails :project="project"/><div class="estimate-toolbar">
        <div class="estimate-tabs" role="tablist" aria-label="Разделы сметы"><button id="estimate-items-tab" type="button" role="tab" :aria-selected="tab === 'items'" aria-controls="estimate-panel" @click="tab = 'items'"><UIcon name="i-lucide-package"/>Товары/Услуги <span>{{ items.length }}</span></button><button id="estimate-table-tab" type="button" role="tab" :aria-selected="tab === 'table'" aria-controls="estimate-panel" @click="tab = 'table'"><UIcon name="i-lucide-table-2"/>Таблица</button></div>
        <UButton v-if="editable" icon="i-lucide-plus" label="Добавить товар/услугу" :disabled="items.length >= 200" @click="openItem()"/>
      </div>
      <p v-if="!editable" class="estimate-hint">У вас доступ на просмотр. Можно настроить вид таблицы и скачать смету.</p>
      <UAlert v-if="error && !deleteOpen" color="error" :description="error"/>

      <div id="estimate-panel" role="tabpanel" :aria-labelledby="tab === 'items' ? 'estimate-items-tab' : 'estimate-table-tab'">
        <div v-if="items.length || tab === 'table'" class="estimate-filterbar"><UInput v-model="search" icon="i-lucide-search" placeholder="Найти товар или услугу" aria-label="Поиск в смете" class="estimate-search"/><template v-if="tab === 'table'"><UButton color="neutral" variant="outline" icon="i-lucide-sliders-horizontal" label="Строки и столбцы" @click="openSettings"/><UButton color="neutral" variant="outline" icon="i-lucide-file-spreadsheet" label="Excel" :loading="exporting === 'xlsx'" :disabled="!!exporting" @click="download('xlsx')"/><UButton color="neutral" variant="outline" icon="i-lucide-file-text" label="PDF" :loading="exporting === 'pdf'" :disabled="!!exporting" @click="download('pdf')"/></template></div>
        <div v-if="!items.length && tab === 'items'" class="estimate-empty"><span><UIcon name="i-lucide-calculator"/></span><h2>Из чего складывается проект?</h2><p>Добавьте товары и услуги — таблица и суммы сметы сформируются автоматически.</p><UButton v-if="editable" icon="i-lucide-plus" label="Добавить первую позицию" @click="openItem()"/></div>
        <template v-else-if="tab === 'items'">
          <div class="estimate-items"><article v-for="item in filtered" :key="item.id" class="estimate-item"><div class="estimate-item-image"><img v-if="item.image" :src="item.image" :alt="item.name"/><UIcon v-else :name="item.kind === 'product' ? 'i-lucide-package' : 'i-lucide-wrench'"/></div><div class="estimate-item-content"><small>{{ item.kind === 'product' ? 'Товар' : 'Услуга' }}</small><h2>{{ item.name }}</h2><a v-if="item.link" :href="item.link" target="_blank" rel="noopener noreferrer" class="estimate-link">Открыть ссылку <UIcon name="i-lucide-external-link"/></a><p>{{ item.internalCost ? 'Внутренние затраты' : counterpartyLabel(item.counterpartyId, parties) }}<span v-if="parties.find(party => party.id === item.counterpartyId)?.isOwnLegalEntity" class="estimate-own-company">Наше юр. лицо</span><span v-if="item.unit"> · {{ item.unit }}</span></p><p>{{ item.quantity.toLocaleString('ru-RU') }} × {{ money(item.price, item.currency) }}<span v-if="item.deadline"> · До {{ dateLabel(item.deadline) }}</span></p><p>НДС {{ item.vatRate }}%: {{ money(amounts[items.findIndex(row => row.id === item.id)]?.vat ?? 0, 'RUB') }} · Без НДС: {{ money(amounts[items.findIndex(row => row.id === item.id)]?.net ?? 0, 'RUB') }}</p><dl v-if="item.fields.length" class="estimate-extra"><div v-for="field in item.fields" :key="field.id"><dt>{{ field.label }}</dt><dd><a v-if="field.type === 'link' && field.value" :href="field.value" target="_blank" rel="noopener noreferrer">{{ field.value }}</a><template v-else-if="field.type === 'money' && field.value">{{ money(Number(field.value), field.currency) }}</template><template v-else-if="field.type === 'date'">{{ dateLabel(field.value) }}</template><template v-else>{{ field.value || '—' }}</template></dd></div></dl></div><div class="estimate-item-end"><strong>{{ money(lineTotal(item), item.currency) }}</strong><div v-if="editable" class="estimate-item-actions"><UButton color="neutral" variant="ghost" icon="i-lucide-pencil" :aria-label="`Изменить: ${item.name}`" @click="openItem(item)"/><UButton color="neutral" variant="ghost" icon="i-lucide-trash-2" :aria-label="`Удалить: ${item.name}`" @click="askDelete(item)"/></div></div></article></div>
          <p v-if="!filtered.length" class="estimate-state">По вашему запросу ничего не найдено.</p>
        </template>
        <template v-else>
          <p class="estimate-hint">Показано {{ snapshot.rows.length }} из {{ items.length }} строк · {{ snapshot.columns.length }} из {{ columns.length }} столбцов. Экспорт сметы содержит все поля листа «Смета» вашего шаблона. Контрагенты экспортируются отдельно на странице проекта. Скрытые строки сметы не экспортируются; выбор столбцов действует только на экран.</p>
          <div v-if="snapshot.columns.length && tableRows.length" class="estimate-table-wrap" tabindex="0" aria-label="Таблица сметы, прокручивается горизонтально"><table class="estimate-table"><thead><tr><th v-for="column in snapshot.columns" :key="column.key" scope="col">{{ column.label }}</th><th v-if="editable" scope="col"><span class="sr-only">Действия</span></th></tr></thead><tbody><tr v-for="item in tableRows" :key="item.id"><td v-for="column in snapshot.columns" :key="column.key"><img v-if="column.key === 'image' && item.image" :src="item.image" :alt="item.name" class="estimate-table-image"/><span v-else-if="column.key === 'image'">—</span><a v-else-if="column.key === 'link' && item.link" :href="item.link" target="_blank" rel="noopener noreferrer">{{ item.link }}</a><template v-else>{{ cellLabel(item, column.key) }}</template></td><td v-if="editable"><UButton color="neutral" variant="ghost" icon="i-lucide-pencil" :aria-label="`Изменить: ${item.name}`" @click="openItem(item)"/></td></tr></tbody></table></div>
          <div v-else class="estimate-empty estimate-empty-small"><h2>{{ !snapshot.columns.length ? 'Все столбцы скрыты' : !snapshot.rows.length ? 'Все строки скрыты' : 'Нет совпадений' }}</h2><p>Измените настройки таблицы или поисковый запрос.</p><UButton label="Строки и столбцы" color="neutral" variant="outline" @click="openSettings"/></div>
          <div v-if="snapshot.totals.length" class="estimate-view-totals"><span>Итого по выбранным строкам:</span><strong v-for="total in snapshot.totals" :key="total.currency">{{ money(total.amount, total.currency) }}</strong></div>
        </template>
      </div>
    </template>
    <UModal v-model:open="formOpen" :title="editing ? 'Изменить позицию' : 'Добавить товар/услугу'" description="Стоимость за единицу и количество формируют сумму позиции." :dismissible="!saving && !media.mediaBusy.value" :ui="{ content: 'sm:max-w-3xl' }">
      <template #body><form id="estimate-item-form" class="estimate-form" @submit.prevent="saveItem"><div class="estimate-form-grid"><label>Тип<select v-model="draft.kind" :disabled="saving"><option value="product">Товар</option><option value="service">Услуга</option></select></label><label class="estimate-span">Статья затрат <span aria-hidden="true">*</span><input v-model="draft.name" required maxlength="160" :disabled="saving" placeholder="Например, Разработка сайта"/></label><label class="estimate-span">Ссылка<input v-model="draft.link" type="url" maxlength="2000" :disabled="saving" placeholder="https://"/></label><label>Количество <span aria-hidden="true">*</span><input v-model.number="draft.quantity" type="number" min="0.000001" max="1000000" step="any" required :disabled="saving"/></label><label>Цена за единицу с НДС, ₽ <span aria-hidden="true">*</span><input v-model.number="draft.price" type="number" min="0" max="1000000000" step="0.01" required :disabled="saving"/></label><label>Ед.<input v-model="draft.unit" maxlength="30" :disabled="saving" placeholder="шт., усл., компл."/></label><label>Контрагент / исполнитель<USelectMenu v-model="partyMenuValue" :items="partyOptions" value-key="value" :filter-fields="['label','inn']" :search-input="{ placeholder: 'Название или ИНН' }" aria-label="Контрагент / исполнитель" :disabled="saving" class="w-full" size="lg"><template #empty>Контрагенты не найдены</template></USelectMenu></label><label>НДС, % (включён в цену)<input v-model.number="draft.vatRate" type="number" min="0" max="100" step="0.01" required :disabled="saving"/></label><label>До какого числа<input v-model="draft.deadline" type="date" :disabled="saving"/></label></div><div class="estimate-upload"><label>Изображение<input type="file" accept="image/png,image/jpeg" :disabled="saving || media.mediaBusy.value" @change="upload"/><small>PNG или JPEG до 10 МБ</small></label><div v-if="draft.image" class="estimate-preview"><img :src="draft.image" alt="Изображение позиции"/><UButton label="Убрать изображение" color="neutral" variant="ghost" :disabled="saving" @click="draft.image = ''"/></div><p v-if="media.mediaBusy.value">Загружаем изображение…</p><p v-if="media.mediaError.value" role="alert" class="estimate-form-error">{{ media.mediaError.value }}</p></div><section class="estimate-fields" aria-label="Дополнительные поля"><div class="estimate-field-heading"><h3>Дополнительные поля</h3><UButton type="button" label="Добавить поле" icon="i-lucide-plus" color="neutral" variant="outline" :disabled="saving || draft.fields.length >= 20" @click="addField"/></div><div v-for="(field, index) in draft.fields" :key="field.id" class="estimate-custom-field"><label>Название поля<input v-model="field.label" required maxlength="80" :disabled="saving"/></label><label>Тип поля<select v-model="field.type" :disabled="saving" @change="field.value = ''"><option v-for="type in fieldTypes" :key="type.value" :value="type.value">{{ type.label }}</option></select></label><label class="estimate-custom-value">Значение<input v-model="field.value" :type="field.type === 'date' ? 'date' : field.type === 'link' ? 'url' : ['money','number'].includes(field.type) ? 'number' : 'text'" :step="field.type === 'money' ? '0.01' : 'any'" maxlength="2000" :disabled="saving"/></label><UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="`Убрать поле ${index+1}`" :disabled="saving" @click="draft.fields.splice(index, 1)"/></div></section><p class="estimate-form-total">Сумма позиции <strong>{{ money(Number.isFinite(lineTotal(draft)) ? lineTotal(draft) : 0, draft.currency) }}</strong></p><UAlert v-if="formError" color="error" :description="formError"/></form></template>
      <template #footer><div class="estimate-modal-footer"><UButton color="neutral" variant="outline" label="Отмена" :disabled="saving || media.mediaBusy.value" @click="formOpen = false"/><UButton type="submit" form="estimate-item-form" label="Сохранить позицию" :loading="saving" :disabled="media.mediaBusy.value"/></div></template>
    </UModal>
    <UModal v-model:open="deleteOpen" title="Удалить позицию?" :description="`«${deleteTarget?.name ?? ''}» будет удалена из сметы и таблицы.`" :dismissible="!saving"><template #body><UAlert v-if="error" color="error" :description="error"/><p v-else>Остальные позиции сметы сохранятся.</p></template><template #footer><div class="estimate-modal-footer"><UButton label="Отмена" color="neutral" variant="outline" :disabled="saving" @click="deleteOpen = false"/><UButton label="Удалить позицию" color="error" :loading="saving" @click="removeItem"/></div></template></UModal>
    <UModal v-model:open="settingsOpen" title="Строки и столбцы" description="Настройки сохраняются в этом браузере. Скрытые строки не попадают в экспорт; столбцы файла всегда соответствуют шаблону." :ui="{ content: 'sm:max-w-2xl' }"><template #body><div class="estimate-settings"><section><div class="estimate-field-heading"><h3>Столбцы</h3><button type="button" @click="draftView.hiddenColumns = []">Показать все</button></div><label v-for="column in columns" :key="column.key"><input type="checkbox" :checked="!draftView.hiddenColumns.includes(column.key)" @change="draftView.hiddenColumns = toggle(draftView.hiddenColumns, column.key, ($event.target as HTMLInputElement).checked)"/>{{ column.label }}</label></section><section><div class="estimate-field-heading"><h3>Строки</h3><button type="button" @click="draftView.hiddenRows = []">Показать все</button></div><label v-for="item in items" :key="item.id"><input type="checkbox" :checked="!draftView.hiddenRows.includes(item.id)" @change="draftView.hiddenRows = toggle(draftView.hiddenRows, item.id, ($event.target as HTMLInputElement).checked)"/>{{ item.name }}</label></section></div></template><template #footer><div class="estimate-modal-footer"><UButton label="Отмена" color="neutral" variant="outline" @click="settingsOpen = false"/><UButton label="Применить" @click="applyView"/></div></template></UModal>
  </section>
</template>

<style scoped>
.estimate-register-picker{display:flex;align-items:center;gap:12px;color:#64748b;font-size:13px;margin:20px 0}.estimate-register-picker select{background:white;border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px;color:#334155;min-width:160px}.estimate-own-company{display:inline-block;font-size:10px;padding:3px 7px;border-radius:6px;margin-left:8px;background:#f3f4f8;color:var(--ui-primary)}.estimate-workspace{min-width:0}.estimate-toolbar,.estimate-filterbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:24px}.estimate-tabs{display:flex;padding:5px;background:#edf0f5;border:1px solid #e2e8f0;border-radius:14px;gap:4px;max-width:100%}.estimate-tabs button{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 18px;border-radius:10px;color:#8090a6;font-weight:600;cursor:pointer}.estimate-tabs button[aria-selected=true]{background:white;color:#334155;box-shadow:0 2px 8px #0f172a08}.estimate-tabs span{font-size:12px;color:#94a3b8}.estimate-totals{display:flex;gap:16px;flex-wrap:wrap;margin:24px 0}.estimate-totals>div{flex:1;min-width:180px;background:white;border:1px solid #e2e8f0;border-radius:18px;padding:20px 24px}.estimate-totals small{display:block;color:#94a3b8;font-size:12px;margin-bottom:8px}.estimate-totals strong{font-size:23px;color:#334155}.estimate-search{flex:1;min-width:220px}.estimate-items{display:grid;gap:16px}.estimate-item{display:flex;align-items:flex-start;gap:22px;padding:24px;background:white;border:1px solid #e2e8f0;border-radius:20px;min-width:0}.estimate-item-image{width:88px;height:88px;flex-shrink:0;border-radius:14px;background:#f3f4f8;display:grid;place-items:center;color:var(--ui-primary);font-size:28px;overflow:hidden}.estimate-item-image img{width:100%;height:100%;object-fit:contain}.estimate-item-content{flex:1;min-width:0}.estimate-item-content>small{font-size:11px;color:#94a3b8}.estimate-item h2{font-size:18px;color:#334155;font-weight:600;overflow-wrap:anywhere;margin:4px 0 8px}.estimate-item p{font-size:13px;color:#8292a8;margin-top:10px}.estimate-link{display:inline-flex;gap:6px;align-items:center;font-size:13px;color:var(--ui-primary)}.estimate-item-end{display:flex;flex-direction:column;align-items:flex-end;gap:14px}.estimate-item-end>strong{white-space:nowrap;color:#334155;font-size:18px}.estimate-item-actions{display:flex;gap:4px}.estimate-extra{display:flex;gap:8px 24px;flex-wrap:wrap;margin-top:14px;font-size:12px}.estimate-extra>div{min-width:100px;max-width:100%;overflow-wrap:anywhere}.estimate-extra dt{color:#94a3b8;margin-bottom:4px}.estimate-extra dd{color:#475569}.estimate-extra a,.estimate-table a{color:var(--ui-primary);text-decoration:underline}.estimate-empty{text-align:center;padding:64px 24px;border:1px solid #e2e8f0;border-radius:22px;background:#ffffffb3}.estimate-empty>span{display:inline-grid;place-items:center;font-size:32px;width:72px;height:72px;background:#f3f4f8;border-radius:20px;color:var(--ui-primary);margin-bottom:20px}.estimate-empty h2{font-size:23px;font-weight:600;color:#334155}.estimate-empty p{font-size:14px;color:#94a3b8;margin:12px auto 24px;max-width:470px;line-height:1.7}.estimate-empty-small{padding:40px 24px}.estimate-hint,.estimate-state{font-size:13px;color:#8292a8;line-height:1.7;margin:16px 0}.estimate-table-wrap{overflow:auto;border:1px solid #e2e8f0;border-radius:16px;background:white;max-width:100%}.estimate-table{width:100%;border-collapse:collapse;font-size:13px;text-align:left}.estimate-table th{background:#f5f7fa;color:#64748b;font-size:12px;font-weight:600;white-space:nowrap}.estimate-table td,.estimate-table th{padding:16px 18px;border-bottom:1px solid #e2e8f0}.estimate-table td{min-width:130px;max-width:280px;overflow-wrap:anywhere;color:#334155}.estimate-table tr:last-child td{border-bottom:0}.estimate-table-image{width:60px;height:48px;object-fit:contain}.estimate-view-totals{display:flex;gap:14px 24px;flex-wrap:wrap;align-items:center;justify-content:flex-end;padding:24px 0;font-size:14px;color:#475569}.estimate-view-totals>span{color:#94a3b8}.estimate-form{display:flex;flex-direction:column;gap:24px}.estimate-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.estimate-form label{display:flex;flex-direction:column;gap:8px;font-size:13px;font-weight:500;color:#475569}.estimate-form label>span{display:none}.estimate-form input:not([type=file]),.estimate-form select{width:100%;min-width:0;padding:10px 12px;background:white;border:1px solid #cbd5e1;border-radius:8px;color:#1e293b;font-size:14px;outline-color:var(--ui-primary)}.estimate-span{grid-column:1/-1}.estimate-upload{border:1px dashed #cbd5e1;border-radius:12px;padding:18px}.estimate-upload small{font-size:11px;color:#94a3b8}.estimate-preview{display:flex;gap:16px;align-items:center;margin-top:12px}.estimate-preview img{max-width:120px;max-height:100px;object-fit:contain;border-radius:8px}.estimate-fields{border-top:1px solid #e2e8f0;padding-top:24px}.estimate-field-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}.estimate-field-heading h3{font-weight:600;font-size:14px;color:#334155}.estimate-custom-field{display:grid;grid-template-columns:1fr 115px 1fr auto;gap:12px;margin:16px 0;align-items:end;background:#f8fafc;border-radius:12px;padding:14px}.estimate-custom-field:has(label:nth-of-type(4)){grid-template-columns:1fr 105px 1fr 80px auto}.estimate-custom-field label{min-width:0}.estimate-form-total{display:flex;gap:16px;justify-content:space-between;padding:18px;background:#f3f4f8;border-radius:12px;color:#64748b;font-size:14px}.estimate-form-total strong{color:#334155}.estimate-modal-footer{display:flex;gap:12px;justify-content:flex-end;width:100%;flex-wrap:wrap}.estimate-form-error{color:#dc2626;font-size:13px;margin-top:12px}.estimate-settings{display:grid;grid-template-columns:1fr 1fr;gap:28px}.estimate-settings section{min-width:0}.estimate-settings label{display:flex;align-items:center;gap:10px;font-size:13px;color:#475569;padding:9px 0;overflow-wrap:anywhere}.estimate-settings input{accent-color:var(--ui-primary);flex-shrink:0}.estimate-field-heading>button{font-size:11px;color:var(--ui-primary);cursor:pointer}.estimate-form input:disabled,.estimate-form select:disabled{opacity:.6}.estimate-tabs button:focus-visible{outline:2px solid var(--ui-primary)}
@media(max-width:700px){.estimate-tabs{width:100%}.estimate-tabs button{flex:1;padding:12px 8px;font-size:13px}.estimate-item{flex-wrap:wrap;padding:18px;gap:16px}.estimate-item-image{width:56px;height:56px}.estimate-item-content{flex-basis:calc(100% - 72px)}.estimate-item-end{width:100%;flex-direction:row;align-items:center;justify-content:space-between}.estimate-totals>div{min-width:140px;padding:18px}.estimate-totals strong{font-size:19px}.estimate-filterbar{gap:10px}.estimate-search{flex-basis:100%}.estimate-form-grid{grid-template-columns:1fr}.estimate-custom-field,.estimate-custom-field:has(label:nth-of-type(4)){grid-template-columns:1fr 1fr}.estimate-custom-value{grid-column:1/-1}.estimate-settings{grid-template-columns:1fr}.estimate-empty{padding:40px 20px}.estimate-form-total{flex-wrap:wrap}.estimate-workspace{width:100%}}
</style>
