<script setup lang="ts">
import type { Project } from '~~/shared/types/projects'
import type { ProjectCounterparty } from '~~/shared/types/estimate'
import { counterpartySchema } from '~~/shared/utils/estimate'
const props = defineProps<{ project: Project }>()
const { query, save } = useProjectEstimateData(() => props.project.id)
const parties = computed(() => query.data.value?.counterparties ?? [])
const editable = computed(() => props.project.permission !== 'viewer'), open = ref(false), busy = ref(false), error = ref(''), editing = ref(false), revision = ref(0)
const fresh = (): ProjectCounterparty => ({ id: crypto.randomUUID(), company: '', inn: '', kpp: '', director: '', address: '', bankAccount: '' })
const draft = ref(fresh()), base = ref<ProjectCounterparty[]>([])
const exporting = ref(''), exportError = ref(''), auth = useAuthStore(), supabase = useNuxtApp().$supabase
const fields = [{ key: 'company', label: 'Компания', max: 160 }, { key: 'inn', label: 'ИНН', max: 12 }, { key: 'kpp', label: 'КПП', max: 9 }, { key: 'director', label: 'Директор', max: 160 }, { key: 'address', label: 'Адрес', max: 500 }, { key: 'bankAccount', label: 'Р/с', max: 20 }] as const
function show(party?: ProjectCounterparty) { revision.value = query.data.value?.revision ?? 0; base.value = structuredClone(toRaw(parties.value)); draft.value = party ? { ...party } : fresh(); editing.value = !!party; error.value = ''; open.value = true }
function used(id: string) { const data = query.data.value; return !!data && (data.items.some(item => item.counterpartyId === id)) }
async function submit(remove = false) {
  if (!editable.value || busy.value) return
  error.value = ''
  const parsed = counterpartySchema.safeParse(draft.value)
  if (!remove && !parsed.success) { error.value = parsed.error.issues[0]?.message || 'Проверьте поля'; return }
  busy.value = true
  try { await save(revision.value, { counterparties: remove ? base.value.filter(party => party.id !== draft.value.id) : editing.value ? base.value.map(party => party.id === draft.value.id ? parsed.data! : party) : [...base.value, parsed.data!] }); open.value = false }
  catch (failure: any) { error.value = failure?.data?.message || failure.message }
  finally { busy.value = false }
}
watch(editable, allowed => { if (!allowed) open.value = false })
async function download(format: 'xlsx' | 'pdf') {
  if (exporting.value) return
  exporting.value = format; exportError.value = ''; const userId = auth.user?.id
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session || data.session.user.id !== userId) throw Error('Войдите в аккаунт')
    const blob = await $fetch<Blob>(`/api/projects/${props.project.id}/estimate-export`, { method: 'POST', retry: 0, responseType: 'blob', headers: { Authorization: `Bearer ${data.session.access_token}` }, body: { target: 'counterparties', format, view: { hiddenRows: [], hiddenColumns: [] } } })
    if (auth.user?.id !== userId) return
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = `Контрагенты — ${props.project.name.replace(/[\\/:*?"<>|]/g, '-')}.${format}`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 10000)
  } catch (failure: any) {
    if (failure?.data instanceof Blob) { try { exportError.value = JSON.parse(await failure.data.text()).message } catch { exportError.value = 'Не удалось скачать файл' } }
    else exportError.value = failure?.data?.message || failure.message
  } finally { exporting.value = '' }
}
</script>
<template>
  <section class="project-page-members counterparties-section" aria-label="Контрагенты проекта"><div class="project-page-section-heading"><h2>Контрагенты <span class="party-count">{{ parties.length }}</span></h2><div v-if="!query.isPending.value && !query.error.value" class="party-export-actions"><UButton label="Excel" aria-label="Экспорт контрагентов в Excel" icon="i-lucide-file-spreadsheet" color="neutral" variant="outline" :loading="exporting === 'xlsx'" :disabled="!!exporting" @click="download('xlsx')"/><UButton label="PDF" aria-label="Экспорт контрагентов в PDF" icon="i-lucide-file-text" color="neutral" variant="outline" :loading="exporting === 'pdf'" :disabled="!!exporting" @click="download('pdf')"/><UButton v-if="editable" label="Добавить контрагента" icon="i-lucide-plus" color="neutral" variant="outline" :disabled="parties.length >= 200" @click="show()"/></div></div><UAlert v-if="exportError" color="error" :description="exportError" class="mb-4"/>
    <p v-if="query.isPending.value" class="party-muted">Загружаем контрагентов…</p><UAlert v-else-if="query.error.value" color="error" title="Не удалось загрузить контрагентов" :actions="[{ label: 'Повторить', onClick: () => query.refetch() }]"/>
    <template v-else><p v-if="!parties.length" class="party-muted">Добавьте компании, участвующие в проекте, чтобы связывать их со сметой.</p><div v-else class="party-grid"><button v-for="party in parties" :key="party.id" type="button" class="party-card" @click="show(party)"><span class="party-icon"><UIcon name="i-lucide-building-2"/></span><strong>{{ party.company }}</strong><small v-if="party.inn">ИНН {{ party.inn }}</small><small v-if="party.director">{{ party.director }}</small><span class="party-card-link">{{ editable ? 'Реквизиты и настройки' : 'Реквизиты' }} →</span></button></div>
    </template>
  </section>
  <UModal v-model:open="open" :title="editing ? draft.company : 'Добавить контрагента'" description="Компания, ИНН, КПП, директор, адрес и расчётный счёт." :dismissible="!busy" :ui="{ content: 'sm:max-w-2xl' }"><template #body><form id="counterparty-form" class="party-form" @submit.prevent="submit()"><label v-for="field in fields" :key="field.key">{{ field.label }}<input v-model="draft[field.key]" :maxlength="field.max" :required="field.key === 'company'" :disabled="busy || !editable" :inputmode="['inn','kpp','bankAccount'].includes(field.key) ? 'numeric' : 'text'"/></label><p v-if="editing && used(draft.id)" class="party-muted">Контрагент связан с позициями сметы. Чтобы удалить его, сначала уберите эти связи.</p><UAlert v-if="error" color="error" :description="error"/></form></template><template #footer><div class="party-footer"><UButton v-if="editable && editing" label="Удалить" color="error" variant="ghost" :disabled="busy || used(draft.id)" @click="submit(true)"/><UButton label="Закрыть" color="neutral" variant="outline" :disabled="busy" @click="open = false"/><UButton v-if="editable" form="counterparty-form" type="submit" label="Сохранить контрагента" :loading="busy"/></div></template></UModal>
</template>
<style scoped>
.party-export-actions{display:flex;gap:8px;flex-wrap:wrap}.counterparties-section{margin-bottom:32px}.party-count{font-size:14px;color:#94a3b8;font-weight:400;margin-left:8px}.party-muted{color:#94a3b8;font-size:13px;line-height:1.7}.party-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px;margin:24px 0}.party-card{text-align:left;border:1px solid #e2e8f0;border-radius:16px;padding:20px;display:flex;flex-direction:column;align-items:flex-start;gap:10px;background:#fff;min-width:0;cursor:pointer}.party-card:hover{border-color:var(--ui-primary)}.party-card strong{font-size:16px;color:#334155;overflow-wrap:anywhere}.party-card small{color:#94a3b8;overflow-wrap:anywhere;font-size:12px}.party-icon{display:grid;place-items:center;width:40px;height:40px;background:#f3f4f8;border-radius:12px;color:var(--ui-primary)}.party-card-link{font-size:12px;color:var(--ui-primary);margin-top:10px}.party-form{display:grid;grid-template-columns:1fr 1fr;gap:20px}.party-form label{display:flex;flex-direction:column;gap:8px;color:#475569;font-size:13px}.party-form label:first-child,.party-form label:nth-child(5),.party-form>p,.party-form>[role=alert]{grid-column:1/-1}.party-form input{border:1px solid #cbd5e1;background:white;border-radius:8px;padding:10px 12px;width:100%;min-width:0;outline-color:var(--ui-primary)}.party-footer{display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;width:100%}@media(max-width:600px){.party-form{grid-template-columns:1fr}.party-grid{grid-template-columns:1fr}.project-page-section-heading{flex-wrap:wrap;gap:16px}}
</style>
