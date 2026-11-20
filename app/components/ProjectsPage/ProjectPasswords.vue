<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import type { Project } from '~~/shared/types/projects'
import type { ProjectPassword, ProjectPasswordChoice } from '~~/shared/types/project-passwords'
import type { CredentialAccount } from '~~/shared/types/vault'
import { credentialAccounts } from '~~/shared/utils/credentials'
import { copyText } from '~/utils/browser'
import CredentialDetails from '~/components/PasswordPage/CredentialDetails.vue'
import CredentialAccountEditor from '~/components/PasswordPage/CredentialAccountEditor.vue'
const props = defineProps<{ project: Project }>()
const auth = useAuthStore(), toast = useToast()
const base = computed(() => `/api/projects/${props.project.id}/passwords`)
const passwords = useQuery({ queryKey: computed(() => ['account', auth.user?.id, 'project-passwords', props.project.id]), queryFn: ({ signal }) => sharedRequest<ProjectPassword[]>(base.value, { signal }), retry: false, refetchInterval: 30000 })
const {search} = toRefs(useSavedFilters(() => `project-passwords:${props.project.id}`, { search: '' }))
const picker = ref(false), editor = ref(false), busy = ref(false), error = ref(''), choiceSearch = ref('')
const activeId = ref(''), editingId = ref(''), deleting = ref<ProjectPassword | null>(null)
const form = reactive({ title: '', url: '', notes: '', accounts: [] as CredentialAccount[] })
const choices = useQuery({ queryKey: computed(() => ['account', auth.user?.id, 'project-password-choices', props.project.id]), queryFn: ({ signal }) => sharedRequest<ProjectPasswordChoice[]>(`${base.value}/choices`, { signal }), enabled: picker, retry: false })
const rows = computed(() => (passwords.data.value ?? []).filter(row => `${row.entry.title} ${row.entry.username} ${row.entry.url}`.toLocaleLowerCase('ru').includes(search.value.trim().toLocaleLowerCase('ru'))))
const options = computed(() => (choices.data.value ?? []).filter(row => `${row.title} ${row.username} ${row.sourceName}`.toLocaleLowerCase('ru').includes(choiceSearch.value.trim().toLocaleLowerCase('ru'))))
const active = computed(() => passwords.data.value?.find(row => row.id === activeId.value))
const detail = computed(() => active.value ? { ...active.value.entry, vaultId: props.project.id, vaultName: props.project.name } : null)
const editingRevision = ref(0)
function addAccount() { form.accounts.push({ id: crypto.randomUUID(), label: form.accounts.length ? 'Дополнительный доступ' : 'Основной доступ', username: '', password: '' }) }
function edit(row?: ProjectPassword) {
  activeId.value = ''; editingId.value = row?.id ?? ''; editingRevision.value = row?.revision ?? 0; error.value = ''
  Object.assign(form, { title: row?.entry.title ?? '', url: row?.entry.url ?? '', notes: row?.entry.notes ?? '', accounts: row ? credentialAccounts(row.entry).map(account => ({ ...account })) : [] })
  if (!form.accounts.length) addAccount()
  editor.value = true
}
async function run(action: () => Promise<unknown>) {
  if (busy.value) return
  const actor = auth.user?.id
  busy.value = true; error.value = ''
  try { await action(); if (actor === auth.user?.id) { await passwords.refetch(); picker.value = false; editor.value = false; deleting.value = null } }
  catch (failure: any) { if (actor === auth.user?.id) { error.value = failure?.data?.message || 'Не удалось сохранить пароль'; if ([403, 404, 409].includes(failure?.statusCode)) await passwords.refetch() } }
  finally { busy.value = false }
}
function save() {
  const fields = { ...form, username: form.accounts[0]?.username ?? '', password: form.accounts[0]?.password ?? '' }
  void run(() => sharedRequest(editingId.value ? `${base.value}/${editingId.value}` : base.value, { method: editingId.value ? 'PUT' : 'POST', body: { fields, ...(editingId.value ? { revision: editingRevision.value } : {}) } }))
}
function choose(choice: ProjectPasswordChoice) { void run(() => sharedRequest(base.value, { method: 'POST', body: { source: choice.source } })) }
function remove() { const row = deleting.value; if (row) void run(() => sharedRequest(`${base.value}/${row.id}`, { method: 'DELETE', body: { revision: row.revision } })) }
async function copy(value: string, trigger?: HTMLElement) { try { await copyText(value, trigger); toast.add({ title: 'Скопировано', color: 'success' }) } catch { toast.add({ title: 'Не удалось скопировать', color: 'error' }) } }
watch(() => auth.user?.id, () => { activeId.value = ''; picker.value = false; editor.value = false; deleting.value = null; Object.assign(form, { title: '', url: '', notes: '', accounts: [] }) })
</script>
<template>
  <section class="project-passwords">
    <p class="passwords-intro">Пароли, используемые в проекте, доступны всем его участникам. Каждый участник может добавить пароль; изменять и удалять его может автор или создатель проекта.</p>
    <div class="passwords-toolbar"><UButton label="Выбрать из хранилища" icon="i-lucide-vault" @click="error='';choiceSearch='';picker=true"/><UButton label="Добавить пароль" icon="i-lucide-key-round" color="neutral" variant="outline" @click="edit()"/><UInput v-model="search" icon="i-lucide-search" placeholder="Поиск паролей проекта" aria-label="Поиск паролей проекта"/><UButton icon="i-lucide-refresh-cw" aria-label="Обновить пароли" color="neutral" variant="ghost" :loading="passwords.isFetching.value" @click="passwords.refetch()"/></div>
    <UAlert v-if="error&&!picker&&!editor&&!deleting" color="error" :description="error"/>
    <UAlert v-if="passwords.error.value" color="error" title="Не удалось загрузить пароли" :actions="[{label:'Повторить',onClick:()=>passwords.refetch()}]"/>
    <p v-else-if="passwords.isPending.value" class="passwords-intro">Загружаем пароли…</p>
    <div v-else-if="rows.length" class="passwords-list">
      <article v-for="row in rows" :key="row.id" class="password-row"><button class="password-main" @click="activeId=row.id"><UIcon name="i-lucide-key-round"/><span><strong>{{row.entry.title}}</strong><small>{{row.entry.username||row.entry.url||'Открыть пароль'}}</small></span></button><span class="password-author">{{project.members.find(member=>member.userId===row.createdBy)?.fullName||'Участник проекта'}}</span><UButton label="Открыть" color="neutral" variant="ghost" @click="activeId=row.id"/><UDropdownMenu v-if="row.canEdit" :items="[{label:'Изменить',icon:'i-lucide-pencil',onSelect:()=>edit(row)},{label:'Удалить из проекта',icon:'i-lucide-trash-2',color:'error',onSelect:()=>{error='';deleting=row}}]"><UButton icon="i-lucide-ellipsis" :aria-label="`Действия: ${row.entry.title}`" color="neutral" variant="ghost" :disabled="busy"/></UDropdownMenu></article>
    </div>
    <div v-else class="passwords-empty"><UIcon name="i-lucide-key-round"/><h2>{{search?'Пароли не найдены':'В проекте пока нет паролей'}}</h2><p>Выберите используемый пароль из хранилища или добавьте новый.</p></div>
    <UModal v-model:open="picker" title="Выбрать пароль из хранилища" description="В проект будет добавлена отдельная копия, доступная всем участникам. Изменения исходной карточки не синхронизируются с копией." :dismissible="!busy"><template #body><div class="password-picker"><UInput v-model="choiceSearch" icon="i-lucide-search" placeholder="Название, логин или хранилище" aria-label="Поиск в хранилищах"/><UAlert v-if="error" color="error" :description="error"/><UAlert v-if="choices.error.value" color="error" title="Не удалось загрузить хранилища" :actions="[{label:'Повторить',onClick:()=>choices.refetch()}]"/><p v-else-if="choices.isPending.value">Загружаем доступные пароли…</p><template v-else><button v-for="choice in options" :key="`${choice.source.kind}:${choice.source.sourceId}:${choice.source.entryId}`" class="password-choice" :disabled="busy" @click="choose(choice)"><span><strong>{{choice.title}}</strong><small>{{choice.sourceName}}<template v-if="choice.username"> · {{choice.username}}</template></small></span><UIcon name="i-lucide-plus"/></button><p v-if="!options.length">Доступных паролей по этому запросу нет.</p></template></div></template></UModal>
    <UModal v-model:open="editor" :title="editingId?'Изменить пароль проекта':'Добавить пароль в проект'" description="Сохранённые данные будут доступны всем участникам проекта." :dismissible="!busy"><template #body><form class="password-form" @submit.prevent="save"><UFormField label="Название" required><UInput v-model="form.title" class="w-full" required :maxlength="120"/></UFormField><UFormField label="Сайт или адрес сервиса"><UInput v-model="form.url" class="w-full" :maxlength="2000"/></UFormField><CredentialAccountEditor v-for="account in form.accounts" :key="account.id" :account="account" @remove="form.accounts=form.accounts.filter(item=>item.id!==account.id)"/><UButton v-if="form.accounts.length<30" type="button" label="Добавить ещё один доступ" icon="i-lucide-plus" color="neutral" variant="outline" @click="addAccount"/><UFormField label="Заметка"><UTextarea v-model="form.notes" class="w-full" :maxlength="10000"/></UFormField><UAlert v-if="error" color="error" :description="error"/><UButton type="submit" label="Сохранить" :loading="busy" :disabled="!form.title.trim()"/></form></template></UModal>
    <UModal :open="!!deleting" title="Удалить пароль из проекта?" :description="deleting?.entry.title" :dismissible="!busy" @update:open="value=>{if(!value)deleting=null}"><template #body><p>Пароль будет удалён из проекта для всех участников. Исходная карточка в хранилище сохранится.</p><UAlert v-if="error" color="error" :description="error"/></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="busy" @click="deleting=null"/><UButton label="Удалить из проекта" color="error" :loading="busy" @click="remove"/></template></UModal>
    <CredentialDetails :entry="detail" :open="!!active" :categories="[]" :links="[]" :busy="busy" :readonly="!active?.canEdit" @close="activeId=''" @edit="active&&edit(active)" @copy="copy"/>
  </section>
</template>
<style scoped>
.project-passwords,.password-picker,.password-form{display:grid;gap:20px}.passwords-intro{font-size:13px;line-height:1.8;color:#8292a8}.passwords-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.passwords-toolbar>:nth-last-child(2){flex:1;min-width:220px}.passwords-list{background:#fff;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden}.password-row{display:flex;align-items:center;gap:16px;padding:20px 24px}.password-row+.password-row{border-top:1px solid #e8edf3}.password-main{display:flex;align-items:center;gap:16px;flex:1;min-width:0;text-align:left}.password-main>.iconify{font-size:28px;flex-shrink:0;color:#8292a8}.password-main>span,.password-choice>span{display:grid;gap:8px;min-width:0}.password-main strong,.password-choice strong{font-size:14px;color:#475569;overflow-wrap:anywhere}.password-main small,.password-choice small,.password-author{font-size:12px;color:#8292a8;overflow-wrap:anywhere}.passwords-empty{padding:50px 20px;text-align:center;border:1px dashed #dce2ea;border-radius:20px;color:#8292a8}.passwords-empty>.iconify{font-size:36px}.passwords-empty h2{font-size:20px;margin:16px 0 10px;color:#475569}.passwords-empty p{font-size:13px;line-height:1.7}.password-choice{display:flex;justify-content:space-between;align-items:center;gap:12px;text-align:left;padding:16px;border:1px solid #e2e8f0;border-radius:12px}.password-choice:hover{background:#f8fafc}.password-choice:disabled{opacity:.6}.password-picker{max-height:60vh;overflow:auto}.password-main:focus-visible,.password-choice:focus-visible{outline:2px solid #6366f1;outline-offset:2px}@media(max-width:650px){.password-row{padding:16px 12px;gap:10px;flex-wrap:wrap}.password-author{display:none}.password-main{flex-basis:60%}}
</style>
