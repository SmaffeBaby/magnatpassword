<script setup lang="ts">
import type { DirectoryCompany } from '~~/shared/types/project-companies'
import { companyInputSchema } from '~~/shared/utils/project-companies'
const props=defineProps<{ownOnly:boolean}>(),route=useRoute()
const {query,refresh}=useProjectCompanies(),auth=useAuthStore(),supabase=useNuxtApp().$supabase
const openedFromRoute=ref('')
const search=ref(''),open=ref(false),busy=ref(false),error=ref(''),exporting=ref('')
const selected=ref<DirectoryCompany|null>(null)
const fresh=()=>({company:'',inn:'',kpp:'',director:'',address:'',bankAccount:'',isOwnLegalEntity:props.ownOnly})
const draft=ref(fresh()),readonly=computed(()=>!!selected.value&&!selected.value.canEdit)
const rows=computed(()=>query.data.value?.filter(row=>row.isOwnLegalEntity===props.ownOnly&&`${row.company} ${row.inn} ${row.director}`.toLocaleLowerCase('ru').includes(search.value.toLocaleLowerCase('ru').trim()))??[])
const fields=[{key:'company',label:'Компания',max:160},{key:'inn',label:'ИНН',max:12},{key:'kpp',label:'КПП',max:9},{key:'director',label:'Директор',max:160},{key:'address',label:'Адрес',max:500},{key:'bankAccount',label:'Р/с',max:20}] as const
function show(row?:DirectoryCompany){selected.value=row??null;draft.value=row?{company:row.company,inn:row.inn,kpp:row.kpp,director:row.director,address:row.address,bankAccount:row.bankAccount,isOwnLegalEntity:row.isOwnLegalEntity}:fresh();error.value='';open.value=true}
watch(()=>props.ownOnly,()=>{search.value='';open.value=false})
watch([()=>route.query.company,()=>query.data.value],()=>{const id=String(route.query.company??'');const row=query.data.value?.find(row=>row.id===id);if(!id)openedFromRoute.value='';else if(row&&openedFromRoute.value!==id){openedFromRoute.value=id;show(row)}},{immediate:true})
async function submit(remove=false){
 if(busy.value||readonly.value)return
 const parsed=companyInputSchema.safeParse(draft.value);error.value=''
 if(!remove&&!parsed.success){error.value=parsed.error.issues[0]?.message||'Проверьте реквизиты';return}
 busy.value=true;const userId=auth.user?.id
 try{
  if(selected.value)await sharedRequest(`/api/projects/companies/${selected.value.id}`,{method:remove?'DELETE':'PUT',body:remove?{revision:selected.value.revision}:{...parsed.data,revision:selected.value.revision}})
  else await sharedRequest('/api/projects/companies',{method:'POST',body:parsed.data})
  if(auth.user?.id!==userId)return
  open.value=false
  await navigateTo({path:'/projects',query:{tab:draft.value.isOwnLegalEntity?'legal-entities':'counterparties'}},{replace:true})
  await refresh()
 }catch(failure:any){error.value=failure?.data?.message||failure.message;if(failure?.statusCode===409)await query.refetch()}
 finally{busy.value=false}
}
async function download(format:'xlsx'|'pdf'){
 if(exporting.value)return;exporting.value=format;error.value='';const userId=auth.user?.id
 try{const{data}=await supabase.auth.getSession();if(!data.session||data.session.user.id!==userId)throw Error('Войдите в аккаунт');const blob=await $fetch<Blob>('/api/projects/companies/export',{method:'POST',retry:0,responseType:'blob',headers:{Authorization:`Bearer ${data.session.access_token}`},body:{format,isOwnLegalEntity:props.ownOnly}});if(auth.user?.id!==userId)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${props.ownOnly?'Наши юр. лица':'Контрагенты'}.${format}`;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),10000)}
 catch(failure:any){if(failure?.data instanceof Blob){try{error.value=JSON.parse(await failure.data.text()).message}catch{error.value='Не удалось скачать файл'}}else error.value=failure?.data?.message||failure.message}
 finally{exporting.value=''}
}
</script>
<template>
 <section class="company-directory" :aria-label="ownOnly?'База наших юридических лиц':'Общая база контрагентов'">
  <div class="company-toolbar"><UInput v-model="search" icon="i-lucide-search" placeholder="Компания, ИНН или директор" aria-label="Поиск компании" class="company-search"/><UButton label="Excel" icon="i-lucide-file-spreadsheet" color="neutral" variant="outline" :disabled="!!exporting||query.isPending.value||!!query.error.value" :loading="exporting==='xlsx'" @click="download('xlsx')"/><UButton label="PDF" icon="i-lucide-file-text" color="neutral" variant="outline" :disabled="!!exporting||query.isPending.value||!!query.error.value" :loading="exporting==='pdf'" @click="download('pdf')"/><UButton :label="ownOnly?'Добавить юр. лицо':'Добавить контрагента'" icon="i-lucide-plus" @click="show()"/></div>
  <UAlert v-if="error&&!open" color="error" :description="error" class="mb-5"/>
  <p v-if="query.isPending.value" class="company-muted">Загружаем общую базу…</p><UAlert v-else-if="query.error.value" title="Не удалось загрузить компании" color="error" :actions="[{label:'Повторить',onClick:()=>query.refetch()}]"/>
  <div v-else-if="rows.length" class="company-grid"><button v-for="row in rows" :key="row.id" type="button" class="company-card" @click="show(row)"><span class="company-icon"><UIcon :name="row.isOwnLegalEntity?'i-lucide-landmark':'i-lucide-building-2'"/></span><span v-if="row.isOwnLegalEntity" class="company-own">Наше юр. лицо</span><strong>{{row.company}}</strong><small v-if="row.inn">ИНН {{row.inn}}</small><small v-if="row.director">{{row.director}}</small><span class="company-footer"><span>В проектах: {{row.projectCount}}</span><span>{{row.canEdit?'Реквизиты и настройки':'Реквизиты'}} →</span></span></button></div>
  <div v-else class="company-empty"><UIcon name="i-lucide-building-2"/><h2>{{search?'Компании не найдены':ownOnly?'Добавьте наши юридические лица':'Добавьте первого контрагента'}}</h2><p>{{search?'Измените поисковый запрос.':'Компании из общей базы можно выбирать в любом из ваших проектов.'}}</p></div>
 </section>
 <UModal v-model:open="open" :title="selected?selected.company:ownOnly?'Добавить юр. лицо':'Добавить контрагента'" :description="readonly?'Реквизиты доступны на просмотр.':selected?'Изменения реквизитов применятся во всех связанных проектах.':'Компания появится в общей базе и будет доступна для выбора в проектах.'" :dismissible="!busy" :ui="{content:'sm:max-w-2xl'}"><template #body><form id="directory-company-form" class="company-form" @submit.prevent="submit()"><label v-for="field in fields" :key="field.key">{{field.label}}<input v-model="draft[field.key]" :maxlength="field.max" :required="field.key==='company'" :disabled="busy||readonly" :inputmode="['inn','kpp','bankAccount'].includes(field.key)?'numeric':'text'"/></label><label class="company-check"><input v-model="draft.isOwnLegalEntity" type="checkbox" :disabled="busy||readonly"/>Наше юридическое лицо</label><p v-if="selected?.projectCount" class="company-muted">Используется в проектах: {{selected.projectCount}}. Удаление доступно после отключения от проектов.</p><UAlert v-if="error" color="error" :description="error"/></form></template><template #footer><div class="company-actions"><UButton v-if="selected?.canEdit" label="Удалить" color="error" variant="ghost" :disabled="busy||!!selected.projectCount" @click="submit(true)"/><UButton label="Закрыть" color="neutral" variant="outline" :disabled="busy" @click="open=false"/><UButton v-if="!readonly" label="Сохранить" type="submit" form="directory-company-form" :loading="busy"/></div></template></UModal>
</template>
<style scoped>
.company-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:28px 0}.company-search{flex:1;min-width:220px}.company-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px}.company-card{position:relative;display:flex;align-items:flex-start;flex-direction:column;gap:14px;text-align:left;min-width:0;padding:30px;border-radius:24px;border:1px solid #e2e8f0;background:white;cursor:pointer}.company-card:hover{border-color:var(--ui-primary)}.company-icon{width:56px;height:56px;display:grid;place-items:center;border-radius:16px;background:#f3f4f8;color:var(--ui-primary);font-size:25px;margin-bottom:12px}.company-card strong{font-size:21px;color:#334155;overflow-wrap:anywhere}.company-card small{font-size:13px;color:#94a3b8;overflow-wrap:anywhere}.company-own{font-size:11px;color:var(--ui-primary);background:#f3f4f8;border-radius:8px;padding:6px 9px}.company-footer{width:100%;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12px;color:#64748b;margin-top:24px}.company-footer>span:last-child{color:var(--ui-primary)}.company-empty{text-align:center;padding:70px 20px;border:1px solid #e2e8f0;border-radius:22px;background:#fff8}.company-empty>.iconify{font-size:35px;color:var(--ui-primary)}.company-empty h2{font-size:21px;font-weight:600;color:#475569;margin:20px 0 12px}.company-empty p,.company-muted{font-size:13px;color:#94a3b8;line-height:1.7}.company-form{display:grid;grid-template-columns:1fr 1fr;gap:20px}.company-form label{display:flex;flex-direction:column;gap:8px;font-size:13px;color:#475569}.company-form label:first-child,.company-form label:nth-child(5),.company-form .company-check,.company-form>p,.company-form>[role=alert]{grid-column:1/-1}.company-form input:not([type=checkbox]){padding:10px 12px;border-radius:8px;border:1px solid #cbd5e1;background:white;min-width:0;width:100%;outline-color:var(--ui-primary)}.company-form .company-check{flex-direction:row;align-items:center;gap:10px}.company-check input{accent-color:var(--ui-primary)}.company-actions{display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;width:100%}@media(max-width:600px){.company-grid{grid-template-columns:1fr}.company-form{grid-template-columns:1fr}.company-card{padding:24px}.company-search{flex-basis:100%}}
</style>
