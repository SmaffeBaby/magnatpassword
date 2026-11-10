import { storeToRefs } from 'pinia'
import type { KabanWorkspace, KabanTask, KabanStage, KabanFile, KabanCategory, KabanEvent } from '~~/shared/types/kaban'
import type { VaultSource } from '~~/shared/types/sharing'
import { kabanFileLimit, kabanOverdue, kabanCanEditPlanning } from '~~/shared/utils/kaban'
import { createId } from '~/utils/browser'
import { saveFile } from '~/utils/file-download'
import { dateLabel, todayDate } from '~~/shared/utils/subscriptions'

export function useKaban() {
 const auth=useAuthStore(),vault=useVaultStore(),shared=useSharedVaultsStore(),filters=useFiltersStore(),toast=useToast()
 const {workspaceId}=storeToRefs(filters)
 const workspaces=ref<KabanWorkspace[]>([])
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
 const visibleSources=computed(()=>workspaceId.value==='all'?sources.value.filter(source=>(view.value==='history'?totalTasks.value:tasks.value).some(task=>task.locations.some(location=>(location.vaultId||'personal')===source.id))):sources.value.filter(source=>source.id===workspaceId.value))
 const workspaceName=computed(()=>workspaceId.value==='all'?'Все хранилища':currentSource.value?.name||'Хранилище')
 const sourceName=(boardId:string)=>{const board=workspaces.value.find(item=>item.board.id===boardId)?.board;if(!board)return 'Хранилище';return sources.value.find(source=>source.id===(board?.vaultId||'personal'))?.name||'Хранилище'}
 const displayData=computed<KabanWorkspace|null>(()=>{
  if(workspaceId.value!=='all')return data.value
  if(!workspaces.value.length)return null
  const first=workspaces.value[0]!
  const allTasks=workspaces.value.flatMap(item=>item.tasks).filter(task=>selectedCategory.value==='all'||categoryContains(selectedCategory.value,task.categoryIds,task.boardId))
  return {...first,canEdit:workspaces.value.some(item=>item.canEdit),canManage:false,
   board:{...first.board,stages:workspaces.value.flatMap(item=>item.board.stages.map(stage=>({...stage,name:sourceName(item.board.id)+' · '+stage.name})))},
   tasks:[...new Map(allTasks.map(task=>[task.id,task])).values()],
   categories:workspaces.value.flatMap(item=>item.categories.map(category=>({...category,boardId:item.board.id}))),
   people:[...new Map(workspaces.value.flatMap(item=>item.people).map(person=>[person.id,person])).values()]}
 })
 const categories=computed(()=>(displayData.value?.categories.filter(category=>!category.archived)??[]).map(category=>workspaceId.value==='all'?{...category,id:category.boardId+':'+category.id,parentId:category.parentId?category.boardId+':'+category.parentId:null,name:sourceName(category.boardId!)+' · '+category.name}:category))
 const categoryOptions=computed(()=>(data.value?.categories.filter(category=>!category.archived)??[]).map(category=>({label:category.name,value:category.id})))
 const canCategorize=computed(()=>(workspaceId.value!=='all'||editorOpen.value)&&!!data.value?.canEdit)
 const structureBusy=computed(()=>busy.value||vault.busy||shared.busy||shared.loading)
 const canEdit=computed(()=>!!data.value?.canEdit&&!busy.value)
 const message=(failure:any)=>failure?.data?.message||failure?.message||'Не удалось загрузить доску.'
 async function load(quiet=false){
  if(!vault.unlocked||!auth.user||loading.value)return
  const attempt=generation,id=workspaceId.value,request=++requestNumber
  if(!quiet)loading.value=true
  try{const ids=id==='all'?sources.value.map(source=>source.id):[id];const results=await Promise.all(ids.map(vault=>sharedRequest<KabanWorkspace>('/api/kaban?'+new URLSearchParams({vault}))));if(attempt===generation&&request===requestNumber){workspaces.value=results;data.value=results.find(item=>item.board.id===draft.value?.boardId)||results[0]||null;error.value='';if(view.value==='history')void loadHistory()}}
  catch(failure){if(attempt===generation&&request===requestNumber){data.value=null;workspaces.value=[];error.value=message(failure)}}
  finally{if(attempt===generation&&request===requestNumber){loading.value=false;if(id==='all'&&workspaces.value.length&&workspaces.value.length!==sources.value.length)void load(true)}}
 }
 function clearPreview(){if(preview.value)URL.revokeObjectURL(preview.value);preview.value='';previewName.value=''}
 function closeEditor(){if(!busy.value){editorOpen.value=false;editorSession++;draft.value=null;files.value=[];pendingFiles.value=[];clearPreview()}}
 async function openTask(task?:KabanTask,stageId?:string){
  if(task&&workspaceId.value==='all')data.value=workspaces.value.find(item=>item.board.id===task.boardId)||null
  if(!task&&workspaceId.value==='all'&&selectedCategory.value.includes(':'))data.value=workspaces.value.find(item=>item.board.id===selectedCategory.value.split(':')[0])||data.value
  if(!data.value)return
  editorSession++;const session=editorSession,attempt=generation
  draft.value=task?JSON.parse(JSON.stringify(task)):{id:'',boardId:data.value.board.id,stageId:stageId||data.value.board.stages[0]!.id,creatorId:auth.user!.id,participantIds:[],closerIds:[],locations:[],canEdit:true,categoryIds:selectedCategory.value==='all'?[]:[workspaceId.value==='all'?selectedCategory.value.slice(selectedCategory.value.indexOf(':')+1):selectedCategory.value],revision:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),fileCount:0,archived:false,title:'',description:'',dueOn:'',todos:[]}
  editorOpen.value=true;newTodo.value='';formError.value='';files.value=[];filesLoading.value=false;pendingFiles.value=[];clearPreview()
  if(task){filesLoading.value=true;try{const result=await sharedRequest<KabanFile[]>(`/api/kaban/tasks/${task.id}/files`);if(session===editorSession&&attempt===generation)files.value=result}catch(failure){if(session===editorSession&&attempt===generation)formError.value=message(failure)}finally{if(session===editorSession&&attempt===generation)filesLoading.value=false}}
 }
 async function changeDraftVault(id:string){
  if(!draft.value||draft.value.id||busy.value)return
  busy.value=true;const attempt=generation
  try{const result=workspaces.value.find(item=>(item.board.vaultId||'personal')===id)||await sharedRequest<KabanWorkspace>('/api/kaban?'+new URLSearchParams({vault:id}));if(attempt!==generation)return;data.value=result;Object.assign(draft.value!,{boardId:result.board.id,stageId:result.board.stages[0]!.id,categoryIds:[],participantIds:[],closerIds:[],canEdit:result.canEdit})}catch(failure){if(attempt===generation)formError.value=message(failure)}finally{if(attempt===generation)busy.value=false}
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
 function taskBody(task:KabanTask){return {boardId:task.boardId,revision:task.revision,stageId:task.stageId,participantIds:task.participantIds,closerIds:task.closerIds,categoryIds:task.categoryIds,data:{title:task.title,description:task.description,dueOn:task.dueOn,todos:task.todos}}}
 async function moveTask(task:KabanTask,stageId:string){
  if(!task.canEdit||busy.value||task.stageId===stageId)return
  const target=workspaces.value.find(item=>item.board.stages.some(stage=>stage.id===stageId))
  if(target&&target.board.id!==task.boardId){if(!canOwn(task)){error.value='Перемещать задачу между хранилищами может только её создатель.';return}await openTask(task);openLocation();targetVaultId.value=target.board.vaultId||'personal';locationMove.value=true;return}
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
 const categoryContains=(id:string,ids:string[],boardId?:string)=>{
  let localId=id,board=data.value
  if(workspaceId.value==='all'){const split=id.indexOf(':');if(split<0)return false;const selectedBoard=id.slice(0,split);if(boardId!==selectedBoard)return false;localId=id.slice(split+1);board=workspaces.value.find(item=>item.board.id===boardId)||null}
  return ids.includes(localId)||!!board?.categories.some(category=>category.parentId===localId&&ids.includes(category.id))
 }
 const tasks=computed(()=>displayData.value?.tasks.filter(task=>task.archived===(view.value==='closed')&&(selectedCategory.value==='all'||categoryContains(selectedCategory.value,task.categoryIds,task.boardId))&&(!onlyMine.value||task.creatorId===auth.user?.id||task.participantIds.includes(auth.user?.id??''))&&(!onlyOverdue.value||kabanOverdue(task,displayData.value?.board.stages.find(stage=>stage.id===task.stageId)?.done))&&`${task.title} ${task.description}`.toLowerCase().includes(search.value.trim().toLowerCase()))??[])
 const totalTasks=computed(()=>[...new Map(workspaces.value.flatMap(item=>item.tasks).map(task=>[task.id,task])).values()])
 const boardStages=computed(()=>workspaceId.value==='all'?displayData.value?.board.stages.filter(stage=>tasks.value.some(task=>task.stageId===stage.id))||[]:displayData.value?.board.stages||[])
 const canComplete=(task:KabanTask)=>task.canEdit&&(task.creatorId===auth.user?.id||task.closerIds.includes(auth.user?.id||''))
 const canOwn=(task:KabanTask)=>task.canEdit&&kabanCanEditPlanning(auth.user?.id,task)
 const taskSourceNames=(task:KabanTask)=>task.locations.map(location=>sources.value.find(source=>source.id===(location.vaultId||'personal'))?.name||'Хранилище').join(' · ')
 const peopleOptions=computed(()=>data.value?.people.filter(person=>data.value?.eligibleIds.includes(person.id)).map(person=>({label:person.fullName||person.email,value:person.id}))??[])
 const person=(id:string)=>displayData.value?.people.find(person=>person.id===id)
 const categoryCount=(category:KabanCategory)=>new Set(workspaces.value.flatMap(item=>item.tasks).filter(task=>!task.archived&&categoryContains(category.id,task.categoryIds,task.boardId)).map(task=>task.id)).size
 function editCategory(category?:KabanCategory,parentId:string|null=null){if(!canCategorize.value)return;Object.assign(categoryForm,{id:category?.id||'',name:category?.name||'',color:category?.color||'#6366f1',parentId:category?.parentId??parentId,revision:category?.revision??0});categoryError.value='';categoryOpen.value=true}
 const categoryParent=computed({get:()=>categoryForm.parentId||'none',set:(id:string)=>{categoryForm.parentId=id==='none'?null:id}})
 const parentOptions=computed(()=>[{label:'Основная категория',value:'none'},...(data.value?.categories.filter(category=>!category.archived)??[]).filter(category=>!category.parentId&&category.id!==categoryForm.id).map(category=>({label:category.name,value:category.id}))])
 async function saveCategory(){
  if(!data.value||!canCategorize.value||busy.value)return
  const attempt=generation;busy.value=true;categoryError.value=''
  try{const form=categoryForm;const result=await sharedRequest<{id:string}>(form.id?`/api/kaban/categories/${encodeURIComponent(form.id)}`:'/api/kaban/categories',{method:form.id?'PUT':'POST',body:{boardId:data.value.board.id,revision:form.revision,data:{name:form.name,color:form.color,parentId:form.parentId}}});if(attempt===generation){await load();categoryOpen.value=false;selectedCategory.value=workspaceId.value==='all'?data.value!.board.id+':'+result.id:result.id;if(draft.value)draft.value.categoryIds=[result.id]}}
  catch(failure){if(attempt===generation)categoryError.value=message(failure)}finally{if(attempt===generation)busy.value=false}
 }
 function chooseCategory(id:string){selectedCategory.value=id;view.value='board';mobileOpen.value=false}
 async function archiveCategory(category:KabanCategory,closed:boolean){
  if(!data.value||busy.value)return;const attempt=generation;busy.value=true
  try{await sharedRequest(`/api/kaban/categories/${encodeURIComponent(category.id)}/archive`,{method:'POST',body:{boardId:category.boardId||data.value.board.id,revision:category.revision,closed}});if(attempt===generation){selectedCategory.value='all';if(closed)view.value='closed';await load()}}
  catch(failure){if(attempt===generation)error.value=message(failure)}finally{if(attempt===generation)busy.value=false}
 }
 async function archiveTask(task:KabanTask,closed:boolean){
  if(!canComplete(task)||busy.value)return;const attempt=generation;busy.value=true
  try{await sharedRequest(`/api/kaban/tasks/${task.id}/archive`,{method:'POST',body:{boardId:task.boardId,revision:task.revision,closed}});if(attempt===generation)await load()}
  catch(failure){if(attempt===generation)error.value=message(failure)}finally{if(attempt===generation)busy.value=false}
 }
 const historyCursors=ref<Record<string,string|null>>({})
 async function loadHistory(more=false){
  if(!workspaces.value.length||historyLoading.value)return
  const attempt=generation;historyLoading.value=true
  try{const boards=workspaceId.value==='all'?workspaces.value:[data.value!];const results=await Promise.all(boards.filter(board=>!more||historyCursors.value[board.board.id]).map(async board=>({boardId:board.board.id,...await sharedRequest<{events:KabanEvent[];nextBefore:string|null}>(`/api/kaban/boards/${board.board.id}/history${more?'?before='+historyCursors.value[board.board.id]:''}`)})));if(attempt===generation){if(!more)historyCursors.value={};for(const result of results)historyCursors.value[result.boardId]=result.nextBefore;history.value=[...new Map([...(more?history.value:[]),...results.flatMap(result=>result.events)].map(event=>[event.changeId||event.id,event])).values()].sort((a,b)=>BigInt(a.id)>BigInt(b.id)?-1:1);historyBefore.value=Object.values(historyCursors.value).some(Boolean)?'more':null}}
  catch(failure){if(attempt===generation)error.value=message(failure)}finally{if(attempt===generation)historyLoading.value=false}
 }
 const locationOpen=ref(false),targetVaultId=ref(''),targetWorkspace=ref<KabanWorkspace|null>(null),targetCategory=ref(''),targetStage=ref(''),locationMove=ref(false),locationError=ref(''),locationLoading=ref(false),newLocationCategory=ref('')
 const locationSources=computed(()=>sources.value.filter(source=>source.id!==(data.value?.board.vaultId||'personal')&&(source.id==='personal'||shared.groups.find(group=>group.id===source.id)?.canEdit)))
 const targetCategoryOptions=computed(()=>targetWorkspace.value?.categories.filter(category=>!category.archived).map(category=>({label:category.name,value:category.id}))||[])
 let targetRequest=0
 watch(targetVaultId,async id=>{const ticket=++targetRequest;targetWorkspace.value=null;targetCategory.value='';targetStage.value='';newLocationCategory.value='';locationError.value='';if(!id)return;locationLoading.value=true;try{const result=await sharedRequest<KabanWorkspace>('/api/kaban?'+new URLSearchParams({vault:id}));if(ticket!==targetRequest)return;targetWorkspace.value=result;targetCategory.value=result.categories.find(category=>!category.archived)?.id||'';targetStage.value=result.board.stages[0]?.id||''}catch(failure){if(ticket===targetRequest)locationError.value=message(failure)}finally{if(ticket===targetRequest)locationLoading.value=false}})
 function openLocation(){if(!draft.value?.id||!canOwn(draft.value))return;const saved=data.value?.tasks.find(task=>task.id===draft.value?.id);if(!saved||JSON.stringify(taskBody(saved))!==JSON.stringify(taskBody(draft.value))||pendingFiles.value.length||newTodo.value.trim()){formError.value='Сначала сохраните изменения задачи, затем откройте «Хранилища задачи».';return}locationOpen.value=true;targetVaultId.value='';targetWorkspace.value=null;locationError.value='';locationMove.value=false}
 async function saveLocation(){
  if(!draft.value||!canOwn(draft.value)||!targetWorkspace.value||busy.value||locationLoading.value)return
  const task=draft.value,target=targetWorkspace.value,attempt=generation;busy.value=true;locationError.value=''
  try{if(!targetCategory.value&&newLocationCategory.value.trim()){const category=await sharedRequest<{id:string}>('/api/kaban/categories',{method:'POST',body:{boardId:target.board.id,revision:0,data:{name:newLocationCategory.value.trim(),parentId:null,color:'#6366f1'}}});targetCategory.value=category.id}
   if(!targetCategory.value)throw Error('Выберите или создайте категорию в целевом хранилище.')
   await sharedRequest(`/api/kaban/tasks/${task.id}/location`,{method:'POST',body:{sourceBoardId:task.boardId,targetBoardId:target.board.id,revision:task.revision,stageId:targetStage.value,categoryIds:[targetCategory.value],move:locationMove.value}})
   if(attempt!==generation)return;locationOpen.value=false;editorOpen.value=false;draft.value=null;await load();toast.add({title:locationMove.value?'Задача перемещена':'Задача добавлена в хранилище',color:'success'})
  }catch(failure){if(attempt===generation)locationError.value=message(failure)}finally{if(attempt===generation)busy.value=false}
 }
 function setView(value:'board'|'closed'|'history'){view.value=value;selectedCategory.value='all';onlyMine.value=false;onlyOverdue.value=false;mobileOpen.value=false;if(value==='history')void loadHistory()}
 watch([workspaceId,()=>auth.user?.id,()=>vault.unlocked],()=>{generation++;data.value=null;workspaces.value=[];locationOpen.value=false;targetVaultId.value='';targetRequest++;loading.value=false;busy.value=false;error.value='';editorOpen.value=false;draft.value=null;editorSession++;files.value=[];filesLoading.value=false;pendingFiles.value=[];clearPreview();stagesOpen.value=false;categoryOpen.value=false;deleteOpen.value=false;selectedCategory.value='all';view.value='board';history.value=[];historyBefore.value=null;historyLoading.value=false;mobileOpen.value=false;void load()},{immediate:true})
 watch(()=>sources.value.map(source=>source.id).join(','),()=>{void load()})
 onMounted(()=>{void shared.refresh(true).then(()=>load());timer=setInterval(()=>{if(!busy.value&&!editorOpen.value&&!stagesOpen.value&&document.visibilityState==='visible')void load(true)},15000)})
 onBeforeUnmount(()=>{generation++;editorSession++;clearInterval(timer);clearPreview()})
 return {totalTasks,boardStages,changeDraftVault,displayData,canComplete,canOwn,taskSourceNames,workspaces,sourceName,locationOpen,targetVaultId,targetWorkspace,targetCategory,targetStage,locationMove,locationError,locationLoading,newLocationCategory,locationSources,targetCategoryOptions,openLocation,saveLocation,view,history,historyBefore,historyLoading,loadHistory,setView,categoryContains,categoryParent,parentOptions,archiveTask,archiveCategory,auth,vault,shared,filters,data,loading,busy,error,mobileOpen,workspaceId,workspaceName,sources,currentSource,visibleSources,categories,categoryOptions,canCategorize,structureBusy,canEdit,load,selectedCategory,search,onlyMine,onlyOverdue,tasks,categoryCount,chooseCategory,editorOpen,draft,formError,newTodo,deleteOpen,openTask,closeEditor,addTodo,chooseFiles,saveTask,moveTask,removeTask,files,filesLoading,pendingFiles,preview,previewName,clearPreview,openFile,removeFile,stagesOpen,stageDraft,stageError,editStages,addStage,shiftStage,stageCount,saveStages,peopleOptions,person,categoryOpen,categoryError,categoryForm,editCategory,saveCategory,dateLabel,todayDate,kabanOverdue}
}
