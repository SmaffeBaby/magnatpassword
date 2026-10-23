import type { VaultSource } from '~~/shared/types/sharing'
import type { CategoryFolder, CategoryReference, VaultData } from '~~/shared/types/vault'
import { sourceCategories, categoryFilterId, sourceCategoryFolders, type ScopedCategoryFolder } from '~~/shared/utils/vault-sources'
import { createId } from '~/utils/browser'
export function useCategoryFolders(sources:()=>VaultSource[],visibleSources:()=>VaultSource[],save:(id:string,data:VaultData)=>Promise<boolean>,canManage:(id:string)=>boolean,defaultVault:()=>string){
 const folderOpen=ref(false),folderVaultId=ref('personal'),folderError=ref(''),folderDeleteOpen=ref(false),deletingFolder=ref<ScopedCategoryFolder|null>(null)
 const folderForm=reactive<CategoryFolder>({id:'',name:'',icon:'i-lucide-folder',color:'#6366f1',svg:undefined})
 const folders=computed(()=>sourceCategoryFolders(visibleSources()))
 const folderCategoryOptions=computed(()=>{
  const options=sourceCategories(sources()).filter(category=>category.vaultId!==folderVaultId.value).map(category=>({label:`${category.name} · ${category.vaultName}`,value:category.filterId}))
  for(const link of folderForm.categoryLinks??[]){const value=categoryFilterId(link.vaultId,link.categoryId);if(!options.some(option=>option.value===value))options.push({label:'Недоступная категория',value})}
  return options
 })
 const linkedFolderCategories=computed({get:()=>(folderForm.categoryLinks??[]).map(link=>categoryFilterId(link.vaultId,link.categoryId)),set:(values:string[])=>{folderForm.categoryLinks=[...new Set(values)].map(value=>{const separator=value.indexOf('/');return {vaultId:value.slice(0,separator),categoryId:value.slice(separator+1)} satisfies CategoryReference}).filter(link=>link.vaultId!==folderVaultId.value)}})
 watch(folderVaultId,()=>{folderForm.categoryLinks=folderForm.categoryLinks?.filter(link=>link.vaultId!==folderVaultId.value)})
 const media=useMediaUploads(),filters=useFiltersStore()
 function editFolder(folder?:ScopedCategoryFolder){
  folderVaultId.value=folder?.vaultId??(canManage(defaultVault())?defaultVault():'personal')
  if(!canManage(folderVaultId.value))return
  Object.assign(folderForm,{id:folder?.id??'',name:folder?.name??'',icon:folder?.icon??'i-lucide-folder',color:folder?.color??'#6366f1',svg:folder?.svg,categoryLinks:folder?.categoryLinks?.map(link=>({...link}))??[]})
  folderError.value='';media.mediaError.value='';folderOpen.value=true
 }
 async function uploadFolderSvg(event:Event){const id=folderForm.id,value=await media.readSvg(event);if(value&&folderOpen.value&&folderForm.id===id)folderForm.svg=value}
 async function saveFolder(){
  folderError.value=''
  const source=sources().find(source=>source.id===folderVaultId.value)
  if(!source||!canManage(source.id)){folderError.value='Нет прав на изменение папок';return}
  const data=JSON.parse(JSON.stringify(source.data)) as VaultData
  if(!folderForm.name.trim())return
  if(data.categoryFolders?.some(folder=>folder.id!==folderForm.id&&folder.name.toLowerCase()===folderForm.name.trim().toLowerCase())){folderError.value='Папка с таким названием уже существует';return}
  const folder={...folderForm,id:folderForm.id||createId(),name:folderForm.name.trim()}
  data.categoryFolders??=[]
  const index=data.categoryFolders.findIndex(item=>item.id===folder.id)
  if(index<0)data.categoryFolders.push(folder);else data.categoryFolders[index]=folder
  if(await save(source.id,data))folderOpen.value=false
 }
 function askDeleteFolder(folder:ScopedCategoryFolder){deletingFolder.value=folder;folderError.value='';folderDeleteOpen.value=true}
 async function removeFolder(){
  const folder=deletingFolder.value,source=sources().find(source=>source.id===folder?.vaultId)
  if(!folder||!source||!canManage(source.id))return
  const data=JSON.parse(JSON.stringify(source.data)) as VaultData
  data.categoryFolders=data.categoryFolders?.filter(item=>item.id!==folder.id)
  for(const category of data.categories)if(category.folderId===folder.id)delete category.folderId
  if(await save(source.id,data)){folderDeleteOpen.value=false;deletingFolder.value=null;filters.collapsedFolders=filters.collapsedFolders.filter(id=>id!==folder.filterId)}
 }
 function toggleFolder(key:string,open:boolean){if(open)filters.collapsedFolders=filters.collapsedFolders.filter(id=>id!==key);else if(!filters.collapsedFolders.includes(key))filters.collapsedFolders.push(key)}
 return {folderCategoryOptions,linkedFolderCategories,folderOpen,folderVaultId,folderForm,folderError,folderDeleteOpen,deletingFolder,folders,editFolder,uploadFolderSvg,saveFolder,askDeleteFolder,removeFolder,toggleFolder,folderMediaError:media.mediaError}
}
