<script setup lang="ts">
import type { DirectoryCompany } from '~~/shared/types/project-companies'
import ProjectCompanyFields from './ProjectCompanyFields.vue'
import { companyInputSchema, newCompanyDraft } from '~~/shared/utils/project-companies'
const props=defineProps<{ownOnly:boolean}>(),route=useRoute()
const {query,refresh}=useProjectCompanies(),auth=useAuthStore(),supabase=useNuxtApp().$supabase
const openedFromRoute=ref('')
const search=ref(''),open=ref(false),busy=ref(false),error=ref(''),exporting=ref('')
const selected=ref<DirectoryCompany|null>(null)
const fresh=()=>newCompanyDraft('',props.ownOnly)
const draft=ref(fresh()),readonly=computed(()=>!!selected.value&&!selected.value.canEdit)
const projectFilter=ref<string[]>([]),ownership=ref('all'),usage=ref('all'),sort=ref('name')
const scopeRows=computed(()=>query.data.value?.filter(row=>row.isOwnLegalEntity===props.ownOnly)??[])
const projectOptions=computed(()=>{const projects=new Map<string,string>();for(const row of scopeRows.value)for(const project of row.projects??[])projects.set(project.id,project.name);return [...projects].map(([value,label])=>({value,label})).sort((a,b)=>a.label.localeCompare(b.label,'ru'))})
const rows=computed(()=>scopeRows.value.filter(row=>{
 const text=[row.company,row.inn,row.director,...(row.projects??[]).map(project=>project.name)].join(' ').toLocaleLowerCase('ru').replace(/ё/g,'е')
 if(!search.value.trim().toLocaleLowerCase('ru').replace(/ё/g,'е').split(/\s+/).every(term=>text.includes(term)))return false
 if(ownership.value==='mine'&&!row.canEdit||ownership.value==='others'&&row.canEdit)return false
 if(usage.value==='used'&&!row.projectCount||usage.value==='unused'&&!!row.projectCount)return false
 return !projectFilter.value.length||(row.projects??[]).some(project=>projectFilter.value.includes(project.id))
}).sort((a,b)=>{
 let result=0
 if(sort.value==='projects')result=b.projectCount-a.projectCount
 else if(sort.value==='updated')result=Date.parse(b.updatedAt??'1970-01-01')-Date.parse(a.updatedAt??'1970-01-01')
 else if(sort.value==='inn')result=!a.inn||!b.inn?Number(!!b.inn)-Number(!!a.inn):a.inn.localeCompare(b.inn,'ru',{numeric:true})
 else result=a.company.localeCompare(b.company,'ru',{numeric:true})*(sort.value==='name-desc'?-1:1)
 return result||a.company.localeCompare(b.company,'ru',{numeric:true})||a.id.localeCompare(b.id)
}))
const hasFilters=computed(()=>!!search.value.trim()||projectFilter.value.length>0||ownership.value!=='all'||usage.value!=='all')
const sortOptions=[{value:'name',label:'По названию А–Я'},{value:'name-desc',label:'По названию Я–А'},{value:'projects',label:'По количеству проектов ↓'},{value:'updated',label:'Сначала обновлённые'},{value:'inn',label:'По ИНН'}]
function resetFilters(){search.value='';projectFilter.value=[];ownership.value='all';usage.value='all';sort.value='name'}

function show(row?:DirectoryCompany){selected.value=row??null;draft.value=row?{company:row.company,inn:row.inn,kpp:row.kpp,director:row.director,address:row.address,bankAccount:row.bankAccount,isOwnLegalEntity:row.isOwnLegalEntity}:fresh();error.value='';open.value=true}
watch(()=>props.ownOnly,()=>{resetFilters();open.value=false})
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
 try{const{data}=await supabase.auth.getSession();if(!data.session||data.session.user.id!==userId)throw Error('Войдите в аккаунт');const blob=await backendFetch<Blob, 'blob'>('/api/projects/companies/export',{method:'POST',retry:0,responseType:'blob',headers:{Authorization:`Bearer ${data.session.access_token}`},body:{format,isOwnLegalEntity:props.ownOnly}});if(auth.user?.id!==userId)return;const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${props.ownOnly?'Наши юр. лица':'Контрагенты'}.${format}`;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),10000)}
 catch(failure:any){if(failure?.data instanceof Blob){try{error.value=JSON.parse(await failure.data.text()).message}catch{error.value='Не удалось скачать файл'}}else error.value=failure?.data?.message||failure.message}
 finally{exporting.value=''}
}
</script>
<template>
 <section class="company-directory" :aria-label="ownOnly?'База наших юридических лиц':'Общая база контрагентов'">
  <div class="company-toolbar"><UInput v-model="search" icon="i-lucide-search" placeholder="Компания, ИНН, директор или проект" aria-label="Поиск компании" class="company-search"/><UButton label="Excel" icon="i-lucide-file-spreadsheet" color="neutral" variant="outline" :disabled="!!exporting||query.isPending.value||!!query.error.value" :loading="exporting==='xlsx'" @click="download('xlsx')"/><UButton label="PDF" icon="i-lucide-file-text" color="neutral" variant="outline" :disabled="!!exporting||query.isPending.value||!!query.error.value" :loading="exporting==='pdf'" @click="download('pdf')"/><UButton :label="ownOnly?'Добавить юр. лицо':'Добавить контрагента'" icon="i-lucide-plus" @click="show()"/></div>
  <div class="company-filterbar"><USelectMenu v-model="projectFilter" :items="projectOptions" value-key="value" multiple placeholder="Любые проекты" aria-label="Фильтр компаний по проектам" class="company-project-filter"/><USelect v-model="ownership" :items="[{value:'all',label:'Все авторы'},{value:'mine',label:'Добавлены мной'},{value:'others',label:'Добавлены другими'}]" aria-label="Автор компании"/><USelect v-model="usage" :items="[{value:'all',label:'Любые связи'},{value:'used',label:'Есть проекты'},{value:'unused',label:'Без проектов'}]" aria-label="Использование компании в проектах"/><USelect v-model="sort" :items="sortOptions" aria-label="Сортировка компаний"/></div>
  <div class="company-results" role="status"><span>Найдено {{rows.length}} из {{scopeRows.length}}</span><UButton v-if="hasFilters" label="Сбросить фильтры" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="resetFilters"/></div>
  <UAlert v-if="error&&!open" color="error" :description="error" class="mb-5"/>
  <p v-if="query.isPending.value" class="company-muted">Загружаем общую базу…</p><UAlert v-else-if="query.error.value" title="Не удалось загрузить компании" color="error" :actions="[{label:'Повторить',onClick:()=>query.refetch()}]"/>
  <div v-else-if="rows.length" class="company-grid">
   <article v-for="row in rows" :key="row.id" class="company-card">
    <button type="button" class="company-card-main" :aria-label="`Открыть реквизиты ${row.company}`" @click="show(row)"><span class="company-card-header"><span class="company-icon"><UIcon :name="row.isOwnLegalEntity?'i-lucide-landmark':'i-lucide-building-2'"/></span><span class="company-own">{{row.canEdit?'Добавлена вами':'Общая база'}}</span></span><strong>{{row.company}}</strong><small>{{row.inn?'ИНН '+row.inn:'ИНН не указан'}}</small><small v-if="row.director">{{row.director}}</small><span class="company-detail-link">{{row.canEdit?'Реквизиты и настройки':'Реквизиты'}}<UIcon name="i-lucide-arrow-up-right"/></span></button>
    <div class="company-project-links"><h3>Проекты <span>{{row.projectCount}}</span></h3><div v-if="row.projects?.length"><NuxtLink v-for="project in row.projects.slice(0,3)" :key="project.id" :to="`/projects/${project.id}`"><UIcon name="i-lucide-folder-kanban"/><span>{{project.name}}</span><UIcon name="i-lucide-arrow-up-right"/></NuxtLink><UButton v-if="row.projects.length>3" :label="`Ещё ${row.projects.length-3}`" color="neutral" variant="ghost" size="xs" @click="show(row)"/></div><p v-else>{{row.projectCount?'Нет доступных вам проектов':'Пока не подключена к проектам'}}</p></div>
   </article>
  </div>
  <div v-else class="company-empty"><UIcon name="i-lucide-building-2"/><h2>{{hasFilters?'Компании не найдены':ownOnly?'Добавьте наши юридические лица':'Добавьте первого контрагента'}}</h2><p>{{hasFilters?'Измените поисковый запрос или сбросьте фильтры.':'Компании из общей базы можно выбирать в любом из ваших проектов.'}}</p><UButton v-if="hasFilters" label="Сбросить фильтры" color="neutral" variant="outline" class="mt-5" @click="resetFilters"/></div>
 </section>
 <UModal v-model:open="open" :title="selected?selected.company:ownOnly?'Добавить юр. лицо':'Добавить контрагента'" :description="readonly?'Реквизиты доступны на просмотр.':selected?'Изменения реквизитов применятся во всех связанных проектах.':'Компания появится в общей базе и будет доступна для выбора в проектах.'" :dismissible="!busy" :ui="{content:'sm:max-w-2xl'}"><template #body><form id="directory-company-form" class="company-form" @submit.prevent="submit()"><ProjectCompanyFields v-model="draft" :disabled="busy||readonly"/><div v-if="selected?.projects?.length" class="company-project-links company-modal-projects"><h3>Используется в проектах</h3><div><NuxtLink v-for="project in selected.projects" :key="project.id" :to="`/projects/${project.id}`"><UIcon name="i-lucide-folder-kanban"/><span>{{project.name}}</span><UIcon name="i-lucide-arrow-up-right"/></NuxtLink></div></div><p v-if="selected?.projectCount" class="company-muted">Используется в проектах: {{selected.projectCount}}. Удаление доступно после отключения от проектов.</p><UAlert v-if="error" color="error" :description="error"/></form></template><template #footer><div class="company-actions"><UButton v-if="selected?.canEdit" label="Удалить" color="error" variant="ghost" :disabled="busy||!!selected.projectCount" @click="submit(true)"/><UButton label="Закрыть" color="neutral" variant="outline" :disabled="busy" @click="open=false"/><UButton v-if="!readonly" label="Сохранить" type="submit" form="directory-company-form" :loading="busy"/></div></template></UModal>
</template>
<style scoped>
.company-toolbar{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:28px 0}.company-search{flex:1;min-width:220px}.company-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px}.company-card{position:relative;display:flex;flex-direction:column;min-width:0;border-radius:24px;border:1px solid #ffffffed;background:linear-gradient(135deg,#ffffffdb,#ffffff6b 65%,#eaf0f680);box-shadow:0 12px 34px #33415508,inset 0 1px #fff,inset 0 -1px #94a3b826;backdrop-filter:blur(24px) saturate(150%);overflow:hidden;transition:box-shadow .2s,transform .2s}.company-card:hover{transform:translateY(-2px);box-shadow:0 16px 38px #33415512}.company-card-main{display:flex;flex-direction:column;gap:12px;padding:26px;width:100%;text-align:left;min-width:0;flex:1}.company-card-main:focus-visible{outline-offset:-4px;border-radius:24px}.company-card-header{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;margin-bottom:6px}.company-icon{width:46px;height:46px;display:grid;place-items:center;flex-shrink:0;border:1px solid #ffffffed;border-radius:14px;background:linear-gradient(135deg,#ffffffdb,#e8eaf28c);color:var(--ui-primary);font-size:24px}.company-card strong{font-size:20px;font-weight:650;line-height:1.5;color:#334155;overflow-wrap:anywhere;max-width:100%}.company-card small{font-size:12px;color:#94a3b8;overflow-wrap:anywhere;max-width:100%}.company-own{font-size:10px;color:#8292a8;background:#ffffff80;border:1px solid #ffffffc9;border-radius:8px;padding:6px 9px}.company-detail-link{display:flex;align-items:center;gap:7px;color:var(--ui-primary);font-size:11px;margin-top:auto;padding-top:8px}.company-project-links{padding:18px 26px 24px;border-top:1px solid #dce4ec80}.company-project-links h3{font-size:11px;font-weight:600;color:#8292a8;margin-bottom:12px;display:flex;align-items:center;gap:8px}.company-project-links h3>span{font-variant-numeric:tabular-nums;font-weight:400;padding:2px 6px;border-radius:5px;background:#ffffff80}.company-project-links>div{display:flex;flex-wrap:wrap;gap:8px}.company-project-links a{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:7px 9px;font-size:11px;line-height:1.5;color:#64748b;background:#ffffff80;border:1px solid #ffffffb3;border-radius:8px;transition:background .15s,color .15s}.company-project-links a:hover{background:#fff;color:var(--ui-primary)}.company-project-links a>.iconify{width:14px;height:14px;flex:0 0 14px}.company-project-links a>span:not(.iconify){min-width:0;overflow-wrap:anywhere}.company-project-links>p{font-size:11px;color:#94a3b8;line-height:1.7}.company-modal-projects{grid-column:1/-1;padding:20px 0 0}.company-modal-projects a{border-color:#e2e8f0;background:#f8fafc}.company-filterbar{display:flex;flex-wrap:wrap;gap:12px;padding:18px;border:1px solid #e2e8f0aa;border-radius:16px;background:#ffffff73}.company-filterbar>*{flex:1;min-width:170px}.company-filterbar>.company-project-filter{flex:1.5;min-width:220px}.company-results{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:62px;font-size:12px;color:#8292a8}.company-empty{text-align:center;padding:70px 20px;border:1px solid #e2e8f0;border-radius:22px;background:#fff8}.company-empty>.iconify{font-size:35px;color:var(--ui-primary)}.company-empty h2{font-size:21px;font-weight:600;color:#475569;margin:20px 0 12px}.company-empty p,.company-muted{font-size:13px;color:#94a3b8;line-height:1.7}.company-form{display:grid;grid-template-columns:1fr 1fr;gap:20px}.company-form label{display:flex;flex-direction:column;gap:8px;font-size:13px;color:#475569}.company-form label:first-child,.company-form label:nth-child(5),.company-form .company-check,.company-form>p,.company-form>[role=alert]{grid-column:1/-1}.company-form input:not([type=checkbox]){padding:10px 12px;border-radius:8px;border:1px solid #cbd5e1;background:white;min-width:0;width:100%;outline-color:var(--ui-primary)}.company-form .company-check{flex-direction:row;align-items:center;gap:10px}.company-check input{accent-color:var(--ui-primary)}.company-actions{display:flex;gap:12px;justify-content:flex-end;flex-wrap:wrap;width:100%}@media(max-width:600px){.company-grid{grid-template-columns:1fr}.company-form{grid-template-columns:1fr}.company-card-main{padding:22px}.company-project-links{padding:18px 22px 22px}.company-filterbar>*{flex-basis:100%;min-width:100%}.company-search{flex-basis:100%}}
@media(prefers-reduced-motion:reduce){.company-card{transition:none}.company-card:hover{transform:none}}
</style>
