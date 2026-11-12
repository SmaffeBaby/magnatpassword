<script setup lang="ts">
import type { RegisterContract,RegisterContractDetail,RegisterFile } from '~~/shared/types/contract-register'
import type { ContractField } from '~~/shared/types/contract-fields'
import { standaloneContractSchema } from '~~/shared/utils/contract-register'
import { saveFile } from '~/utils/file-download'
import ContractDeadlineField from './ContractDeadlineField.vue'
import ContractExtraFields from './ContractExtraFields.vue'
import ProjectCompanyPicker from './ProjectCompanyPicker.vue'
const props=defineProps<{contract:RegisterContract|null}>(),emit=defineEmits<{close:[];changed:[]}>(),auth=useAuthStore()
const formId=useId(),record=ref(props.contract),id=ref(props.contract?.id||''),revision=ref(props.contract?.revision||0),ready=ref(!props.contract),loading=ref(!!props.contract),busy=ref(false),error=ref(''),status=ref('')
const fields=ref<ContractField[]>([]),files=ref<RegisterFile[]>([]),pending=ref<{id:string;file:File;kind:'contract'|'supplement'}[]>([])
const deleteOpen=ref(false),toast=useToast()
const groups=[{kind:'supplement' as const,title:'Файлы доп. соглашения'},{kind:'contract' as const,title:'Файлы договора'}]
const form=reactive({noDeadline:false,autoRenew:false,code:'',number:'',seller:'',buyer:'',date:'',deadline:'',amount:'',vatAmount:'',notes:''})
const canEdit=computed(()=>ready.value&&(!record.value||record.value.canEdit)),controller=new AbortController()
const {query:catalog}=useProjectCompanies()
const partyIds=reactive({seller:'',buyer:''})
const companyOptions=computed(()=>(catalog.data.value||[]).map(company=>({value:company.id,label:company.company+(company.isOwnLegalEntity?' · Наше юр. лицо':' · Контрагент'),inn:company.inn,description:company.inn?'ИНН '+company.inn:''})))
function partyOptions(role:'seller'|'buyer'){
 const options=[...companyOptions.value]
 if(form[role]&&!partyIds[role])options.unshift({value:'legacy:'+role,label:form[role],inn:'',description:'Сохранённое название'})
 if(partyIds[role]&&!options.some(row=>row.value===partyIds[role]))options.unshift({value:partyIds[role],label:form[role],inn:'',description:'Сохранённая компания'})
 return options
}
async function chooseParty(catalogId:string,role:'seller'|'buyer'){
 if(!active||busy.value||!canEdit.value)return false
 const actor=auth.user?.id
 let company=catalog.data.value?.find(row=>row.id===catalogId)
 if(!company){const result=await catalog.refetch();company=result.data?.find(row=>row.id===catalogId)}
 if(!active||actor!==auth.user?.id||busy.value||!company)return false
 partyIds[role]=company.id;form[role]=company.company;return true
}
let active=true
onBeforeUnmount(()=>{active=false;controller.abort()})
function apply(row:RegisterContract){record.value=row;id.value=row.id;revision.value=row.revision;Object.assign(form,{noDeadline:!!row.noDeadline,autoRenew:!!row.autoRenew,code:row.code,number:row.number,seller:row.seller,buyer:row.buyer,date:row.date,deadline:row.deadline,amount:row.amount===null?'':String(row.amount),vatAmount:row.vatAmount===null?'':String(row.vatAmount),notes:row.notes});partyIds.seller=row.sellerCatalogId||'';partyIds.buyer=row.buyerCatalogId||'';fields.value=structuredClone(row.fields||[])}
function choose(event:Event,kind:'contract'|'supplement'){const input=event.target as HTMLInputElement,selected=Array.from(input.files||[]);input.value='';error.value='';if(selected.some(f=>!f.size||f.size>20*1024*1024)||files.value.length+pending.value.length+selected.length>20){error.value='Выберите до 20 непустых файлов, каждый до 20 МБ.';return}pending.value.push(...selected.map(file=>({id:crypto.randomUUID(),file,kind})))}
const base=()=>`/api/contract-register/${record.value?.origin||'standalone'}/${id.value}`
onMounted(async()=>{if(!props.contract)return;try{const result=await sharedRequest<RegisterContractDetail>(base(),{signal:controller.signal});if(!active)return;apply(result.contract);files.value=result.files;ready.value=true}catch(e:any){if(active)error.value=e?.data?.message||'Не удалось загрузить договор.'}finally{if(active)loading.value=false}})
async function save(){
 if(!canEdit.value||busy.value)return
 const parsed=standaloneContractSchema.safeParse({...form,...(partyIds.seller?{sellerCatalogId:partyIds.seller}:{}),...(partyIds.buyer?{buyerCatalogId:partyIds.buyer}:{}),amount:String(form.amount).trim()?Number(form.amount):null,vatAmount:String(form.vatAmount).trim()?Number(form.vatAmount):null,fields:fields.value})
 if(!parsed.success){error.value=parsed.error.issues[0]?.message||'Проверьте поля договора.';return}
 const actor=auth.user?.id;busy.value=true;error.value=''
 try{
  const saved=await sharedRequest<{id:string;revision:number}>(`/api/contract-register${id.value?'/standalone/'+id.value:''}`,{method:id.value?'PUT':'POST',signal:controller.signal,body:{...parsed.data,...(id.value?{revision:revision.value}:{})}})
  if(!active||auth.user?.id!==actor)return
  id.value=saved.id;revision.value=saved.revision;emit('changed')
  while(pending.value.length){const item=pending.value[0]!,body=new FormData();body.append('file',item.file);body.append('fileId',item.id);body.append('kind',item.kind);status.value=`Загружаем ${item.file.name}…`;const uploaded=await sharedRequest<{file:RegisterFile;revision:number}>(`${base()}/files`,{method:'POST',signal:controller.signal,body});if(!active||auth.user?.id!==actor)return;revision.value=uploaded.revision;files.value.push({...uploaded.file,origin:'standalone',contractId:id.value});pending.value.shift()}
  emit('changed');emit('close')
 }catch(e:any){if(active&&auth.user?.id===actor)error.value=e?.data?.message||'Не удалось сохранить договор или загрузить файл. Уже сохранённые данные остаются в реестре.'}
 finally{if(active){busy.value=false;status.value=''}}
}
async function download(file:RegisterFile){if(busy.value)return;const actor=auth.user?.id;busy.value=true;error.value='';try{const blob=await sharedRequest<Blob>(`/api/contract-register/${file.origin}/${file.contractId}/files/${file.id}`,{responseType:'blob',signal:controller.signal});if(active&&auth.user?.id===actor)await saveFile(blob,file.name)}catch(e:any){if(active)error.value=e?.status===404?'Файл больше недоступен.':e?.data?.message||'Не удалось скачать файл.'}finally{if(active)busy.value=false}}
async function exportContract(format:'xlsx'|'pdf'){
 if(busy.value||!id.value||!ready.value)return
 const actor=auth.user?.id;busy.value=true;error.value=''
 try{const blob=await sharedRequest<Blob>(`${base()}/export`,{method:'POST',body:{format},responseType:'blob',signal:controller.signal});if(active&&actor===auth.user?.id)await saveFile(blob,`Договор ${form.number.replace(/[\\/:*?"<>|]/g,'-')}.${format}`)}
 catch(e:any){if(active){error.value='Не удалось выгрузить договор.';if(e?.data instanceof Blob){try{error.value=JSON.parse(await e.data.text()).message||error.value}catch{}}else error.value=e?.data?.message||error.value}}
 finally{if(active)busy.value=false}
}
async function deleteContract(){
 if(!canEdit.value||!id.value||busy.value)return
 const actor=auth.user?.id;busy.value=true;error.value=''
 try{
  const result=await sharedRequest<{ok:boolean;cleanupPending:boolean}>(`${base()}`,{method:'DELETE',body:{revision:revision.value},signal:controller.signal})
  if(active&&actor===auth.user?.id){if(result.cleanupPending)toast.add({title:'Договор удалён',description:'Очистка файлов будет повторена при следующем обновлении реестра.',color:'warning'});deleteOpen.value=false;emit('changed');emit('close')}
 }catch(e:any){if(active&&actor===auth.user?.id){deleteOpen.value=false;error.value=e?.data?.message||'Не удалось удалить договор.'}}
 finally{if(active)busy.value=false}
}
async function remove(file:RegisterFile){if(!canEdit.value||busy.value)return;busy.value=true;error.value='';try{const result=await sharedRequest<{revision:number}>(`${base()}/files/${file.id}`,{method:'DELETE',signal:controller.signal});if(!active)return;revision.value=result.revision;files.value=files.value.filter(f=>f.id!==file.id);emit('changed')}catch(e:any){if(active)error.value=e?.data?.message||'Не удалось удалить файл.'}finally{if(active)busy.value=false}}
const amount=(value:number|null)=>value===null?'—':new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(value)
const size=(bytes:number)=>bytes>=1048576?`${(bytes/1048576).toFixed(1)} МБ`:`${Math.ceil(bytes/1024)} КБ`
</script>
<template>
 <UModal :open="true" :title="contract?`Договор № ${contract.number}`:'Добавить договор в реестр'" description="Реестр доступен пользователям раздела «Проекты». Отдельные договоры редактирует их автор." :dismissible="!busy" :close="!busy" :ui="{content:'sm:max-w-4xl'}" @update:open="value=>{if(!value&&!busy)emit('close')}">
  <template #body><form :id="formId" class="space-y-6" @submit.prevent="save">
   <p v-if="loading" role="status" class="text-sm text-muted">Загружаем договор и файлы…</p>
   <div v-if="canEdit" class="registry-edit-grid grid min-w-0 gap-4 sm:grid-cols-2"><UFormField label="Номер договора" required><UInput v-model="form.number" :maxlength="100" :disabled="busy" class="w-full"/></UFormField><UFormField label="Продавец / исполнитель" required><ProjectCompanyPicker :model-value="partyIds.seller || (form.seller ? 'legacy:seller' : '')" :items="partyOptions('seller')" :connect-created="id=>chooseParty(id,'seller')" @update:model-value="id=>chooseParty(id,'seller')" create-description="Компания появится в общей базе и будет выбрана в договоре." placeholder="Выберите компанию" aria-label="Продавец / исполнитель" :disabled="busy" class="w-full min-w-0" :ui="{base:'min-w-0',value:'truncate'}"/></UFormField><UFormField label="Покупатель / заказчик" required><ProjectCompanyPicker :model-value="partyIds.buyer || (form.buyer ? 'legacy:buyer' : '')" :items="partyOptions('buyer')" :connect-created="id=>chooseParty(id,'buyer')" @update:model-value="id=>chooseParty(id,'buyer')" create-description="Компания появится в общей базе и будет выбрана в договоре." placeholder="Выберите компанию" aria-label="Покупатель / заказчик" :disabled="busy" class="w-full min-w-0" :ui="{base:'min-w-0',value:'truncate'}"/></UFormField><UFormField label="Дата договора"><UInput v-model="form.date" type="date" :disabled="busy" class="w-full"/></UFormField><UFormField label="Срок"><ContractDeadlineField v-model="form.deadline" v-model:no-deadline="form.noDeadline" v-model:auto-renew="form.autoRenew" :disabled="busy"/></UFormField><UFormField label="Сумма с НДС, ₽"><UInput v-model="form.amount" type="number" min="0" step="0.01" :disabled="busy" class="w-full"/></UFormField><UFormField label="НДС, ₽"><UInput v-model="form.vatAmount" type="number" min="0" step="0.01" :disabled="busy" class="w-full"/></UFormField></div>
   <dl v-else-if="record" class="registry-details"><div><dt>Источник</dt><dd>{{record.projectName||'Без проекта'}}</dd></div><div><dt>Номер договора</dt><dd>{{record.number}}</dd></div><div><dt>Продавец / исполнитель</dt><dd>{{record.seller||'—'}}</dd></div><div><dt>Покупатель / заказчик</dt><dd>{{record.buyer||'—'}}</dd></div><div><dt>Дата</dt><dd>{{record.date?record.date.split('-').reverse().join('.'):'—'}}</dd></div><div><dt>Срок</dt><dd>{{record.noDeadline?'Без срока':record.deadline?record.deadline.split('-').reverse().join('.'):'—'}}{{record.autoRenew?' · Автопродление':''}}</dd></div><div><dt>Сумма с НДС</dt><dd>{{amount(record.amount)}}</dd></div><div><dt>НДС</dt><dd>{{amount(record.vatAmount)}}</dd></div></dl>
   <UAlert v-if="canEdit&&catalog.error.value" color="error" title="Не удалось загрузить общую базу компаний" :actions="[{label:'Повторить',onClick:()=>catalog.refetch()}]"/>
   <UAlert v-if="record?.issue" color="warning" :description="record.issue"/>
   <UButton v-if="record?.canOpenProject&&record.projectId" :to="`/projects/${record.projectId}/contracts`" label="Открыть в проекте" icon="i-lucide-arrow-up-right" color="neutral" variant="outline"/>
   <section v-for="group in groups" :key="group.kind" class="space-y-3 border-t border-default pt-5" :aria-label="group.title"><h3 class="text-sm font-semibold">{{group.title}}</h3><FileUpload v-if="canEdit" :label="group.kind==='supplement'?'Прикрепить доп. соглашения':'Прикрепить файлы договора'" hint="До 20 файлов всего, каждый до 20 МБ. Загрузятся после сохранения договора." multiple :disabled="busy" @change="choose($event,group.kind)"/>
    <article v-for="file in files.filter(file=>(file.kind||'contract')===group.kind)" :key="file.origin+file.contractId+file.id" class="flex items-center gap-3 rounded-lg border border-default p-3"><UIcon name="i-lucide-file" class="shrink-0"/><span class="min-w-0 flex-1 break-words text-sm">{{file.name}}<small class="block text-xs text-muted">{{size(file.size)}}</small></span><UButton icon="i-lucide-download" :aria-label="`Скачать ${file.name}`" color="neutral" variant="ghost" :disabled="busy" @click="download(file)"/><UButton v-if="canEdit" icon="i-lucide-trash-2" :aria-label="`Удалить ${file.name}`" color="neutral" variant="ghost" :disabled="busy" @click="remove(file)"/></article>
    <article v-for="item in pending.filter(item=>item.kind===group.kind)" :key="item.id" class="flex items-center gap-3 rounded-lg border border-default p-3"><UIcon name="i-lucide-upload"/><span class="min-w-0 flex-1 break-words text-sm">{{item.file.name}}<small class="block text-xs text-muted">Будет загружен · {{size(item.file.size)}}</small></span><UButton icon="i-lucide-x" :aria-label="`Убрать ${item.file.name}`" color="neutral" variant="ghost" :disabled="busy" @click="pending=pending.filter(p=>p.id!==item.id)"/></article><p v-if="ready&&!files.some(file=>(file.kind||'contract')===group.kind)&&!pending.some(item=>item.kind===group.kind)" class="text-xs text-muted">В этой группе пока нет файлов.</p>
   </section>
   <ContractExtraFields v-model="fields" :readonly="!canEdit" :disabled="busy"/>
   <p v-if="status" role="status" class="text-sm text-muted">{{status}}</p><UAlert v-if="error" color="error" :description="error"/>
  </form></template>
  <template #footer><div class="flex w-full flex-wrap items-center justify-between gap-3"><div v-if="id&&ready" class="flex flex-wrap gap-2"><UButton label="Excel" icon="i-lucide-file-spreadsheet" color="neutral" variant="outline" title="Выгрузить сохранённый договор" :disabled="busy" @click="exportContract('xlsx')"/><UButton label="PDF" icon="i-lucide-file-text" color="neutral" variant="outline" title="Выгрузить сохранённый договор" :disabled="busy" @click="exportContract('pdf')"/></div><div class="ml-auto flex flex-wrap justify-end gap-3"><UButton v-if="canEdit&&id" label="Удалить договор" icon="i-lucide-trash-2" color="error" variant="ghost" :disabled="busy" @click="deleteOpen=true"/><UButton :label="canEdit?'Отмена':'Закрыть'" color="neutral" variant="outline" :disabled="busy" @click="emit('close')"/><UButton v-if="canEdit" type="submit" :form="formId" label="Сохранить договор" :loading="busy" :disabled="loading||!form.number.trim()||!form.seller.trim()||!form.buyer.trim()"/></div></div></template>
 </UModal>
 <UModal v-model:open="deleteOpen" title="Удалить договор?" :description="`Договор № ${record?.number||form.number} и все его файлы, включая доп. соглашения, будут удалены без возможности восстановления.`" :dismissible="!busy" :close="!busy"><template #footer><div class="flex w-full flex-wrap justify-end gap-3"><UButton label="Отмена" color="neutral" variant="outline" :disabled="busy" @click="deleteOpen=false"/><UButton label="Удалить договор" color="error" :loading="busy" @click="deleteContract"/></div></template></UModal>
</template>
<style scoped>
.registry-edit-grid>:deep(*){min-width:0}.registry-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.registry-details dt{font-size:11px;color:#94a3b8;margin-bottom:7px}.registry-details dd{font-size:14px;color:#475569;overflow-wrap:anywhere}@media(max-width:600px){.registry-details{grid-template-columns:minmax(0,1fr)}}
</style>
