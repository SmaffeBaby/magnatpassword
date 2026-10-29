import type { ComputedRef, Ref } from 'vue'
import type { Credential, CredentialLink } from '~~/shared/types/vault'
import type { VaultSource } from '~~/shared/types/sharing'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
import { cardKey } from '~~/shared/utils/relationships'
import { createId } from '~/utils/browser'

export function useRelationshipCards(context: {
  sources: ComputedRef<VaultSource[]>; allEntries: ComputedRef<ScopedCredential[]>; workspaceId: Ref<string>;
  canEditEntry: (entry: ScopedCredential) => boolean; canManageCategoryVault: (id: string) => boolean
}) {
  const shared = useSharedVaultsStore(), vault = useVaultStore(), toast = useToast()
  const open = ref(false), draft = ref<Credential | null>(null), error = ref(''), recordId = ref(''), revision = ref(0)
  const editable = ref(true), canShare = ref(true), canCategorize = ref(true), targets = ref<string[]>(['personal']), deleteOpen = ref(false)
  const vaultOptions = computed(() => context.sources.value.filter(source => source.id === 'personal' || shared.groups.some(group => group.id === source.id && group.canEdit)).map(source => ({label:source.name,value:source.id})))
  const categoryOptions = computed(() => context.sources.value.filter(source => targets.value.includes(source.id)).flatMap(source => source.data.categories.map(category => ({label:`${category.name} · ${source.name}`,value:category.id}))))
  const categories = computed({get:()=>draft.value?.categoryIds??[],set:(ids:string[])=>{if(draft.value){draft.value.categoryIds=ids;draft.value.categoryId=ids[0]??''}}})
  const categoryRequired = computed(()=>targets.value.some(id=>!context.canManageCategoryVault(id)))
  const resolve = (link: CredentialLink) => context.allEntries.value.find(entry => entry.id === link.targetEntryId && (entry.vaultIds ?? [entry.vaultId]).includes(link.targetVaultId))
  const linkKey = (link: CredentialLink) => {const entry=resolve(link);return entry?cardKey(entry.vaultId,entry.id):cardKey(link.targetVaultId,link.targetEntryId)}
  const group = (link: CredentialLink) => {const entry=resolve(link);return !entry?'other':entry.kind==='subscription'?'finance':entry.kind==='relationship'?'other':'password'}
  function selection(kind: string) {
    return computed({get:()=>(draft.value?.links??[]).filter(link=>group(link)===kind).map(linkKey),set:(keys:string[])=>{
      if(!draft.value)return
      const old=draft.value.links??[],rest=old.filter(link=>group(link)!==kind)
      draft.value.links=[...rest,...[...new Set(keys)].flatMap(key=>{
        const existing=old.find(link=>linkKey(link)===key);if(existing)return [existing]
        const entry=context.allEntries.value.find(entry=>cardKey(entry.vaultId,entry.id)===key)
        return entry?[{id:createId(),targetVaultId:entry.vaultId,targetEntryId:entry.id,sourceFieldId:'card',targetFieldId:'card',label:kind==='password'?'Пароли сервиса':kind==='finance'?'Подписка сервиса':'Связь сервисов'}]:[]
      })]
    }})
  }
  const passwords=selection('password'), finances=selection('finance'), other=selection('other')
  const options = (kind: string) => computed(()=>{
    const entries=context.allEntries.value.filter(entry=>entry.sharedCardId!==recordId.value&&entry.id!==draft.value?.id&&(kind==='password'?!entry.kind:kind==='finance'?entry.kind==='subscription':entry.kind==='relationship'))
    const items=entries.map(entry=>({label:`${entry.title}${entry.financeSubscription?' · '+entry.financeSubscription.label:''} · ${entry.vaultName}`,value:cardKey(entry.vaultId,entry.id)}))
    if(kind==='other')for(const link of draft.value?.links??[])if(!resolve(link))items.push({label:'Недоступная запись',value:linkKey(link)})
    return items
  })
  const passwordOptions=options('password'),financeOptions=options('finance'),otherOptions=options('other')
  function edit(entry?:ScopedCredential){
    if(entry&&entry.kind!=='relationship')return
    const card=entry?.sharedCardId?shared.cards.find(card=>card.id===entry.sharedCardId):undefined
    editable.value=!entry||context.canEditEntry(entry);canShare.value=!card||card.canManageSharing!==false;canCategorize.value=!card||card.canManageCategories!==false
    recordId.value=card?.id??'';revision.value=card?.revision??0
    targets.value=card?(card.vaultIds.length?[...card.vaultIds]:['personal']):[context.workspaceId.value==='all'?'personal':context.workspaceId.value]
    const now=new Date().toISOString()
    draft.value=card?structuredClone(toRaw(card.entry)):{id:createId(),kind:'relationship',title:'',url:'',username:'',password:'',notes:'',categoryId:'',categoryIds:[],favorite:false,links:[],createdAt:now,updatedAt:now}
    error.value='';open.value=true
  }
  function setTargets(values:string[]){const added=values.find(value=>!targets.value.includes(value));targets.value=added==='personal'?['personal']:values.filter(value=>value!=='personal');if(!targets.value.length)targets.value=['personal'];if(canCategorize.value)categories.value=categories.value.filter(id=>categoryOptions.value.some(option=>option.value===id))}
  async function save(){
    const entry=draft.value;if(!entry||!editable.value)return
    error.value=''
    if(!entry.title.trim()){error.value='Укажите название карточки.';return}
    if(entry.url&&!/^https?:\/\//i.test(entry.url)){error.value='Укажите адрес сайта с http:// или https://.';return}
    if(categoryRequired.value&&!categories.value.length){error.value='Выберите категорию доступа.';return}
    if((entry.links?.length??0)>500){error.value='Можно добавить до 500 связей.';return}
    entry.title=entry.title.trim();entry.updatedAt=new Date().toISOString()
    if(await shared.saveCard(JSON.parse(JSON.stringify(entry)),canShare.value?targets.value.filter(id=>id!=='personal'):undefined,recordId.value||undefined,undefined,revision.value||undefined)){open.value=false;toast.add({title:'Карточка взаимосвязей сохранена',color:'success'})}else error.value=shared.error||'Не удалось сохранить карточку.'
  }
  async function remove(){if(!editable.value||!recordId.value)return;if(await shared.deleteCard(recordId.value)){deleteOpen.value=false;open.value=false;toast.add({title:'Карточка удалена. Пароли и подписки сохранены.',color:'success'})}else error.value=shared.error}
  let migrating=false
  async function migrate(){
    if(migrating||shared.busy||shared.loading||!vault.unlocked)return
    const entries=context.allEntries.value
    if(entries.some(entry=>!entry.kind&&entry.customFields?.some(field=>field.type==='subscription')))return
    if(!entries.some(entry=>!entry.kind&&!entry.relationshipCardId&&context.canEditEntry(entry)))return
    migrating=true
    try{if(await shared.migrateRelationships())await vault.check()}finally{migrating=false}
  }
  watch(open,value=>{if(!value){draft.value=null;error.value='';deleteOpen.value=false}})
  return {open,draft,error,recordId,editable,canShare,canCategorize,targets,vaultOptions,categoryOptions,categories,categoryRequired,passwords,finances,other,passwordOptions,financeOptions,otherOptions,edit,setTargets,save,deleteOpen,remove,migrate}
}
