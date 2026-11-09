import { storeToRefs } from 'pinia'
import type { KabanWorkspace, KabanTask, KabanStage, KabanFile, KabanCategory, KabanEvent } from '~~/shared/types/kaban'
import type { VaultSource } from '~~/shared/types/sharing'
import { kabanFileLimit, kabanOverdue } from '~~/shared/utils/kaban'
import { createId } from '~/utils/browser'
import { saveFile } from '~/utils/file-download'
import { dateLabel, todayDate } from '~~/shared/utils/subscriptions'

export function useKaban() {
 const auth=useAuthStore(),vault=useVaultStore(),shared=useSharedVaultsStore(),filters=useFiltersStore(),toast=useToast()
 const {workspaceId}=storeToRefs(filters)
 const data=ref<KabanWorkspace|null>(null),loading=ref(false),busy=ref(false),error=ref(''),mobileOpen=ref(false)
 const view=ref<'board'|'closed'|'history'>('board'),history=ref<KabanEvent[]>([]),historyBefore=ref<string|null>(null),historyLoading=ref(false)
 const selectedCategory=ref('all'),search=ref(''),onlyMine=ref(false),onlyOverdue=ref(false)
 const editorOpen=ref(false),draft=ref<KabanTask|null>(null),formError=ref(''),newTodo=ref(''),deleteOpen=ref(false)
 const files=ref<KabanFile[]>([]),filesLoading=ref(false),pendingFiles=shallowRef<File[]>([]),preview=ref(''),previewName=ref('')
 const stagesOpen=ref(false),stageDraft=ref<KabanStage[]>([]),stageRevision=ref(0),stageError=ref('')
 const categoryOpen=ref(false),categoryError=ref(''),categoryForm=reactive({id:'',name:'',parentId:null as string|null,color:'#6366f1',revision:0})
 let generation=0,editorSession=0,requestNumber=0,timer:ReturnType<typeof setInterval>|undefined
 const sources=computed<VaultSource[]>(()=>[{id:'personal',name:vault.data.name||'Личное',data:vault.data},...shared.groups.map(group=>({id:group.id,name:group.name,data:group.data}))])
 const currentSource=computed(()=>sources.value.find(source=>source.id===workspaceId.value))
 const visibleSources=computed(()=>workspaceId.value==='all'?sources.value:sources.value.filter(source=>source.id===workspaceId.value))
 const workspaceName=computed(()=>workspaceId.value==='all'?'Все хранилища':currentSource.value?.name||'Хранилище')
 const categories=computed(()=>data.value?.categories.filter(category=>!category.archived)??[])
 const categoryOptions=computed(()=>categories.value.map(category=>({label:category.name,value:category.id})))
 const canCategorize=computed(()=>workspaceId.value!=='all'&&!!data.value?.canEdit)
 const structureBusy=computed(()=>busy.value||vault.busy||shared.busy||shared.loading)
 const canEdit=computed(()=>!!data.value?.canEdit&&!busy.value)
 const message=(failure:any)=>failure?.data?.message||failure?.message||'Не удалось загрузить доску.'
 async function load(quiet=false){
  if(workspaceId.value==='all'||!vault.unlocked||!auth.user||loading.value)return
  const attempt=generation,id=workspaceId.value,request=++requestNumber
  if(!quiet)loading.value=true
  try{const result=await sharedRequest<KabanWorkspace>('/api/kaban?'+new URLSearchParams({vault:id}));if(attempt===generation&&request===requestNumber){data.value=result;error.value=''}}
  catch(failure){if(attempt===generation&&request===requestNumber){data.value=null;error.value=message(failure)}}
  finally{if(attempt===generation&&request===requestNumber)loading.value=false}
 }
 function clearPreview(){if(preview.value)URL.revokeObjectURL(preview.value);preview.value='';previewName.value=''}
 function closeEditor(){if(!busy.value){editorOpen.value=false;editorSession++;draft.value=null;files.value=[];pendingFiles.value=[];clearPreview()}}
 async function openTask(task?:KabanTask,stageId?:string){
  if(!data.value)return
  editorSession++;const session=editorSession,attempt=generation
  draft.value=task?JSON.parse(JSON.stringify(task)):{id:'',boardId:data.value.board.id,stageId:stageId||data.value.board.stages[0]!.id,creatorId:auth.user!.id,participantIds:[],categoryIds:selectedCategory.value==='all'?[]:[selectedCategory.value],revision:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),fileCount:0,archived:false,title:'',description:'',dueOn:'',todos:[]}
  editorOpen.value=true;newTodo.value='';formError.value='';files.value=[];filesLoading.value=false;pendingFiles.value=[];clearPreview()
  if(task){filesLoading.value=true;try{const result=await sharedRequest<KabanFile[]>(`/api/kaban/tasks/${task.id}/files`);if(session===editorSession&&attempt===generation)files.value=result}catch(failure){if(session===editorSession&&attempt===generation)formError.value=message(failure)}finally{if(session===editorSession&&attempt===generation)filesLoading.value=false}}
 }
 function addTodo(){if(!draft.value||!newTodo.value.trim()||draft.value.todos.length>=100)return;draft.value.todos.push({id:createId(),text:newTodo.value.trim().slice(0,500),done:false});newTodo.value=''}
 function chooseFiles(event:Event){
  const input=event.target as HTMLInputElement,chosen=Array.from(input.files??[]);formError.value=''
  if(chosen.some(file=>!file.size||file.size>kabanFileLimit)){formError.value='Выберите непустые файлы размером до 20 МБ.';input.value='';return}
  if(files.value.length+pendingFiles.value.length+chosen.length>20){formError.value='К задаче можно прикрепить до 20 файлов.';input.value='';return}
  pendingFiles.value=[...pendingFiles.value,...chosen];input.value=''
 }
 async function saveTask(){
  if(!draft.value||!data.value?.canEdit||busy.value)return
  addTodo();formError.value=''
  if(!draft.value.title.trim()||!draft.value.categoryIds.length){formError.value='Укажите название и категорию задачи.';return}
  const task=JSON.parse(JSON.stringify(draft.value)) as KabanTask,attempt=generation
  busy.value=true
  try{
   const result=await sharedRequest<{id:string}>(task.id?`/api/kaban/tasks/${task.id}`:'/api/kaban/tasks',{method:task.id?'PUT':'POST',body:taskBody(task)})
   if(attempt!==generation)return
   draft.value={...task,id:result.id,revision:task.revision+1}
   await load();if(attempt!==generation)return
   const saved=data.value?.tasks.find(item=>item.id===result.id)
   if(!saved)throw Error('Задача сохранена. Обновите доску для продолжения.')
   draft.value=JSON.parse(JSON.stringify(saved))
   while(pendingFiles.value.length){const file=pendingFiles.value[0]!,body=new FormData();body.append('file',file);const uploaded=await sharedRequest<KabanFile>(`/api/kaban/tasks/${result.id}/files`,{method:'POST',body});if(attempt!==generation)return;files.value.push(uploaded);pendingFiles.value=pendingFiles.value.slice(1)}
   await load();if(attempt!==generation)return
   editorOpen.value=false;editorSession++;draft.value=null;clearPreview();toast.add({title:'Задача сохранена',color:'success'})
  }catch(failure){if(attempt===generation)formError.value=message(failure)}finally{if(attempt===generation)busy.value=false}
 }
 function taskBody(task:KabanTask){return {boardId:task.boardId,revision:task.revision,stageId:task.stageId,participantIds:task.participantIds,categoryIds:task.categoryIds,data:{title:task.title,description:task.description,dueOn:task.dueOn,todos:task.todos}}}
 async function moveTask(task:KabanTask,stageId:string){
  if(!canEdit.value||task.stageId===stageId)return
  const attempt=generation;busy.value=true
  try{await sharedRequest(`/api/kaban/tasks/${task.id}`,{method:'PUT',body:taskBody({...task,stageId})});if(attempt===generation)await load()}
  catch(failure){if(attempt===generation){await load(true);if(attempt===generation)error.value=message(failure)}}finally{if(attempt===generation)busy.value=false}
 }
 async function removeTask(){
  if(!draft.value?.id||!canEdit.value)return
  const task=draft.value,attempt=generation;busy.value=true
  try{await sharedRequest(`/api/kaban/tasks/${task.id}`,{method:'DELETE',body:{boardId:task.boardId,revision:task.revision}});if(attempt===generation){deleteOpen.value=false;editorOpen.value=false;draft.value=null;clearPreview();await load()}}
  catch(failure){if(attempt===generation)formError.value=message(failure)}finally{if(attempt===generation)busy.value=false}
 }
 async function openFile(file:KabanFile,show=false){
  if(!draft.value?.id)return
  const attempt=generation,session=editorSession
  try{const blob=await sharedRequest<Blob>(`/api/kaban/tasks/${draft.value.id}/files/${file.id}${show?'?preview=1':''}`,{responseType:'blob'});if(attempt!==generation||session!==editorSession)return;if(show){clearPreview();preview.value=URL.createObjectURL(new Blob([blob],{type:file.type}));previewName.value=file.name}else await saveFile(blob,file.name)}catch(failure){if(attempt===generation&&session===editorSession)formError.value=message(failure)}
 }
 async function removeFile(file:KabanFile){
  if(!draft.value?.id||!canEdit.value)return
  const attempt=generation;busy.value=true
  try{await sharedRequest(`/api/kaban/tasks/${draft.value.id}/files/${file.id}`,{method:'DELETE'});if(attempt===generation){files.value=files.value.filter(item=>item.id!==file.id);await load()}}catch(failure){if(attempt===generation)formError.value=message(failure)}finally{if(attempt===generation)busy.value=false}
 }
 function editStages(){if(!data.value?.canManage)return;stageDraft.value=JSON.parse(JSON.stringify(data.value.board.stages));stageRevision.value=data.value.board.revision;stageError.value='';stagesOpen.value=true}
 function addStage(){if(stageDraft.value.length<12)stageDraft.value.push({id:createId(),name:'Новая стадия',color:'#64748b',done:false})}
 function shiftStage(index:number,delta:number){const target=index+delta;if(target<0||target>=stageDraft.value.length)return;const [item]=stageDraft.value.splice(index,1);stageDraft.value.splice(target,0,item!)}
 const stageCount=(id:string)=>data.value?.tasks.filter(task=>task.stageId===id).length??0
 async function saveStages(){
  if(!data.value?.canManage||busy.value)return
  const attempt=generation;busy.value=true;stageError.value=''
  try{await sharedRequest(`/api/kaban/boards/${data.value.board.id}/stages`,{method:'PUT',body:{revision:stageRevision.value,stages:stageDraft.value}});if(attempt===generation){stagesOpen.value=false;await load()}}catch(failure){if(attempt===generation)stageError.value=message(failure)}finally{if(attempt===generation)busy.value=false}
 }
 const categoryContains=(id:string,ids:string[])=>ids.includes(id)||!!data.value?.categories.some(category=>category.parentId===id&&ids.includes(category.id))
 const tasks=computed(()=>data.value?.tasks.filter(task=>task.archived===(view.value==='closed')&&(selectedCategory.value==='all'||categoryContains(selectedCategory.value,task.categoryIds))&&(!onlyMine.value||task.creatorId===auth.user?.id||task.participantIds.includes(auth.user?.id??''))&&(!onlyOverdue.value||kabanOverdue(task,data.value?.board.stages.find(stage=>stage.id===task.stageId)?.done))&&`${task.title} ${task.description}`.toLowerCase().includes(search.value.trim().toLowerCase()))??[])
 const peopleOptions=computed(()=>data.value?.people.filter(person=>data.value?.eligibleIds.includes(person.id)).map(person=>({label:person.fullName||person.email,value:person.id}))??[])
 const person=(id:string)=>data.value?.people.find(person=>person.id===id)
 const categoryCount=(category:KabanCategory)=>data.value?.tasks.filter(task=>!task.archived&&categoryContains(category.id,task.categoryIds)).length??0
 function editCategory(category?:KabanCategory,parentId:string|null=null){if(!canCategorize.value)return;Object.assign(categoryForm,{id:category?.id||'',name:category?.name||'',color:category?.color||'#6366f1',parentId:category?.parentId??parentId,revision:category?.revision??0});categoryError.value='';categoryOpen.value=true}
 const categoryParent=computed({get:()=>categoryForm.parentId||'none',set:(id:string)=>{categoryForm.parentId=id==='none'?null:id}})
 const parentOptions=computed(()=>[{label:'Основная категория',value:'none'},...categories.value.filter(category=>!category.parentId&&category.id!==categoryForm.id).map(category=>({label:category.name,value:category.id}))])
 async function saveCategory(){
  if(!data.value||!canCategorize.value||busy.value)return
  const attempt=generation;busy.value=true;categoryError.value=''
  try{const form=categoryForm;const result=await sharedRequest<{id:string}>(form.id?`/api/kaban/categories/${encodeURIComponent(form.id)}`:'/api/kaban/categories',{method:form.id?'PUT':'POST',body:{boardId:data.value.board.id,revision:form.revision,data:{name:form.name,color:form.color,parentId:form.parentId}}});if(attempt===generation){await load();categoryOpen.value=false;selectedCategory.value=result.id;if(draft.value)draft.value.categoryIds=[result.id]}}
  catch(failure){if(attempt===generation)categoryError.value=message(failure)}finally{if(attempt===generation)busy.value=false}
 }
 function chooseCategory(id:string){selectedCategory.value=id;view.value='board';mobileOpen.value=false}
 async function archiveCategory(category:KabanCategory,closed:boolean){
  if(!data.value||busy.value)return;const attempt=generation;busy.value=true
  try{await sharedRequest(`/api/kaban/categories/${encodeURIComponent(category.id)}/archive`,{method:'POST',body:{boardId:data.value.board.id,revision:category.revision,closed}});if(attempt===generation){selectedCategory.value='all';if(closed)view.value='closed';await load()}}
  catch(failure){if(attempt===generation)error.value=message(failure)}finally{if(attempt===generation)busy.value=false}
 }
 async function archiveTask(task:KabanTask,closed:boolean){
  if(!data.value||busy.value)return;const attempt=generation;busy.value=true
  try{await sharedRequest(`/api/kaban/tasks/${task.id}/archive`,{method:'POST',body:{boardId:task.boardId,revision:task.revision,closed}});if(attempt===generation)await load()}
  catch(failure){if(attempt===generation)error.value=message(failure)}finally{if(attempt===generation)busy.value=false}
 }
 async function loadHistory(more=false){
  if(!data.value||historyLoading.value)return
  const attempt=generation;historyLoading.value=true
  try{const result=await sharedRequest<{events:KabanEvent[];nextBefore:string|null}>(`/api/kaban/boards/${data.value.board.id}/history${more&&historyBefore.value?'?before='+historyBefore.value:''}`);if(attempt===generation){history.value=more?[...history.value,...result.events]:result.events;historyBefore.value=result.nextBefore}}
  catch(failure){if(attempt===generation)error.value=message(failure)}finally{if(attempt===generation)historyLoading.value=false}
 }
 function setView(value:'board'|'closed'|'history'){view.value=value;selectedCategory.value='all';onlyMine.value=false;onlyOverdue.value=false;mobileOpen.value=false;if(value==='history')void loadHistory()}
 watch([workspaceId,()=>auth.user?.id,()=>vault.unlocked],()=>{generation++;data.value=null;loading.value=false;busy.value=false;error.value='';editorOpen.value=false;draft.value=null;editorSession++;files.value=[];filesLoading.value=false;pendingFiles.value=[];clearPreview();stagesOpen.value=false;categoryOpen.value=false;deleteOpen.value=false;selectedCategory.value='all';view.value='board';history.value=[];historyBefore.value=null;historyLoading.value=false;mobileOpen.value=false;void load()},{immediate:true})
 onMounted(()=>{void shared.refresh(true);timer=setInterval(()=>{if(!busy.value&&!editorOpen.value&&!stagesOpen.value&&document.visibilityState==='visible')void load(true)},15000)})
 onBeforeUnmount(()=>{generation++;editorSession++;clearInterval(timer);clearPreview()})
 return {view,history,historyBefore,historyLoading,loadHistory,setView,categoryContains,categoryParent,parentOptions,archiveTask,archiveCategory,auth,vault,shared,filters,data,loading,busy,error,mobileOpen,workspaceId,workspaceName,sources,currentSource,visibleSources,categories,categoryOptions,canCategorize,structureBusy,canEdit,load,selectedCategory,search,onlyMine,onlyOverdue,tasks,categoryCount,chooseCategory,editorOpen,draft,formError,newTodo,deleteOpen,openTask,closeEditor,addTodo,chooseFiles,saveTask,moveTask,removeTask,files,filesLoading,pendingFiles,preview,previewName,clearPreview,openFile,removeFile,stagesOpen,stageDraft,stageError,editStages,addStage,shiftStage,stageCount,saveStages,peopleOptions,person,categoryOpen,categoryError,categoryForm,editCategory,saveCategory,dateLabel,todayDate,kabanOverdue}
}
