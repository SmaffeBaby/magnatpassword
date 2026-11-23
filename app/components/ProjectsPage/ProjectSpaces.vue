<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import ChatTaskPicker from '~/components/Chats/ChatTaskPicker.vue'
import type { ProjectPassword,ProjectPasswordChoice } from '~~/shared/types/project-passwords'
import type { ProjectChat } from '~~/shared/types/project-chats'
import { resizeFrame, inkDistance } from '~~/shared/utils/space-geometry.mjs'
import type { Project } from '~~/shared/types/projects'
import type { ProjectDocument, SpaceFileThumbnail, SpaceSpreadsheetPreview } from '~~/shared/types/project-documents'
import type { RealtimeChannel } from '@supabase/supabase-js'
import SpaceLayers from './SpaceLayers.vue'
import BookingPicker from '~/components/MeetingRoom/BookingPicker.vue'
import SpaceBookingCard from '~/components/MeetingRoom/SpaceBookingCard.vue'
import SpaceBookingPlanning from '~/components/MeetingRoom/SpaceBookingPlanning.vue'
import type { MeetingRoomReference } from '~~/shared/types/meeting-room'
import SpaceTaskPlanning from './SpaceTaskPlanning.vue'
import ProjectImageViewer from './ProjectImageViewer.vue'
import { canViewProjectSection } from '~~/shared/utils/project-permissions'
import type { KabanWorkspace } from '~~/shared/types/kaban'
import { groupSpaceLayers, moveSpaceLayer, moveSpaceLayers, spaceHiddenLayers, spaceLayers, spaceSearchText, ungroupSpaceLayers, type SpaceLayerChange, type SpaceLayerPosition } from '~~/shared/utils/space-layers'
import { documentEditor, spaceSpreadsheetPreviewDefaults, spaceSpreadsheetPreviewLimits } from '~~/shared/utils/project-documents'
import { spaceWebLinkMaxLength, spaceWebLinkUrl } from '~~/shared/utils/space-web-link'
import { saveFile } from '~/utils/file-download'
import { canPreviewProjectImage, projectImagePreview } from '~/utils/project-image-preview'
const props=defineProps<{project:Project}>()
type Space={id:string;name:string;description:string;created_by:string;permission:string;object_count:number;members:{user_id:string;permission:string}[]}
type Message={id:string;author:string;text:string;createdAt:string}
type Item={id:string;revision:number;data:{kind:string;layerHidden?:boolean;layerGroup?:true;parentId?:string;layerOrder?:number;fontSize?:number;fontFamily?:'system'|'serif'|'mono';fontWeight?:'normal'|'bold';titlePosition?:string;titleColor?:string;showContent?:boolean;imageOnly?:boolean;contentOnly?:boolean;spreadsheetPreview?:SpaceSpreadsheetPreview;subscriptionSource?:any;calendarEvents?:{id:string;title:string;start:string;end:string;color:string;type:'event'|'range'}[];contours?:number;shape?:string;taskId?:string;boardId?:string;bookingId?:string;passwordId?:string;chatId?:string;personId?:string;role?:string;duty?:string;assetId?:string;points?:[number,number][];strokeWidth?:number;opacity?:number;description?:string;targetSpace?:string;borderColor?:string;borderWidth?:number;width?:number;height?:number;rows?:string[][];resolved?:boolean;messages?:Message[];name?:string;url?:string;text?:string;x:number;y:number;fileId?:string;from?:string;to?:string;color?:string;textColor?:string;lineStyle?:'straight'|'dashed'|'wavy';arrow?:'none'|'forward'|'backward'|'both'}}
type Cursor={id:string;user_id:string;name:string;x:number;y:number;updated_at:string}
const accountQueries=useAccountQueries(),auth=useAuthStore(),supabase=useNuxtApp().$supabase
const base=`/api/projects/${props.project.id}/spaces`,space=ref(''),spaces=ref<Space[]>([]),objects=ref<Item[]>([]),cursors=ref<Cursor[]>([])
const cursorStatus=ref('Подключение курсоров…')
const error=ref(''),connected=ref(false),busy=ref(false),title=ref(''),selected=ref(''),tool=ref('select'),editing=ref(''),draft=ref('')
const currentSpace=computed(()=>spaces.value.find(s=>s.id===space.value))
const canCreate=computed(()=>['owner','editor'].includes(props.project.permission))
const editable=computed(()=>['owner','editor'].includes(currentSpace.value?.permission||props.project.permission))
const canManage=computed(()=>currentSpace.value?.created_by===auth.user?.id)
const docs=useProjectDocuments(()=>props.project.id),images=ref<Record<string,string>>({}),fileInput=ref<HTMLInputElement>(),canvas=ref<HTMLElement>()
const root=ref<HTMLElement>(),fullscreen=ref(false),headerOpen=ref(false)
const imagePreview = ref<{ file: ProjectDocument; item: Item } | null>(null)
const officePreview = ref<{ file: ProjectDocument; item: Item } | null>(null)
const officePreviewContent = ref<SpaceFileThumbnail | null>(null)
const webLinkEditor = ref<{ id?: string; revision?: number } | null>(null)
const webLinkForm = reactive({ name: '', url: '' })
const webLinkError = ref('')
watch(() => [auth.user?.id, props.project.id, space.value], () => {
  imagePreview.value = null
  officePreview.value = null
  webLinkEditor.value = null
})
const serviceTabs = useServiceTabsStore(), office = useOffice(), route = useRoute()
const workspaceTabId = serviceTabs.activeId
let headerArmed=false
function focusBoard(){const active=document.activeElement;if(active instanceof HTMLElement&&root.value?.contains(active))active.blur();void nextTick(()=>canvas.value?.focus({preventScroll:true}))}
function hideFullscreenHeader(){headerOpen.value=false;headerArmed=false;focusBoard()}
watch(fullscreen,value=>{if(value)hideFullscreenHeader();else headerOpen.value=false})
function headerPointer(e:PointerEvent){if(!fullscreen.value||spaceHeld.value)return;const y=e.clientY-(root.value?.getBoundingClientRect().top||0),height=root.value?.querySelector<HTMLElement>('.space-header')?.offsetHeight||90;if(y>height+12){headerArmed=true;headerOpen.value=false}else if(headerArmed&&y<=16)headerOpen.value=true}

const history=ref<{id:string;x:number;y:number;zoom:number}[]>([]),spaceHeld=ref(false),controlsOpen=ref(false)
const hoveredComment=ref(''),pinnedComment=ref('')
let lastDragEnd=0
let commentHide:ReturnType<typeof setTimeout>|undefined
const popupComment=computed(()=>visibleObjects.value.find(i=>i.data.kind==='comment'&&i.id===(pinnedComment.value||hoveredComment.value)))
function hoverComment(id:string){clearTimeout(commentHide);hoveredComment.value=id}
function leaveComment(){commentHide=setTimeout(()=>{hoveredComment.value=''},180)}
function pinComment(item:Item){if(Date.now()-lastDragEnd<200)return;selected.value=item.id;pinnedComment.value=pinnedComment.value===item.id?'':item.id}
function commentPosition(){const item=popupComment.value;if(!item)return {};return{left:Math.max(10,Math.min(offset.x+item.data.x*zoom.value+42,(canvas.value?.clientWidth||800)-340))+'px',top:Math.max(10,Math.min(offset.y+item.data.y*zoom.value,(canvas.value?.clientHeight||600)-340))+'px'}}
const selection=ref(new Set<string>()),groupDialog=ref<'copy'|'move'|null>(null),groupTarget=ref(''),boxSelection=ref<{x:number;y:number;endX:number;endY:number;add:boolean;base:string[]}|null>(null)
const selectedRows=computed(()=>objects.value.filter(i=>selection.value.has(i.id)))
function replaceSelection(ids:string[]){selection.value=new Set(ids);selected.value=ids[ids.length-1]||''}
watch(selected,id=>{if(!id)selection.value=new Set();else if(!selection.value.has(id))selection.value=new Set([id])})
function clickSelect(item:Item,shift=false){if(shift){const ids=new Set(selection.value);if(ids.has(item.id))ids.delete(item.id);else ids.add(item.id);replaceSelection([...ids]);return}if(!selection.value.has(item.id))replaceSelection([item.id]);else selected.value=item.id}
async function groupAction(mode:'copy'|'move'|'delete'){const objectsToProcess=new Set(selectedRows.value.flatMap(item=>item.data.layerGroup?[item,...layerDescendants(item.id)]:[item]));const items=[...objectsToProcess].map(({id,revision})=>({id,revision}));if(!items.length)return;await run(async()=>{await sharedRequest(`${base}/group?space=${space.value}`,{method:'POST',body:{mode,items,...(mode==='delete'?{}:{target:groupTarget.value})}});groupDialog.value=null;if(mode!=='copy'){stopUndoHistory();replaceSelection([])}})}
function boxStyle(){const box=boxSelection.value;if(!box)return {};return {left:(Math.min(box.x,box.endX)*zoom.value+offset.x)+'px',top:(Math.min(box.y,box.endY)*zoom.value+offset.y)+'px',width:(Math.abs(box.endX-box.x)*zoom.value)+'px',height:(Math.abs(box.endY-box.y)*zoom.value)+'px'}}
function updateBox(){const box=boxSelection.value;if(!box)return;const ids=box.add?[...box.base]:[],left=Math.min(box.x,box.endX),right=Math.max(box.x,box.endX),top=Math.min(box.y,box.endY),bottom=Math.max(box.y,box.endY);for(const item of visibleObjects.value){const el=canvas.value?.querySelector<HTMLElement>(`[data-object-id="${item.id}"]`);let x=item.data.x,y=item.data.y,w=el?.offsetWidth||item.data.width||220,h=el?.offsetHeight||item.data.height||110;if(item.data.kind==='stroke'&&item.data.points?.length){const xs=item.data.points.map(p=>p[0]),ys=item.data.points.map(p=>p[1]);x+=Math.min(...xs);y+=Math.min(...ys);w=Math.max(...xs)-Math.min(...xs);h=Math.max(...ys)-Math.min(...ys)}else if(item.data.kind==='link'){const e=ends(item);if(!e)continue;x=Math.min(e.x1,e.x2);y=Math.min(e.y1,e.y2);w=Math.abs(e.x2-e.x1);h=Math.abs(e.y2-e.y1)}if(x>=left&&y>=top&&x+w<=right&&y+h<=bottom)ids.push(item.id)}replaceSelection([...new Set(ids)])}
const selectedItem=computed(()=>objects.value.find(item=>item.id===selected.value))
const lineDefaults=reactive({lineStyle:'straight' as 'straight'|'dashed'|'wavy',arrow:'forward' as 'none'|'forward'|'backward'|'both',color:'#64748b'})
const originalStyles=new Map<string,Item['data']>()
type UndoTarget = { id: string; beforeRevision: number; expectedRevision: number }
type UndoStep =
  | { kind: 'update'; targets: [UndoTarget]; before: Item['data'] }
  | { kind: 'create'; targets: [UndoTarget] }
  | { kind: 'layers'; targets: UndoTarget[]; before: SpaceLayerChange[] }

const undoSteps: UndoStep[] = []
let undoLimitReached = false
const undoScope = computed(() => [auth.user?.id, props.project.id, space.value].join(':'))
watch(undoScope, () => {
  undoLimitReached = false
  undoSteps.length = 0
}, { flush: 'sync' })
function stopUndoHistory() {
  undoLimitReached = true
  undoSteps.length = 0
}

function rememberUndo(step: UndoStep, scope: string) {
  if (scope !== undoScope.value || disposed) return
  undoSteps.push(step)
  if (undoSteps.length > 60) undoSteps.shift()
}
function changedTarget(id: string, revision: number): UndoTarget {
  return { id, beforeRevision: revision, expectedRevision: revision + 1 }
}

async function undoBoardChange() {
  if (!editable.value || busy.value || drag || resizing || inkDraft.value || erasing.value) return
  const staged = selectedItem.value
  if (staged && originalStyles.has(staged.id) && !nudgePositions.size) {
    cancelSelected()
    return
  }
  const scope = undoScope.value
  if (nudgePositions.size) await flushNudge()
  if (scope !== undoScope.value) return
  const step = undoSteps.at(-1)
  if (!step) {
    if (undoLimitReached) error.value = 'Предыдущее действие нельзя отменить.'
    return
  }
  const target = step.targets[0]!
  if (step.kind === 'create' && objects.value.some(({ data }) =>
    data.parentId === target.id || data.from === target.id || data.to === target.id)) {
    undoSteps.pop()
    error.value = 'С этим объектом уже связаны другие элементы. Отменить его создание нельзя.'
    return
  }
  const matches = step.targets.every(({ id, expectedRevision }) =>
    objects.value.some(item => item.id === id && item.revision === expectedRevision) && !originalStyles.has(id))
  if (!matches) {
    undoSteps.pop()
    error.value = 'Объекты уже изменились. Это действие больше нельзя отменить.'
    return
  }
  const done = await run(async () => {
    if (step.kind === 'update') await send('put', target.id, step.before, target.expectedRevision)
    else if (step.kind === 'create') await send('delete', target.id, {}, target.expectedRevision)
    else await writeLayers(step.before.map((change, index) => ({
      ...change, revision: step.targets[index]!.expectedRevision
    })))
  })
  if (!done || scope !== undoScope.value) return
  undoSteps.pop()
  for (const target of step.targets) {
    const earlier = undoSteps.findLast(entry => entry.targets.some(candidate => candidate.id === target.id))
      ?.targets.find(candidate => candidate.id === target.id)
    if (earlier?.expectedRevision === target.beforeRevision) earlier.expectedRevision = target.expectedRevision + 1
  }
}
function stage(item:Item,patch:Partial<Item['data']>){selected.value=item.id;if(!originalStyles.has(item.id))originalStyles.set(item.id,structuredClone(toRaw(item.data)));Object.assign(item.data,patch)}
function styleSelected(patch:Partial<Item['data']>){const item=selectedItem.value;if(item&&!busy.value)stage(item,patch)}
async function applySelected(){const item=selectedItem.value;if(!item)return;await put(item,{...item.data});if(!error.value){originalStyles.delete(item.id);await load()}}
function cancelSelected(){const item=selectedItem.value,original=item&&originalStyles.get(item.id);if(item&&original){item.data=original;originalStyles.delete(item.id)}}
let fullscreenPending = false
async function toggleFullscreen() {
  if (!root.value || fullscreenPending) return
  if (fullscreen.value && document.fullscreenElement !== root.value) {
    fullscreen.value = false
    return
  }
  fullscreenPending = true
  try {
    if (document.fullscreenElement === root.value) await document.exitFullscreen()
    else if (root.value.requestFullscreen) await root.value.requestFullscreen()
    else fullscreen.value = true
  } catch {
    fullscreen.value = document.fullscreenElement === root.value || !fullscreen.value
  } finally {
    fullscreenPending = false
  }
}
function fullscreenChanged(){fullscreen.value=document.fullscreenElement===root.value}
function escapeFullscreen(e:KeyboardEvent){if(e.key==='Escape'&&!document.fullscreenElement)fullscreen.value=false}
const offset=reactive({x:150,y:100}),zoom=ref(1),session=crypto.randomUUID(),now=ref(Date.now())
function color(id:string){const ids=[...new Set([...props.project.members.map(m=>m.userId),props.project.ownerId,...cursors.value.map(c=>c.user_id)])].sort();return `hsl(${(Math.max(0,ids.indexOf(id))*137.508)%360} 72% 43%)`}
const visibleCursors=computed(()=>cursors.value.filter(c=>c.id!==session&&now.value-new Date(c.updated_at).getTime()<15000))
let channel:RealtimeChannel|null=null,timer:ReturnType<typeof setInterval>,refreshTimer:ReturnType<typeof setTimeout>|undefined,disposed=false,epoch=0
async function load(){const current=space.value,version=++epoch;try{const result=await sharedRequest<{spaces:typeof spaces.value;objects:Item[];cursors:Cursor[]}>(`${base}${current?`?space=${current}`:''}`);if(disposed||version!==epoch||current!==space.value)return;spaces.value=result.spaces;if(current&&!result.spaces.some(s=>s.id===current)){space.value='';objects.value=[];return}objects.value=result.objects.map(item=>(drag?.id===item.id||drag?.children?.some(child=>child.id===item.id)||resizing?.id===item.id||nudgePositions.has(item.id)||originalStyles.has(item.id))?objects.value.find(old=>old.id===item.id)||item:item);if([...selection.value].some(id=>!objects.value.some(i=>i.id===id)))replaceSelection([...selection.value].filter(id=>objects.value.some(i=>i.id===id)));await loadResources();if(objects.value.some(i=>i.data.kind==='subscription'))await loadSubscriptions();await loadImages();void loadThumbnails()}catch(e:any){error.value=e.data?.message||'Не удалось загрузить пространство'}}
function queue(){if(!refreshTimer)refreshTimer=setTimeout(()=>{refreshTimer=undefined;void load()},250)}
async function send(action:string,id:string=session,data:Record<string,unknown>={},revision=0){return sharedRequest(base,{method:'POST',body:{space:space.value,id,action,revision,data:Object.fromEntries(Object.entries(data).filter(([key])=>key!=='messages'))}})}
async function run(fn:()=>Promise<unknown>){error.value='';busy.value=true;try{await fn();await load();return true}catch(e:any){error.value=e.data?.message||'Не удалось сохранить изменения';await load();return false}finally{busy.value=false}}
async function create(){if(!title.value.trim())return;const id=crypto.randomUUID();await run(async()=>{await sharedRequest(base,{method:'POST',body:{space:id,id,action:'create',data:{name:title.value.trim()}}});await choose(id);title.value=''})}
async function choose(id:string,remember=false,view?:{x:number;y:number;zoom:number}){if(id===space.value)return;await flushNudge();if(remember&&space.value)history.value.push({id:space.value,x:offset.x,y:offset.y,zoom:zoom.value});else if(!remember&&!view)history.value=[];objects.value=[];space.value=id;cursorPoint=null;replaceSelection([]);editing.value='';pinnedComment.value='';hoveredComment.value='';offset.x=view?.x??150;offset.y=view?.y??100;zoom.value=view?.zoom??1;await load()}
async function goBack(){let previous=history.value.pop();while(previous&&!spaces.value.some(s=>s.id===previous!.id))previous=history.value.pop();if(previous)await choose(previous.id,false,previous)}
function point(e:PointerEvent|WheelEvent){const r=canvas.value!.getBoundingClientRect();return{x:(e.clientX-r.left-offset.x)/zoom.value,y:(e.clientY-r.top-offset.y)/zoom.value}}
async function add(kind:string,fileId?:string,extra:Partial<Item['data']>={}){const id=crypto.randomUUID();const saved=await createBoardItem(id,{kind,x:(350-offset.x)/zoom.value,y:(220-offset.y)/zoom.value,text:kind==='todo'?'[ ] Первая задача':kind==='spec'?'# Без названия\n\nНачните описывать требования…':kind==='comment'?'Комментарий':kind==='text'?'Текст':kind==='frame'?'Контурный блок':kind==='shape'?'Новый блок':'Новая заметка',...(kind==='table'?{rows:[['Столбец 1','Столбец 2','Столбец 3'],['','',''],['','','']],width:440}:{}),...(kind==='spec'?{width:520,height:420}:{}),...(kind==='frame'?{borderColor:'#7c3aed',borderWidth:2,width:320,height:200}:{}),...(fileId?{fileId}:{}),...(kind==='calendar'?{calendarEvents:[],width:560,height:430}:{}),...(kind==='task-calendar'?{width:620,height:410}:kind==='task-gantt'||kind==='booking-gantt'?{width:1040,height:420}:kind==='booking-calendar'?{width:660,height:430}:{}),...extra});if(objects.value.some(i=>i.id===id))selected.value=id;return saved?id:undefined}
async function createBoardItem(id: string, data: Record<string, unknown>) {
  const scope = undoScope.value
  if (await run(() => send('put', id, data))) {
    rememberUndo({ kind: 'create', targets: [changedTarget(id, 0)] }, scope)
    return true
  }
  return false
}
async function put(item: Item, data: Item['data'], previous = item.data) {
  const scope = undoScope.value
  const before = structuredClone(toRaw(originalStyles.get(item.id) ?? previous))
  const target = changedTarget(item.id, item.revision)
  originalStyles.delete(item.id)
  if (JSON.stringify(before) === JSON.stringify(data)) return true
  if (await run(() => send('put', item.id, data, target.beforeRevision))) {
    rememberUndo({ kind: 'update', targets: [target], before }, scope)
    return true
  }
  return false
}

function openWebLinkEditor(item?: Item) {
  if (!space.value || !editable.value || busy.value) return
  webLinkForm.name = item?.data.name ?? ''
  webLinkForm.url = item?.data.url ?? ''
  webLinkError.value = ''
  webLinkEditor.value = { id: item?.id, revision: item?.revision }
}

async function saveWebLink() {
  const editor = webLinkEditor.value
  if (!editor || !space.value || !editable.value || busy.value) return
  const url = spaceWebLinkUrl(webLinkForm.url)
  if (!url) {
    webLinkError.value = 'Введите действительный адрес, начинающийся с https:// или http://.'
    return
  }
  const name = webLinkForm.name.trim() || undefined
  webLinkError.value = ''
  const item = editor.id ? objects.value.find(item => item.id === editor.id) : undefined
  if (editor.id && (!item || item.revision !== editor.revision)) {
    webLinkError.value = 'Карточка изменилась. Закройте форму и снова откройте карточку.'
    return
  }
  const saved = item
    ? await put(item, { ...item.data, name, url })
    : await add('web-link', undefined, { name, url, text: undefined })
  if (webLinkEditor.value !== editor) return
  if (saved) webLinkEditor.value = null
  else webLinkError.value = error.value || 'Не удалось сохранить ссылку.'
}
function select(item:Item){if(tool.value==='link'&&(item.data.layerGroup||selectedItem.value?.data.layerGroup)){replaceSelection([]);return}if(tool.value==='link'&&selected.value&&selected.value!==item.id){const from=selected.value;void createBoardItem(crypto.randomUUID(),{kind:'link',x:0,y:0,from,to:item.id,...lineDefaults});tool.value='select'}selected.value=item.id}
let cursorPoint:{x:number;y:number}|null=null
let cursorChannel:RealtimeChannel|null=null,cursorEpoch=0,realtimeReady=false,stopCursorWatch:(()=>void)|undefined
async function openCursors(id:string){
 const attempt=++cursorEpoch,previous=cursorChannel;cursorChannel=null;cursors.value=[];cursorStatus.value='Подключение курсоров…'
 if(previous){if(previous.state==='joined')void previous.send({type:'broadcast',event:'leave',payload:{id:session}});await supabase.removeChannel(previous)}
 if(disposed||attempt!==cursorEpoch||!id||!realtimeReady)return
 cursorChannel=supabase.channel(`space-cursors:${id}`,{config:{private:true,broadcast:{self:false}}})
 .on('broadcast',{event:'cursor'},({payload})=>{
  if(attempt!==cursorEpoch||!payload||typeof payload.id!=='string'||payload.id===session||typeof payload.user_id!=='string'||typeof payload.name!=='string'||!Number.isFinite(payload.x)||!Number.isFinite(payload.y)||Math.abs(payload.x)>1e7||Math.abs(payload.y)>1e7)return
  const cursor:Cursor={id:payload.id,user_id:payload.user_id,name:payload.name.slice(0,120),x:payload.x,y:payload.y,updated_at:new Date().toISOString()}
  const index=cursors.value.findIndex(c=>c.id===cursor.id);if(index<0){if(cursors.value.length<200)cursors.value.push(cursor)}else cursors.value[index]=cursor
 }).on('broadcast',{event:'leave'},({payload})=>{if(attempt===cursorEpoch)cursors.value=cursors.value.filter(c=>c.id!==payload?.id)})
 .subscribe(status=>{if(attempt!==cursorEpoch)return;cursorStatus.value=status==='SUBSCRIBED'?'Курсоры онлайн':status==='CHANNEL_ERROR'||status==='TIMED_OUT'?'Курсоры: переподключение…':'Подключение курсоров…';if(status==='SUBSCRIBED')heartbeat()})
}
function heartbeat(){if(!space.value||!cursorPoint||document.visibilityState!=='visible'||cursorChannel?.state!=='joined')return;const name=props.project.members.find(m=>m.userId===auth.user?.id)?.fullName||auth.user?.email||'Участник';void cursorChannel.send({type:'broadcast',event:'cursor',payload:{...cursorPoint,id:session,user_id:auth.user?.id,name}})}
let drag:{id:string;x:number;y:number;ox:number;oy:number;moved:boolean;children?:{id:string;x:number;y:number}[]}|null=null,lastCursor=0,cursorTimer:ReturnType<typeof setTimeout>|undefined
function down(e:PointerEvent,item?:Item){stopCameraTransition();if(!typingTarget(e.target)){e.preventDefault();window.getSelection()?.removeAllRanges()}if(item&&tool.value==='select'&&!e.altKey)item=outerLayerGroup(item);if(e.button!==0&&e.button!==1)return;if(!spaceHeld.value&&['pen','highlighter','eraser'].includes(tool.value)){startInk(e);return}if(!spaceHeld.value&&e.button===0&&editable.value&&['comment','text'].includes(tool.value)){const kind=tool.value,p=point(e);tool.value='select';void add(kind,undefined,p).then(id=>{if(!id)return;if(kind==='comment')pinnedComment.value=id;else{editing.value=id;draft.value='Текст'}});return}if(!item){pinnedComment.value='';hoveredComment.value=''};if(!item&&tool.value==='select'&&!spaceHeld.value&&e.button===0){const p=point(e);boxSelection.value={x:p.x,y:p.y,endX:p.x,endY:p.y,add:e.shiftKey,base:e.shiftKey?[...selection.value]:[]};if(!e.shiftKey)replaceSelection([]);(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);return}if(item&&tool.value!=='hand'&&!spaceHeld.value&&e.button!==1){if(tool.value==='select'){clickSelect(item,e.shiftKey);if(e.shiftKey)return}else select(item);if(!editable.value||busy.value||tool.value==='hand'||editing.value===item.id||tool.value==='link')return;if(nudgePositions.size){void flushNudge();return}}else if(!spaceHeld.value&&tool.value!=='hand'&&e.button!==1)selected.value='';drag={id:tool.value==='hand'||spaceHeld.value||e.button===1?'':item?.id||'',x:e.clientX,y:e.clientY,ox:tool.value==='hand'||spaceHeld.value||e.button===1?offset.x:item?.data.x??offset.x,oy:tool.value==='hand'||spaceHeld.value||e.button===1?offset.y:item?.data.y??offset.y,moved:false};if(item?.data.kind==='frame'&&drag.id)drag.children=layerDescendants(item.id).map(child=>({id:child.id,x:child.data.x,y:child.data.y}));(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}
function move(e:PointerEvent){if(!space.value)return;const p=point(e);cursorPoint=p;if(Date.now()-lastCursor>60){lastCursor=Date.now();heartbeat()}else if(!cursorTimer){cursorTimer=setTimeout(()=>{cursorTimer=undefined;lastCursor=Date.now();heartbeat()},60)}if(boxSelection.value){boxSelection.value.endX=p.x;boxSelection.value.endY=p.y;updateBox();return}if(inkDraft.value){const data=inkDraft.value,points=data.points!,last=points[points.length-1]!,next:[number,number]=[p.x-data.x,p.y-data.y];if(points.length<3000&&Math.hypot(next[0]-last[0],next[1]-last[1])>1/zoom.value)points.push(next);return}if(erasing.value){eraseAt(p);return}if(resizing){resizeMove(e);return}if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.moved ||= Math.abs(dx)+Math.abs(dy)>3;if(drag.id){const item=objects.value.find(i=>i.id===drag!.id);if(item){item.data.x=drag.ox+dx/zoom.value;item.data.y=drag.oy+dy/zoom.value;for(const start of drag.children||[]){const child=layers.value.byId.get(start.id);if(child){child.data.x=start.x+dx/zoom.value;child.data.y=start.y+dy/zoom.value}}}}else{offset.x=drag.ox+dx;offset.y=drag.oy+dy}}
function up(){if(boxSelection.value){updateBox();boxSelection.value=null;return}if(inkDraft.value||erasing.value){void finishInk();return}if(resizing){const r=resizing;resizing=null;const item=objects.value.find(i=>i.id===r.id);if(item&&r.moved)void put(item,{...item.data},r.before);return}const d=drag;drag=null;if(d?.moved)lastDragEnd=Date.now();if(d?.id&&d.moved){const item=objects.value.find(i=>i.id===d.id);if(item)void finishLayerDrag(item, [{id:item.id,x:d.ox,y:d.oy}, ...(d.children||[])])}}
function wheel(e:WheelEvent){stopCameraTransition();const p=point(e),r=canvas.value!.getBoundingClientRect();zoom.value=Math.max(.15,Math.min(3,zoom.value*Math.exp(-e.deltaY*.001)));offset.x=e.clientX-r.left-p.x*zoom.value;offset.y=e.clientY-r.top-p.y*zoom.value}
const draftTodos=ref<{text:string;done:boolean}[]>([])
function edit(item:Item){if(item.data.kind==='web-link'){openWebLinkEditor(item);return}if(item.data.kind==='space'){if(spaces.value.some(s=>s.id===item.data.targetSpace))void choose(item.data.targetSpace!,true);return}if(!editable.value||['image','document','table','comment','task','password','chat','person','stroke','subscription','calendar','task-calendar','task-gantt','booking','booking-calendar','booking-gantt'].includes(item.data.kind))return;editing.value=item.id;draft.value=item.data.text||'';if(item.data.kind==='todo')draftTodos.value=(item.data.text||'').split('\n').map(line=>({text:line.replace(/^\[[ x]\]\s*/,''),done:line.startsWith('[x]')}))}
async function saveEdit(item:Item){const text=item.data.kind==='todo'?draftTodos.value.map(row=>(row.done?'[x] ':'[ ] ')+row.text).join('\n'):draft.value;editing.value='';await put(item,{...item.data,text})}
function file(item:Item){return item.data.assetId?assets.value.find(f=>f.id===item.data.assetId):docs.query.data.value?.find(f=>f.id===item.data.fileId)}
async function fileContent(f:ProjectDocument){return assets.value.some(a=>a.id===f.id)?sharedRequest<Blob>(`${base}/${space.value}/files/${f.id}`,{responseType:'blob'}):docs.content(f)}
async function open(item: Item, download = false, inEditor = false) {
  const fileToOpen = file(item)
  if (!fileToOpen) return
  if (!download && !inEditor && isImage(item)) {
    resetKeys()
    imagePreview.value = { file: fileToOpen, item }
    return
  }
  if (!download && !inEditor && isPreviewDocument(item)) {
    resetKeys()
    officePreview.value = { file: fileToOpen, item }
    return
  }
  imagePreview.value = null
  officePreview.value = null
  await run(async () => {
    if (download || !documentEditor(fileToOpen.name)) {
      await saveFile(await fileContent(fileToOpen), fileToOpen.name)
      return
    }
    if (document.fullscreenElement === root.value) await document.exitFullscreen()
    if (item.data.assetId) {
      await office.openAttachment({ kind: 'space', projectId: props.project.id, spaceId: space.value, fileId: fileToOpen.id })
    } else {
      await office.openSource({ kind: 'document', projectId: props.project.id, fileId: fileToOpen.id })
    }
  })
}
function isImage(item: Item) {
  const attachment = file(item)
  return item.data.kind === 'image' || !!attachment && (canPreviewProjectImage(attachment.name) || attachment.type.startsWith('image/'))
}
function imageSource(item: Item) {
  if (!isImage(item) || item.data.showContent === false) return undefined
  return images.value[file(item)?.id || '']
}
function hideFailedImage(item: Item, event: Event) {
  const attachment = file(item)
  const source = (event.currentTarget as HTMLImageElement).src
  if (!attachment || images.value[attachment.id] !== source) return
  URL.revokeObjectURL(source)
  images.value[attachment.id] = ''
}
function isPreviewDocument(item: Item) {
  const attachment = file(item)
  const editor = attachment && documentEditor(attachment.name)?.key
  return editor === 'gridcraft' || editor === 'wordcraft' || editor === 'pdfcraft'
}
function hasFileDisplayOptions(item: Item) {
  return isImage(item) || isPreviewDocument(item)
}
function fileContentOnly(item: Item) {
  return item.data.showContent !== false && (item.data.contentOnly ?? item.data.imageOnly === true)
}
function fileDisplay(item: Item) {
  if (item.data.showContent === false) return 'filename'
  return fileContentOnly(item) ? 'content' : 'card'
}
function setFileDisplay(mode: string) {
  styleSelected({ showContent: mode !== 'filename', contentOnly: mode === 'content' })
  if (mode !== 'filename') void loadThumbnails()
}
const loadingImages = new Set<string>()
async function loadImages() {
  for (const item of objects.value.filter(isImage)) {
    const attachment = file(item)
    if (!attachment || Object.hasOwn(images.value, attachment.id) || loadingImages.has(attachment.id)) continue
    loadingImages.add(attachment.id)
    try {
      const blob = await fileContent(attachment)
      const preview = await projectImagePreview(blob, attachment.name, attachment.type)
      if (!disposed) images.value[attachment.id] = URL.createObjectURL(preview)
    } catch {
      // Keep the filename and file actions available when the preview cannot be decoded.
    } finally {
      loadingImages.delete(attachment.id)
    }
  }
}
watch(docs.query.data,()=>void loadImages())
async function upload(e:Event){pendingFile.value=(e.target as HTMLInputElement).files?.[0]||null;(e.target as HTMLInputElement).value=''; }
const attaching=ref(false)

const assets=ref<ProjectDocument[]>([]),passwords=ref<ProjectPassword[]>([]),passwordChoices=ref<ProjectPasswordChoice[]>([]),chats=ref<ProjectChat[]>([]),taskResources=ref<Record<string,{title:string;completed:boolean;projectId?:string;vaultId?:string}>>({}),revealed=reactive<Record<string,boolean>>({})
const bookingTools = ref(false)
const bookingPicker = ref(false)
watch(space, () => { bookingTools.value = false; bookingPicker.value = false })
function attachBooking(booking: MeetingRoomReference) {
  if (space.value && editable.value) void add('booking', undefined, { bookingId: booking.id, text: booking.title, width: 265 })
}
function addBookingPlanning(kind: 'booking-calendar' | 'booking-gantt') {
  bookingTools.value = false
  if (space.value && editable.value) void add(kind)
}
const resourcePanel=ref<'password'|'chat'|'person'|'shape'|'subscription'|null>(null),resourceSearch=ref(''),newPassword=ref(false),passwordForm=reactive({title:'',url:'',username:'',password:'',notes:''}),personRole=ref(''),personDuty=ref(''),taskPicker=ref(false)
const pendingFile=shallowRef<File|null>(null),saveToDocuments=ref(false),folderDestination=ref(''),taskResume=ref(false)
async function loadResources(){const id=space.value;if(!id){assets.value=[];return}const results=await Promise.allSettled([sharedRequest<ProjectDocument[]>(`${base}/${id}/files`),sharedRequest<Record<string,any>>(`${base}/resources?space=${id}`),sharedRequest<ProjectPassword[]>(`/api/projects/${props.project.id}/passwords`),sharedRequest<ProjectChat[]>(`/api/projects/${props.project.id}/chats`)]);if(id!==space.value||disposed)return;assets.value=results[0]!.status==='fulfilled'?results[0]!.value:[];taskResources.value=results[1]!.status==='fulfilled'?results[1]!.value:{};passwords.value=results[2]!.status==='fulfilled'?results[2]!.value:[];chats.value=results[3]!.status==='fulfilled'?results[3]!.value:[]}
function passwordFor(item:Item){return passwords.value.find(p=>p.id===item.data.passwordId)}
function chatFor(item:Item){return chats.value.find(c=>c.id===item.data.chatId)}
function taskUrl(item:Item){const task=taskResources.value[item.id];return task?.projectId?`/projects/${task.projectId}/tasks?task=${item.data.taskId}`:`/kaban?vault=${task?.vaultId||'personal'}&task=${item.data.taskId}`}
async function showTaskPicker(){taskResume.value=fullscreen.value;if(document.fullscreenElement===root.value)await document.exitFullscreen();fullscreen.value=false;taskPicker.value=true}
function closeTaskPicker(){taskPicker.value=false;if(taskResume.value){fullscreen.value=true;void root.value?.requestFullscreen?.().catch(()=>{fullscreen.value=true})}taskResume.value=false}
async function attachTask(task:{taskId:string;boardId:string}){await add('task',undefined,{taskId:task.taskId,boardId:task.boardId})}
async function showPanel(panel:typeof resourcePanel.value){resourcePanel.value=panel;resourceSearch.value='';newPassword.value=false;if(panel==='subscription')await loadSubscriptions();if(panel==='password'){try{passwordChoices.value=await sharedRequest<ProjectPasswordChoice[]>(`/api/projects/${props.project.id}/passwords/choices`)}catch{passwordChoices.value=[]}}}
async function attachPassword(source?:ProjectPasswordChoice['source']){await run(async()=>{const result=await sharedRequest<{id:string}>(`/api/projects/${props.project.id}/passwords`,{method:'POST',body:source?{source}:{fields:{...passwordForm}}});const id=crypto.randomUUID();await send('put',id,{kind:'password',x:200,y:200,passwordId:result.id});resourcePanel.value=null;Object.assign(passwordForm,{title:'',url:'',username:'',password:'',notes:''})})}
function folderPath(id:string):string{const names:string[]=[],seen=new Set<string>();let current:string|null=id;while(current&&!seen.has(current)){seen.add(current);const folder=docs.folders.data.value?.find(f=>f.id===current);if(!folder)break;names.unshift(folder.name);current=folder.parentId}return '/'+names.join('/')}
async function confirmUpload(){const f=pendingFile.value;if(!f)return;await run(async()=>{const body=new FormData();body.append('file',f);if(saveToDocuments.value&&folderDestination.value)body.append('folderId',folderDestination.value);const result=await sharedRequest<{id:string}>(saveToDocuments.value?docs.base.value:`${base}/${space.value}/files`,{method:'POST',body});if(saveToDocuments.value)await docs.refresh();await send('put',crypto.randomUUID(),{kind:f.type.startsWith('image/')?'image':'document',x:200,y:150,...(saveToDocuments.value?{fileId:result.id}:{assetId:result.id})});pendingFile.value=null})}


const settingsOpen=ref(false),deleteConfirm=ref(false),spaceName=ref(''),spaceDescription=ref(''),portalOpen=ref(false),replyDrafts=reactive<Record<string,string>>({}),markdownInput=ref<HTMLInputElement>()
function settings(){spaceName.value=currentSpace.value?.name||'';spaceDescription.value=currentSpace.value?.description||'';settingsOpen.value=true;deleteConfirm.value=false}
async function saveSettings(){await run(()=>send('rename',session,{name:spaceName.value,description:spaceDescription.value}));if(!error.value)settingsOpen.value=false}
async function removeSpace(){await run(async()=>{await send('delete-space');space.value='';settingsOpen.value=false})}
function participantPermission(id:string){return currentSpace.value?.members.find(m=>m.user_id===id)?.permission||props.project.members.find(m=>m.userId===id)?.permission||'viewer'}
function author(id:string){return props.project.members.find(m=>m.userId===id)?.fullName||props.project.members.find(m=>m.userId===id)?.email||'Участник'}
async function reply(item:Item){const text=replyDrafts[item.id]?.trim();if(!text)return;await run(()=>send('reply',item.id,{text}));if(!error.value)replyDrafts[item.id]=''}
async function cell(item:Item,row:number,col:number,value:string){const rows=(item.data.rows||[]).map(r=>[...r]);rows[row]![col]=value;if(value!==(item.data.rows||[])[row]?.[col])stage(item,{rows})}
async function resizeTable(item:Item,axis:'row'|'column',remove=false){const rows=(item.data.rows||[['']]).map(r=>[...r]);if(axis==='row'){if(remove&&rows.length>1)rows.pop();else if(!remove&&rows.length<50)rows.push(Array(rows[0]!.length).fill(''))}else{for(const row of rows){if(remove&&row.length>1)row.pop();else if(!remove&&row.length<20)row.push('')}}stage(item,{rows})}
async function importMarkdown(e:Event){const f=(e.target as HTMLInputElement).files?.[0];if(!f)return;if(f.size>100000){error.value='Markdown должен быть не больше 100 КБ';return}const text=await f.text();if(text.length>50000){error.value='Текст должен содержать не больше 50 000 символов';return}const item=selectedItem.value;if(item?.data.kind==='spec')await put(item,{...item.data,text});else await add('spec',undefined,{text});(e.target as HTMLInputElement).value=''}
const inkColor=ref('#334155'),inkWidth=ref(3),inkDraft=ref<Item['data']|null>(null),erased=ref(new Set<string>()),erasing=ref(false)
function inkPath(data:Item['data']){return (data.points||[]).map((point,index)=>`${index?'L':'M'}${point[0]},${point[1]}`).join(' ')}
function startInk(e:PointerEvent){if(!editable.value||busy.value||e.button!==0)return;const p=point(e);if(tool.value==='eraser'){erasing.value=true;eraseAt(p)}else inkDraft.value={kind:'stroke',x:p.x,y:p.y,points:[[0,0],[.01,.01]],color:inkColor.value,strokeWidth:tool.value==='highlighter'?Math.max(12,inkWidth.value*4):inkWidth.value,opacity:tool.value==='highlighter'?.3:1};canvas.value?.setPointerCapture(e.pointerId)}
function eraseAt(p:{x:number;y:number}){for(const item of visibleObjects.value.filter(i=>i.data.kind==='stroke'&&!erased.value.has(i.id))){if(erased.value.size>=100)break;const points=item.data.points||[],local:[number,number]=[p.x-item.data.x,p.y-item.data.y],radius=12/zoom.value+(item.data.strokeWidth||3)/2;if(points.some((a,index)=>inkDistance(local,a,points[index+1]||a)<=radius))erased.value.add(item.id)}}
async function finishInk(){const data=inkDraft.value;inkDraft.value=null;if(data){await createBoardItem(crypto.randomUUID(),data);return}if(erasing.value){erasing.value=false;const ids=[...erased.value];if(ids.length && await run(()=>sharedRequest(`${base}/erase?space=${space.value}`,{method:'POST',body:{ids}})))stopUndoHistory();erased.value=new Set()}}
type CalendarEvent={id:string;title:string;start:string;end:string;color:string;type:'event'|'range'}
const subscriptions=ref<{source:any;title:string;sourceName:string;subscription:any}[]>([]),subCreating=ref(false),subForm=reactive({title:'',price:0,currency:'RUB',periodCount:1,periodUnit:'month',startsOn:new Date().toISOString().slice(0,10),paidUntil:new Date(Date.now()+30*86400000).toISOString().slice(0,10)})
async function loadSubscriptions(){try{subscriptions.value=await sharedRequest(`${base}/subscriptions?space=${space.value}`)}catch{subscriptions.value=[]}}
function subscriptionFor(item:Item){const source=item.data.subscriptionSource;return subscriptions.value.find(s=>s.source.kind===source?.kind&&s.source.sourceId===source?.sourceId&&s.source.entryId===source?.entryId)}
async function createSubscription(){await run(async()=>{const id=crypto.randomUUID(),now=new Date().toISOString();const entry:any={id,kind:'subscription',title:subForm.title,url:'',username:'',password:'',notes:'',categoryId:'',categoryIds:[],favorite:false,createdAt:now,updatedAt:now,financeSubscription:{id,label:'Подписка',value:'',type:'subscription',subscription:{price:subForm.price,currency:subForm.currency,periodCount:subForm.periodCount,periodUnit:subForm.periodUnit,startsOn:subForm.startsOn,paidFrom:subForm.startsOn,paidUntil:subForm.paidUntil,autoRenew:true}}};const card=await sharedRequest<{id:string}>('/api/shared-cards',{method:'POST',body:{entry,vaultIds:[]}});await accountQueries.invalidate('workspace','notifications');await send('put',crypto.randomUUID(),{kind:'subscription',x:200,y:200,subscriptionSource:{kind:'card',sourceId:card.id,entryId:id}});resourcePanel.value=null;await loadSubscriptions()})}
const calendarMonths=reactive<Record<string,string>>({}),calendarEditing=ref<Item|null>(null),calendarDraft=ref<CalendarEvent[]>([]),eventForm=reactive({title:'',start:'',end:'',color:'#8b5cf6',type:'event' as 'event'|'range'}),calendarError=ref('')
function monthValue(item:Item){return calendarMonths[item.id]||new Date().toLocaleDateString('sv-SE').slice(0,7)}
function monthTitle(item:Item){return new Date(monthValue(item)+'-01T12:00:00').toLocaleDateString('ru-RU',{month:'long',year:'numeric'})}
function moveMonth(item:Item,step:number){const date=new Date(monthValue(item)+'-01T12:00:00');date.setMonth(date.getMonth()+step);calendarMonths[item.id]=date.toLocaleDateString('sv-SE').slice(0,7)}
function monthDays(item:Item){const first=new Date(monthValue(item)+'-01T12:00:00'),shift=(first.getDay()+6)%7;return Array.from({length:42},(_,index)=>{const date=new Date(first);date.setDate(index-shift+1);return {date:date.toLocaleDateString('sv-SE'),day:date.getDate(),current:date.getMonth()===first.getMonth()}})}
function dayEvents(item:Item,day:string){return (item.data.calendarEvents||[]).filter(e=>new Date(e.start).toLocaleDateString('sv-SE')<=day&&new Date(e.end).toLocaleDateString('sv-SE')>=day)}
function openCalendar(item:Item,day?:string){if(!editable.value)return;calendarEditing.value=item;calendarDraft.value=structuredClone(toRaw(item.data.calendarEvents||[]));const date=day||new Date().toLocaleDateString('sv-SE');Object.assign(eventForm,{title:'',start:date+'T09:00',end:date+'T10:00',color:'#8b5cf6',type:'event'});calendarError.value=''}
const calendarEventForm=ref<HTMLFormElement>()
function addEvent(){if(!eventForm.title.trim()||!eventForm.start||!eventForm.end||eventForm.end<eventForm.start){calendarError.value='Укажите название и корректный интервал';return}calendarDraft.value.push({id:crypto.randomUUID(),title:eventForm.title.trim(),start:new Date(eventForm.start).toISOString(),end:new Date(eventForm.end).toISOString(),color:eventForm.color,type:eventForm.type});eventForm.title='';calendarError.value=''}
async function applyCalendar(){const item=calendarEditing.value;if(!item)return;if(eventForm.title.trim()){if(!calendarEventForm.value?.reportValidity())return;addEvent();if(calendarError.value)return}await put(item,{...item.data,calendarEvents:calendarDraft.value});if(!error.value)calendarEditing.value=null}
const thumbnails = ref<Record<string, SpaceFileThumbnail>>({})
const thumbnailLoading = reactive(new Set<string>())
const spreadsheetSheets = ref<Record<string, string[]>>({})
const transferInput = ref<HTMLInputElement>()

function spreadsheetOptions(item: Item, attachment = file(item)): SpaceSpreadsheetPreview | undefined {
  if (attachment && documentEditor(attachment.name)?.key === 'gridcraft') {
    return item.data.spreadsheetPreview ?? spaceSpreadsheetPreviewDefaults
  }
}
function spreadsheetFileKey(attachment: ProjectDocument) {
  return `${attachment.id}:${attachment.revision}`
}
function sheetNames(item: Item) {
  const attachment = file(item)
  return attachment ? spreadsheetSheets.value[spreadsheetFileKey(attachment)] : undefined
}
function selectedSheet(item: Item) {
  const sheet = spreadsheetOptions(item)?.sheet
  const names = sheetNames(item)
  return names?.find(name => name === sheet) ?? names?.[0] ?? ''
}
function setSpreadsheetSheet(item: Item, sheet: string) {
  if (sheetNames(item)?.includes(sheet)) {
    styleSelected({ spreadsheetPreview: { ...spreadsheetOptions(item)!, sheet } })
  }
}
function setSpreadsheetSize(item: Item, dimension: 'rows' | 'columns', event: Event) {
  const input = event.currentTarget as HTMLInputElement
  const options = spreadsheetOptions(item)!
  const value = input.valueAsNumber
  if (!Number.isInteger(value) || !input.validity.valid) {
    input.value = String(options[dimension])
    return
  }
  styleSelected({ spreadsheetPreview: { ...options, [dimension]: value } })
}
function thumbnailKey(item: Item, attachment = file(item)) {
  if (!attachment) return
  const options = spreadsheetOptions(item, attachment)
  const fileKey = spreadsheetFileKey(attachment)
  return options ? JSON.stringify([fileKey, options.sheet ?? '', options.rows, options.columns]) : fileKey
}
function fileThumbnail(item: Item) {
  if (item.data.kind !== 'document' || isImage(item) || item.data.showContent === false) return
  return thumbnails.value[thumbnailKey(item) ?? '']
}
function hasBoardFileContent(item: Item) {
  const thumbnail = fileThumbnail(item)
  return !!imageSource(item) || thumbnail?.kind === 'image' || thumbnail?.kind === 'cells'
}
function fetchThumbnail(item: Item, attachment: ProjectDocument, detail = false, signal?: AbortSignal) {
  const params = new URLSearchParams({ space: space.value, file: attachment.id, asset: String(!!item.data.assetId) })
  if (detail) params.set('detail', 'true')
  const options = spreadsheetOptions(item, attachment)
  if (options) {
    if (options.sheet) params.set('sheet', options.sheet)
    params.set('rows', String(options.rows))
    params.set('columns', String(options.columns))
  }
  return sharedRequest<SpaceFileThumbnail>(`${base}/thumbnail?${params}`, { signal })
}
let thumbnailsBusy = false
let thumbnailsQueued = false
async function loadThumbnails() {
  if (!space.value || disposed) return
  if (thumbnailsBusy) {
    thumbnailsQueued = true
    return
  }
  thumbnailsBusy = true
  thumbnailsQueued = false
  const scope = undoScope.value
  const activeKeys = new Set<string>()
  try {
    for (const item of objects.value) {
      if (scope !== undoScope.value || disposed) break
      if (item.data.kind !== 'document' || isImage(item)) continue
      const attachment = file(item)
      const key = thumbnailKey(item, attachment)
      if (!attachment || !key) continue
      if (item.data.showContent === false && !(selected.value === item.id && spreadsheetOptions(item, attachment))) continue
      activeKeys.add(key)
      if (thumbnails.value[key]) continue

      thumbnailLoading.add(key)
      try {
        const thumbnail = await fetchThumbnail(item, attachment)
        if (scope !== undoScope.value || disposed) break
        thumbnails.value[key] = thumbnail
        if (thumbnail.kind === 'cells') spreadsheetSheets.value[spreadsheetFileKey(attachment)] = thumbnail.sheets
      } catch {
        if (scope === undoScope.value && !disposed) thumbnails.value[key] = { kind: 'unavailable' }
      } finally {
        thumbnailLoading.delete(key)
      }
    }
    if (scope === undoScope.value && !thumbnailsQueued) {
      for (const key of Object.keys(thumbnails.value)) if (!activeKeys.has(key)) delete thumbnails.value[key]
    }
  } finally {
    thumbnailsBusy = false
    if (thumbnailsQueued || scope !== undoScope.value) void loadThumbnails()
  }
}
function retryThumbnail(item: Item) {
  const key = thumbnailKey(item)
  if (!key) return
  delete thumbnails.value[key]
  void loadThumbnails()
}
watch(docs.query.data, () => void loadThumbnails())
watch(undoScope, () => {
  thumbnails.value = {}
  spreadsheetSheets.value = {}
}, { flush: 'sync' })
watch(() => {
  const item = selectedItem.value
  return item && spreadsheetOptions(item) ? JSON.stringify([item.id, thumbnailKey(item)]) : null
}, () => void loadThumbnails())
watch(officePreview, async (preview, _, onCleanup) => {
  officePreviewContent.value = null
  if (!preview) return
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  try {
    const thumbnail = await fetchThumbnail(preview.item, preview.file, true, controller.signal)
    if (!controller.signal.aborted) officePreviewContent.value = thumbnail
  } catch (error: any) {
    if (!controller.signal.aborted) {
      const cached = error?.statusCode === 503 ? thumbnails.value[thumbnailKey(preview.item, preview.file) ?? ''] : undefined
      officePreviewContent.value = cached ?? { kind: 'unavailable' }
    }
  }
})
async function exportSpace(){await run(async()=>{const blob=await sharedRequest<Blob>(`${base}/export?space=${space.value}`,{responseType:'blob'});await saveFile(blob,`${currentSpace.value?.name||'space'}.zip`)})}
async function importSpace(e:Event){const f=(e.target as HTMLInputElement).files?.[0];if(!f)return;await run(async()=>{const body=new FormData();body.append('file',f);const result=await sharedRequest<{id:string}>(`${base}/import${space.value?'?space='+space.value:''}`,{method:'POST',body});if(result.id!==space.value)await choose(result.id);else await load()});(e.target as HTMLInputElement).value=''}
const tooltip=ref<{text:string;left:number;bottom:number}|null>(null)
function hudHover(e:Event){const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-tip]');if(!button||button.disabled){tooltip.value=null;return}const rect=button.getBoundingClientRect(),shell=canvas.value?.parentElement?.getBoundingClientRect();if(shell)tooltip.value={text:button.dataset.tip||'',left:Math.max(80,Math.min(rect.left-shell.left+rect.width/2,shell.width-80)),bottom:shell.bottom-rect.top+12}}
let resizing:{id:string;corner:string;pointerX:number;pointerY:number;x:number;y:number;width:number;height:number;moved:boolean;before:Item['data']}|null=null
function resizeStart(e:PointerEvent,item:Item,corner:string){if(!editable.value||busy.value||e.button!==0)return;if(spaceHeld.value){down(e);return}selected.value=item.id;drag=null;resizing={id:item.id,corner,pointerX:e.clientX,pointerY:e.clientY,x:item.data.x,y:item.data.y,width:item.data.width||(e.currentTarget as HTMLElement).closest('article')?.offsetWidth||220,height:item.data.height||(e.currentTarget as HTMLElement).closest('article')?.offsetHeight||110,moved:false,before:structuredClone(toRaw(item.data))};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)}
function resizeMove(e:PointerEvent){const r=resizing,item=objects.value.find(i=>i.id===r?.id);if(!r||!item)return;const dx=(e.clientX-r.pointerX)/zoom.value,dy=(e.clientY-r.pointerY)/zoom.value;r.moved ||= Math.abs(dx)+Math.abs(dy)>1;Object.assign(item.data,resizeFrame(r,r.corner,dx,dy,item.data.kind==='frame'?Infinity:2000))}
type BoardPosition = { id: string; x: number; y: number }
const nudgePositions = new Map<string, BoardPosition>()
let nudgeTimer: ReturnType<typeof setTimeout> | undefined
async function flushNudge() {
  clearTimeout(nudgeTimer)
  if (!nudgePositions.size) return
  const before = new Map(nudgePositions)
  nudgePositions.clear()
  const moved = objects.value.filter(({ id, data }) => {
    const position = before.get(id)
    return position && (position.x !== data.x || position.y !== data.y)
  }).map(({ id, revision, data: { x, y } }) => ({ id, revision, x, y }))
  await saveLayers([], moved, before)
}
function typingTarget(target:EventTarget|null){return target instanceof HTMLElement&&!!target.closest('input,textarea,select,[contenteditable=true],[role=textbox]')}
function resetKeys(){spaceHeld.value=false}
function keyUp(e:KeyboardEvent){if(e.code==='Space')spaceHeld.value=false}
function keyboard(e:KeyboardEvent){
 if(e.defaultPrevented||imagePreview.value||officePreview.value||webLinkEditor.value)return
 if(e.code==='Tab'&&fullscreen.value&&!settingsOpen.value&&!groupDialog.value){headerArmed=true;headerOpen.value=true}
 if(groupDialog.value||taskPicker.value||bookingPicker.value||resourcePanel.value||calendarEditing.value||pendingFile.value||settingsOpen.value)return
 if(space.value&&(e.ctrlKey||e.metaKey)&&e.code==='KeyF'){e.preventDefault();layerPanel.value?.focusSearch();return}
 if(typingTarget(e.target))return
 if (space.value && e.code === 'KeyZ' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey
   && serviceTabs.activeId === workspaceTabId
   && !(e.target instanceof Element && e.target.closest('[role="dialog"]'))) {
   if (!editable.value) return
   e.preventDefault()
   if (!e.repeat) void undoBoardChange()
   return
 }
 if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey
   && serviceTabs.activeId === workspaceTabId && root.value?.getClientRects().length
   && !(e.target instanceof Element && e.target.closest('[role="dialog"]'))) {
   e.preventDefault()
   if (!e.repeat) void toggleFullscreen()
   return
 }
 if(e.code==='Space'&&e.target instanceof Element&&e.target.closest('.layer-visibility:focus-visible'))return
 if(space.value&&e.code==='Space'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
   e.preventDefault()
   window.getSelection()?.removeAllRanges()
   if(!e.repeat)hideFullscreenHeader()
   spaceHeld.value=true
   return
 }
 if(space.value&&(e.ctrlKey||e.metaKey)&&!e.altKey&&e.code==='KeyG'){
   e.preventDefault()
   if(!e.repeat)void changeLayerGroup(e.shiftKey||(selection.value.size===1&&!!selectedItem.value?.data.layerGroup))
   return
 }
 if(e.target instanceof Element&&e.target.closest('.space-layers'))return
 if(e.code==='Escape'){if(pinnedComment.value||hoveredComment.value){pinnedComment.value='';hoveredComment.value=''}else if(editing.value)editing.value='';else{selected.value='';tool.value='select';controlsOpen.value=false;escapeFullscreen(e)}return}
 if(!space.value)return
 if((e.ctrlKey||e.metaKey)&&e.code==='KeyD'){e.preventDefault();const item=selectedItem.value;if(editable.value&&item&&!busy.value)void add(item.data.kind,item.data.fileId,{...item.data,x:item.data.x+30,y:item.data.y+30});return}
 if(e.ctrlKey||e.metaKey||e.altKey)return
 if(['Equal','NumpadAdd','Minus','NumpadSubtract','Digit0','Numpad0'].includes(e.code)){e.preventDefault();if(e.code==='Digit0'||e.code==='Numpad0'){zoom.value=1;offset.x=150;offset.y=100}else{const width=canvas.value?.clientWidth||700,height=canvas.value?.clientHeight||500,old=zoom.value;zoom.value=Math.max(.15,Math.min(3,old*(e.code==='Equal'||e.code==='NumpadAdd'?1.15:1/1.15)));offset.x=width/2-(width/2-offset.x)*zoom.value/old;offset.y=height/2-(height/2-offset.y)*zoom.value/old}return}
 if(e.code==='KeyV'){tool.value='select';return}if(e.code==='KeyH'){tool.value='hand';return}
 if(!editable.value||busy.value||drag||resizing)return
 if(e.code==='Delete'||e.code==='Backspace'){if(selectedRows.value.length){e.preventDefault();void groupAction('delete');pinnedComment.value=''}return}
 if(e.code.startsWith('Arrow')&&selectedItem.value){e.preventDefault();const item=selectedItem.value,step=e.shiftKey?10:1;const dx=e.code==='ArrowRight'?step:e.code==='ArrowLeft'?-step:0,dy=e.code==='ArrowDown'?step:e.code==='ArrowUp'?-step:0;for(const child of [item,...layerDescendants(item.id)]){if(child.data.kind==='link')continue;if(!nudgePositions.has(child.id))nudgePositions.set(child.id,{id:child.id,x:child.data.x,y:child.data.y});child.data.x+=dx;child.data.y+=dy}clearTimeout(nudgeTimer);nudgeTimer=setTimeout(()=>void flushNudge(),350);return}
 if(e.repeat)return
 if(e.code==='KeyT')tool.value='text';else if(e.code==='KeyC')tool.value='comment';else if(e.code==='KeyN')void add('note');else if(e.code==='KeyR')void add('frame');else if(e.code==='KeyL')tool.value='link';else if(e.code==='KeyB')tool.value='pen';else if(e.code==='KeyM')tool.value='highlighter';else if(e.code==='KeyE')tool.value='eraser';else if(e.code==='Enter'&&selectedItem.value){e.preventDefault();edit(selectedItem.value)}
}
function nodeStyle(item:Item){return{zIndex:layers.value.z.get(item.id),left:item.data.x+'px',top:item.data.y+'px',width:(item.data.width||(['table','spec'].includes(item.data.kind)?440:220))+'px',minHeight:(item.data.height||110)+'px','--board-card-height':item.data.height ? item.data.height+'px' : undefined,fontSize:(item.data.fontSize||14)+'px',fontFamily:item.data.fontFamily==='serif'?'Georgia,serif':item.data.fontFamily==='mono'?'monospace':'inherit',fontWeight:item.data.fontWeight||'normal',color:item.data.textColor||'#334155',background:item.data.kind==='frame'?'transparent':item.data.color||(item.data.kind==='shape'&&['diamond','triangle','hexagon'].includes(item.data.shape||'')?'#dbeafe':item.data.kind==='note'?'#fff3ae':'white'),...(item.data.kind==='frame'?{borderColor:item.data.borderColor||'#7c3aed',borderWidth:(item.data.borderWidth||2)+'px',boxShadow:'none',height:(item.data.height||200)+'px',padding:0}:{}),...(item.data.kind==='text'?{background:'transparent',border:0,boxShadow:'none',padding:'4px',minHeight:'32px'}:{}),...(item.data.kind==='comment'?{width:'32px',height:'32px',minHeight:'32px',border:0,background:'transparent',padding:0,boxShadow:'none'}:{})}}

function ends(item:Item){
 const a=objects.value.find(i=>i.id===item.data.from),b=objects.value.find(i=>i.id===item.data.to);if(!a||!b)return null
 function box(i:Item){const element=canvas.value?.querySelector<HTMLElement>(`[data-object-id="${i.id}"]`);return{x:i.data.x,y:i.data.y,width:element?.offsetWidth||220,height:element?.offsetHeight||110}}
 const first=box(a),second=box(b),ax=first.x+first.width/2,ay=first.y+first.height/2,bx=second.x+second.width/2,by=second.y+second.height/2
 const dx=bx-ax,dy=by-ay
 function reach(w:number,h:number){return Math.min(dx?Math.abs(w/2/dx):Infinity,dy?Math.abs(h/2/dy):Infinity)}
 if(!dx&&!dy)return null
 const t=reach(first.width,first.height),u=reach(second.width,second.height)
 return{x1:ax+dx*t,y1:ay+dy*t,x2:bx-dx*u,y2:by-dy*u}
}
function linkPath(item:Item){const e=ends(item);if(!e)return '';const {x1,y1,x2,y2}=e;if(item.data.lineStyle!=='wavy')return `M${x1},${y1}L${x2},${y2}`
 const dx=x2-x1,dy=y2-y1,length=Math.hypot(dx,dy);if(!length)return ''
 const steps=Math.max(12,Math.min(600,Math.ceil(length/4))),waves=Math.max(1,Math.round(length/40));let path=`M${x1},${y1}`
 for(let i=1;i<=steps;i++){const t=i/steps,shift=Math.sin(t*waves*Math.PI*2)*6;path+=`L${x1+dx*t-dy/length*shift},${y1+dy*t+dx/length*shift}`}return path
}
function changedObject(payload:any){const row=payload.new?.space_id?payload.new:payload.old;if(row?.space_id===space.value||objects.value.some(i=>i.id===row?.id))queue()}
const layerPanel = ref<InstanceType<typeof SpaceLayers>>()
const layers = computed(() => spaceLayers(objects.value))
const hiddenLayers = computed(() => spaceHiddenLayers(layers.value))
const visibleObjects = computed(() => objects.value.filter(item => !hiddenLayers.value.has(item.id)))
watch(hiddenLayers, (hidden, previous) => {
  const becameHidden = (id: string) => hidden.has(id) && !previous.has(id)
  if ([...selection.value].some(becameHidden)) replaceSelection([...selection.value].filter(id => !becameHidden(id)))
  if (becameHidden(editing.value)) editing.value = ''
  if (becameHidden(pinnedComment.value)) pinnedComment.value = ''
  if (becameHidden(hoveredComment.value)) hoveredComment.value = ''
})
const cameraMoving = ref(false)
let cameraTimer: ReturnType<typeof setTimeout> | undefined
const canShowTaskPlanning = computed(() => canViewProjectSection(props.project, 'tasks'))
const taskPlanning = useQuery({
  queryKey: computed(() => ['account', auth.user?.id, 'space-task-planning', props.project.id]),
  enabled: computed(() => !!auth.user && canShowTaskPlanning.value && visibleObjects.value.some(item => ['task-calendar', 'task-gantt'].includes(item.data.kind))),
  queryFn: ({ signal }) => sharedRequest<KabanWorkspace>(`/api/kaban?project=${props.project.id}`, { signal }),
  retry: false,
  refetchInterval: 30_000
})
const layerKinds: Record<string, [string, string]> = {
  group: ['Группа', 'group'],
  frame: ['Контур', 'square-dashed'], note: ['Заметка', 'sticky-note'], text: ['Текст', 'type'], todo: ['Список дел', 'list-todo'],
  shape: ['Фигура', 'square'], table: ['Таблица', 'table-2'], spec: ['Спецификация', 'clipboard-list'], comment: ['Комментарий', 'message-circle'],
  document: ['Документ', 'file-text'], image: ['Изображение', 'image'], link: ['Связь', 'move-up-right'], 'web-link': ['Веб-ссылка', 'link-2'], stroke: ['Рисунок', 'pencil'],
  subscription: ['Подписка', 'repeat-2'], calendar: ['Календарь', 'calendar-days'], task: ['Задача', 'columns-3'],
  'task-calendar': ['Календарь задач', 'calendar-days'], 'task-gantt': ['Диаграмма Ганта', 'chart-gantt'],
  booking: ['Бронь переговорной', 'calendar-clock'], 'booking-calendar': ['Календарь броней', 'calendar-days'], 'booking-gantt': ['Гант броней', 'chart-gantt'],
  chat: ['Чат проекта', 'messages-square'], person: ['Участник', 'user-round'], password: ['Пароль', 'key-round'], space: ['Пространство', 'orbit']
}
function layerLabel(item: Item) {
  const data = item.data
  const kind = layerKinds[data.layerGroup ? 'group' : data.kind]?.[0] ?? 'Элемент'
  if (data.kind === 'task') return taskResources.value[item.id]?.title || kind
  if (data.kind === 'password') return passwordFor(item)?.entry.title || kind
  if (data.kind === 'chat') return chatFor(item)?.name || kind
  if (data.kind === 'person') return author(data.personId || '')
  if (data.kind === 'subscription') return subscriptionFor(item)?.title || kind
  if (data.kind === 'web-link') return data.name || data.url || kind
  if (data.kind === 'space') return spaces.value.find(space => space.id === data.targetSpace)?.name || kind
  if (['table', 'calendar', 'task-calendar', 'task-gantt', 'booking-calendar', 'booking-gantt', 'link', 'stroke'].includes(data.kind)) return kind
  return file(item)?.name || data.name || data.text?.split('\n').find(line => line.trim())?.replace(/^(?:#+\s*|\[[ x]\]\s*)/, '') || kind
}
const layerRows = computed(() => layers.value.rows.map(({ item, depth, parent }) => {
  const data = item.data
  const [kind, icon] = layerKinds[data.layerGroup ? 'group' : data.kind] ?? ['Элемент', 'box']
  const title = layerLabel(item)
  const parentItem = parent && layers.value.byId.get(parent)
  const context = [kind, parentItem && layerLabel(parentItem)].filter(Boolean).join(' · ')
  const linked = data.from && data.to ? [data.from, data.to].map(id => layers.value.byId.get(id)).flatMap(item => item ? [layerLabel(item)] : []) : []
  const search = spaceSearchText([title, context, data.url, data.text, data.description, data.role, data.duty, file(item)?.type,
    ...linked, ...(data.rows ?? []).flat(), ...(data.calendarEvents ?? []).map(event => event.title), ...(data.messages ?? []).map(message => message.text)
  ].filter(Boolean).join(' '))
  return {
    id: item.id, depth, parent, title, kind: data.kind, icon: `i-lucide-${icon}`, context, search,
    hidden: hiddenLayers.value.has(item.id), hiddenByParent: !!parent && hiddenLayers.value.has(parent),
    hiddenByLink: data.kind === 'link' && [data.from, data.to].some(id => id && hiddenLayers.value.has(id)),
    hiddenDirectly: !!data.layerHidden
  }
}))
function layerDescendants(id: string) {
  const result: Item[] = []
  const queue = [...layers.value.children(id)]
  for (const item of queue) {
    result.push(item)
    queue.push(...layers.value.children(item.id))
  }
  return result
}
function outerLayerGroup(item: Item) {
  let outer = item
  for (let parent = layers.value.parents.get(item.id); parent; parent = layers.value.parents.get(parent)) {
    const candidate = layers.value.byId.get(parent)
    if (candidate?.data.layerGroup) outer = candidate
  }
  return outer
}
function itemBounds(item: Item) {
  const { x, y, points, width, height } = item.data
  if (item.data.kind === 'link') {
    const line = ends(item)
    if (line) return { x: Math.min(line.x1, line.x2), y: Math.min(line.y1, line.y2), width: Math.abs(line.x2 - line.x1), height: Math.abs(line.y2 - line.y1) }
  }
  if (item.data.kind === 'stroke' && points?.length) {
    const xs = points.map(point => point[0]), ys = points.map(point => point[1])
    const left = Math.min(...xs), top = Math.min(...ys)
    return { x: x + left, y: y + top, width: Math.max(...xs) - left, height: Math.max(...ys) - top }
  }
  const element = canvas.value?.querySelector<HTMLElement>(`[data-object-id="${item.id}"]`)
  return { x, y, width: element?.offsetWidth || width || 220, height: element?.offsetHeight || height || 110 }
}
function stopCameraTransition() {
  cameraMoving.value = false
  clearTimeout(cameraTimer)
}
function focusLayer(id: string, toggle = false) {
  const item = layers.value.byId.get(id), board = canvas.value
  if (!item || !board) return
  if (toggle || hiddenLayers.value.has(id)) { clickSelect(item, toggle); return }
  const bounds = itemBounds(item)
  const inset = Math.min(layerPanel.value?.occupiedWidth() ?? 0, board.clientWidth * 0.55)
  const width = board.clientWidth - inset, height = board.clientHeight
  const fit = Math.min(width * .84 / Math.max(bounds.width, 1), height * .76 / Math.max(bounds.height, 1))
  const scale = Math.max(.15, Math.min(1.1, fit))
  replaceSelection([id])
  tool.value = 'select'
  pinnedComment.value = ''
  hoveredComment.value = ''
  cameraMoving.value = true
  zoom.value = scale
  offset.x = inset + width / 2 - (bounds.x + bounds.width / 2) * scale
  offset.y = height / 2 - (bounds.y + bounds.height / 2) * scale
  clearTimeout(cameraTimer)
  cameraTimer = setTimeout(stopCameraTransition, 320)
}
function frameContains(frame: Item, x: number, y: number) {
  const bounds = itemBounds(frame)
  return x >= bounds.x && y >= bounds.y && x <= bounds.x + bounds.width && y <= bounds.y + bounds.height
}
function writeLayers(changes: SpaceLayerChange[]) {
  return sharedRequest(`${base}/layers?space=${space.value}`, { method: 'POST', body: { changes } })
}
async function saveLayers(
  changes: SpaceLayerChange[],
  movedItems: SpaceLayerChange[] = [],
  previousPositions = new Map<string, BoardPosition>()
) {
  const patch = new Map(changes.map(change => [change.id, change]))
  for (const moved of movedItems) patch.set(moved.id, { ...patch.get(moved.id), ...moved })
  if (!patch.size) return

  const scope = undoScope.value
  const before: SpaceLayerChange[] = []
  const targets: UndoTarget[] = []
  for (const change of patch.values()) {
    const item = layers.value.byId.get(change.id)
    if (!item) continue
    const position = previousPositions.get(change.id) ?? item.data
    before.push({
      id: change.id,
      revision: change.revision,
      ...(change.x !== undefined ? { x: position.x } : {}),
      ...(change.y !== undefined ? { y: position.y } : {}),
      ...(change.parentId !== undefined ? { parentId: item.data.parentId ?? null } : {}),
      ...(change.layerOrder !== undefined ? { layerOrder: item.data.layerOrder ?? 1 } : {}),
      ...(change.layerHidden !== undefined ? { layerHidden: item.data.layerHidden ?? false } : {})
    })
    targets.push(changedTarget(change.id, change.revision))
  }
  const written = await run(async () => {
    await writeLayers([...patch.values()])
    if (scope !== undoScope.value) return
    for (const { id, revision, parentId, ...values } of patch.values()) {
      const original = originalStyles.get(id)
      const item = layers.value.byId.get(id)
      if (!original || !item || item.revision !== revision) continue
      for (const data of [original, item.data]) {
        Object.assign(data, values)
        if (parentId === null) delete data.parentId
        else if (parentId !== undefined) data.parentId = parentId
      }
      item.revision = revision + 1
    }
  })
  if (written && targets.length === patch.size) rememberUndo({ kind: 'layers', targets, before }, scope)
}
async function toggleLayerVisibility(id: string) {
  if (!editable.value || busy.value) return
  await flushNudge()
  if (busy.value) return
  const item = layers.value.byId.get(id)
  if (item) await saveLayers([{ id, revision: item.revision, layerHidden: !item.data.layerHidden }])
}
async function moveLayer(ids: readonly string[], target: string | null, position: SpaceLayerPosition) {
  if (!editable.value || busy.value) return
  await flushNudge()
  const plan = moveSpaceLayers(layers.value, ids, target, position)
  if (!plan) return

  const frame = plan.parentId ? layers.value.byId.get(plan.parentId) : undefined
  const moved: SpaceLayerChange[] = []
  if (frame && !frame.data.layerGroup && plan.moved.some(id => layers.value.parents.get(id) !== frame.id)) {
    const items = plan.moved
      .flatMap(id => [layers.value.byId.get(id)!, ...layerDescendants(id)])
      .filter(item => item.data.kind !== 'link')
    const bounds = items.map(itemBounds)
    if (bounds.some(rect => !frameContains(frame, rect.x + rect.width / 2, rect.y + rect.height / 2))) {
      const container = itemBounds(frame)
      const left = Math.min(...bounds.map(rect => rect.x)), right = Math.max(...bounds.map(rect => rect.x + rect.width))
      const top = Math.min(...bounds.map(rect => rect.y)), bottom = Math.max(...bounds.map(rect => rect.y + rect.height))
      const fit = (start: number, end: number, frameStart: number, frameSize: number) => {
        const min = frameStart + 16, max = frameStart + frameSize - 16 - (end - start)
        return Math.max(min, Math.min(start, max)) - start
      }
      const dx = fit(left, right, container.x, container.width), dy = fit(top, bottom, container.y, container.height)
      for (const item of items) moved.push({ id: item.id, revision: item.revision, x: item.data.x + dx, y: item.data.y + dy })
    }
  }
  replaceSelection(ids.filter(id => layers.value.byId.has(id)))
  await saveLayers(plan.changes, moved)
}
async function changeLayerGroup(ungroup: boolean) {
  if (!editable.value || busy.value || drag || resizing) return
  await flushNudge()
  let changes: SpaceLayerChange[]
  let nextSelection: string[]
  let operation: object
  if (ungroup) {
    const groups = selectedRows.value.filter(item => item.data.layerGroup)
    if (!groups.length) return
    const ids = new Set(groups.map(item => item.id))
    const plan = ungroupSpaceLayers(layers.value, ids)
    changes = plan.changes
    nextSelection = [...new Set([...selection.value].filter(id => !ids.has(id)).concat(plan.members))]
    operation = { remove: groups.map(({ id, revision }) => ({ id, revision })) }
  } else {
    const id = crypto.randomUUID()
    const plan = groupSpaceLayers(layers.value, selection.value, id)
    if (!plan) return
    const bounds = plan.members.map(id => itemBounds(layers.value.byId.get(id)!))
    const x = Math.max(-1e7, Math.min(...bounds.map(rect => rect.x)) - 12)
    const y = Math.max(-1e7, Math.min(...bounds.map(rect => rect.y)) - 12)
    const width = Math.max(160, Math.max(...bounds.map(rect => rect.x + rect.width)) - x + 12)
    const height = Math.max(100, Math.max(...bounds.map(rect => rect.y + rect.height)) - y + 12)
    changes = plan.changes
    nextSelection = [id]
    operation = { group: { id, parentId: plan.parentId, layerOrder: plan.order, x, y, width, height } }
  }
  await run(async () => {
    await sharedRequest(`${base}/layers?space=${space.value}`, { method: 'POST', body: { changes, ...operation } })
    stopUndoHistory()
    replaceSelection(nextSelection)
  })
}
async function finishLayerDrag(item: Item, previous: BoardPosition[]) {
  const bounds = itemBounds(item)
  const excluded = new Set(previous.map(position => position.id))
  const currentParent = layers.value.parents.get(item.id) ?? null
  const candidates = layers.value.rows.filter(({ item: frame }) => frame.data.kind === 'frame' && !frame.data.layerGroup && !hiddenLayers.value.has(frame.id)
    && !excluded.has(frame.id) && frameContains(frame, bounds.x + bounds.width / 2, bounds.y + bounds.height / 2))
  const geometricParent = candidates.sort((a, b) => (layers.value.z.get(b.item.id) ?? 0) - (layers.value.z.get(a.item.id) ?? 0))[0]?.item.id ?? null
  const parent = currentParent && layers.value.byId.get(currentParent)?.data.layerGroup ? currentParent : geometricParent
  const changed = parent !== currentParent
  const changes = changed ? moveSpaceLayer(layers.value, item.id, parent, parent ? 'inside' : 'root') : []
  const positionChanges = previous.flatMap(({ id }) => layers.value.byId.get(id) ?? [])
    .filter(current => current.data.kind !== 'link')
    .map(current => ({ id: current.id, revision: current.revision, x: current.data.x, y: current.data.y }))
  await saveLayers(changes, positionChanges, new Map(previous.map(position => [position.id, position])))
}
onMounted(async()=>{
 document.addEventListener('fullscreenchange',fullscreenChanged);document.addEventListener('keydown',keyboard);document.addEventListener('keyup',keyUp);window.addEventListener('blur',resetKeys)
 const initial = route.query.space
 const saved = serviceTabs.readView<{ project: string; space: string; x: number; y: number; zoom: number; history: typeof history.value }>(workspaceTabId)
 if (saved?.project === props.project.id && (typeof initial !== 'string' || initial === saved.space)) {
   space.value = saved.space; offset.x = saved.x; offset.y = saved.y; zoom.value = saved.zoom; history.value = saved.history
 } else if (typeof initial === 'string' && /^[0-9a-f-]{36}$/i.test(initial)) space.value = initial
 await load();const {data}=await supabase.auth.getSession();if(disposed||!data.session)return
 await supabase.realtime.setAuth(data.session.access_token);if(disposed)return;realtimeReady=true
 stopCursorWatch=watch(space,id=>void openCursors(id),{immediate:true})
 channel=supabase.channel(`spaces-${session}`)
 .on('postgres_changes',{event:'*',schema:'public',table:'project_space_objects'},changedObject)
 .on('postgres_changes',{event:'*',schema:'public',table:'project_spaces',filter:`project_id=eq.${props.project.id}`},queue)
 .subscribe(status=>{connected.value=status==='SUBSCRIBED';if(connected.value)queue()})
 let ticks=0;timer=setInterval(()=>{now.value=Date.now();heartbeat();cursors.value=cursors.value.filter(c=>now.value-new Date(c.updated_at).getTime()<15000);if(++ticks%3===0&&!connected.value&&!drag&&!editing.value&&document.visibilityState==='visible')queue()},5000)
})
onBeforeUnmount(()=>{serviceTabs.saveView(workspaceTabId, { project: props.project.id, space: space.value, x: offset.x, y: offset.y, zoom: zoom.value, history: [...history.value] });stopCameraTransition();disposed=true;epoch++;cursorEpoch++;stopCursorWatch?.();clearInterval(timer);clearTimeout(refreshTimer);clearTimeout(cursorTimer);document.removeEventListener('fullscreenchange',fullscreenChanged);document.removeEventListener('keydown',keyboard);document.removeEventListener('keyup',keyUp);window.removeEventListener('blur',resetKeys);clearTimeout(commentHide);clearTimeout(nudgeTimer);if(cursorChannel){void cursorChannel.send({type:'broadcast',event:'leave',payload:{id:session}});void supabase.removeChannel(cursorChannel)}if(channel)void supabase.removeChannel(channel);Object.values(images.value).filter(Boolean).forEach(URL.revokeObjectURL)})
</script>
<template>
<section ref="root" class="spaces" :class="{'is-fullscreen':fullscreen,'header-open':headerOpen,previewing:taskPicker}" @pointermove="headerPointer" @pointerleave="headerOpen=false">
 <div v-if="fullscreen" class="header-reveal" aria-hidden="true"></div>
 <header class="space-header"><div class="space-title"><button v-if="space" title="Все пространства" aria-label="Все пространства" @click="choose('')"><UIcon name="i-lucide-arrow-left"/></button><button v-if="history.length" class="back-space" @click="goBack"><UIcon name="i-lucide-undo-2"/>Вернуться в «{{spaces.find(s=>s.id===history[history.length-1]?.id)?.name||'предыдущее пространство'}}»</button><UIcon name="i-lucide-orbit"/><div><h1>{{currentSpace?.name||'Пространства проекта'}}</h1><p>{{currentSpace?.description||'Идеи, документы и решения в одном месте'}}</p></div></div><div class="space-header-actions"><input ref="transferInput" type="file" accept=".zip" hidden @change="importSpace"><button v-if="space?editable:canCreate" @click="transferInput?.click()">Импорт</button><button v-if="space" @click="exportSpace">Экспорт</button><span class="live-status" :class="{online:connected}">{{connected?'Онлайн':'Подключение…'}}</span><button v-if="space && canManage" @click="settings"><UIcon name="i-lucide-settings-2"/>Настройки</button><button :title="fullscreen?'Выйти из полного экрана (F)':'На весь экран (F)'" :aria-label="fullscreen?'Выйти из полного экрана':'На весь экран'" aria-keyshortcuts="F" @click="toggleFullscreen"><UIcon :name="fullscreen?'i-lucide-minimize':'i-lucide-maximize'"/></button></div></header>
 <UAlert v-if="error" color="error" :description="error"/>
 <div v-if="!space" class="space-catalog"><div class="catalog-heading"><div><span class="eyebrow">РАБОЧАЯ СРЕДА</span><h3>Все пространства <span>{{spaces.length}}</span></h3></div><form v-if="canCreate" @submit.prevent="create"><input v-model="title" maxlength="120" placeholder="Название нового пространства" required><button class="primary" :disabled="busy"><UIcon name="i-lucide-plus"/>Создать пространство</button></form></div>
 <div v-if="spaces.length" class="space-grid"><button v-for="(s,index) in spaces" :key="s.id" class="space-card" @click="choose(s.id)"><div class="space-card-preview" :style="{'--card-hue':`${(index*53+245)%360}`}"><span class="mini-note"></span><span class="mini-line"></span><span class="mini-block"></span><span class="card-open"><UIcon name="i-lucide-arrow-up-right"/></span></div><div class="space-card-content"><h4>{{s.name}}</h4><p>{{s.description||'Добавьте описание пространства'}}</p><footer><span>{{s.object_count}} объектов</span><span>{{s.created_by===auth.user?.id?'Создатель':s.permission==='viewer'?'Просмотр':'Редактирование'}}</span></footer></div></button></div>
 <div v-else class="catalog-empty"><UIcon name="i-lucide-orbit"/><h3>Место для ваших идей</h3><p>Создайте первое пространство и пригласите команду к работе.</p></div></div>
 <template v-else>
 <div class="canvas-shell">
 <aside v-if="editable&&selection.size<=1&&(selectedItem||tool==='link'||['pen','highlighter','eraser'].includes(tool))" class="card-properties"> <div v-if="editable && (tool==='link'||selectedItem?.data.kind==='link')" class="properties-section">
 <strong>Связь</strong><label>Вид <select :value="selectedItem?.data.kind==='link'?(selectedItem.data.lineStyle||'straight'):lineDefaults.lineStyle" :disabled="busy" @change="lineDefaults.lineStyle=($event.target as HTMLSelectElement).value as typeof lineDefaults.lineStyle;selectedItem?.data.kind==='link' && styleSelected({lineStyle:lineDefaults.lineStyle})"><option value="straight">Прямая</option><option value="dashed">Пунктирная</option><option value="wavy">Волнистая</option></select></label>
 <label>Направление <select :value="selectedItem?.data.kind==='link'?(selectedItem.data.arrow||'forward'):lineDefaults.arrow" :disabled="busy" @change="lineDefaults.arrow=($event.target as HTMLSelectElement).value as typeof lineDefaults.arrow;selectedItem?.data.kind==='link' && styleSelected({arrow:lineDefaults.arrow})"><option value="none">Без стрелки</option><option value="forward">Ко второму объекту →</option><option value="backward">К первому объекту ←</option><option value="both">В обе стороны ↔</option></select></label>
 <label>Цвет линии <input type="color" :disabled="busy" :value="selectedItem?.data.kind==='link'?(selectedItem.data.color||'#64748b'):lineDefaults.color" @change="lineDefaults.color=($event.target as HTMLInputElement).value;selectedItem?.data.kind==='link' && styleSelected({color:lineDefaults.color})"></label>
 </div>
 <div v-if="editable && selectedItem && ['note','todo','shape','text'].includes(selectedItem.data.kind)" class="properties-section"><strong>Оформление</strong><label v-if="selectedItem.data.kind!=='text'">Фон <input type="color" :disabled="busy" :value="selectedItem.data.color||(selectedItem.data.kind==='note'?'#fff3ae':'#ffffff')" @change="styleSelected({color:($event.target as HTMLInputElement).value})"></label><label>Цвет текста <input type="color" :disabled="busy" :value="selectedItem.data.textColor||'#334155'" @change="styleSelected({textColor:($event.target as HTMLInputElement).value})"></label></div>

 <div v-if="editable && selectedItem?.data.kind==='frame'" class="properties-section"><strong>Контур</strong><label>Цвет <input type="color" :disabled="busy" :value="selectedItem.data.borderColor||'#7c3aed'" @change="styleSelected({borderColor:($event.target as HTMLInputElement).value})"></label><label>Толщина <input type="number" min="1" max="16" :disabled="busy" :value="selectedItem.data.borderWidth||2" @change="styleSelected({borderWidth:Number(($event.target as HTMLInputElement).value)})">px</label><label>Контуры <select :value="selectedItem.data.contours||1" :disabled="busy" @change="styleSelected({contours:Number(($event.target as HTMLSelectElement).value)})"><option v-for="n in 5" :key="n" :value="n">{{n}}</option></select></label></div>
 <div v-if="editable&&selectedItem?.data.kind==='person'" class="properties-section"><label>Роль<input :value="selectedItem.data.role" maxlength="200" @change="styleSelected({role:($event.target as HTMLInputElement).value})"></label><label>Обязанности<input :value="selectedItem.data.duty" maxlength="2000" @change="styleSelected({duty:($event.target as HTMLInputElement).value})"></label></div>
 <div v-if="editable&&['pen','highlighter','eraser'].includes(tool)" class="properties-section"><button :class="{chosen:tool==='pen'}" @click="tool='pen'">Маркер</button><button :class="{chosen:tool==='highlighter'}" @click="tool='highlighter'">Фломастер</button><button :class="{chosen:tool==='eraser'}" @click="tool='eraser'">Ластик</button><label v-if="tool!=='eraser'">Цвет<input v-model="inkColor" type="color"></label><label v-if="tool!=='eraser'">Толщина<input v-model.number="inkWidth" type="range" min="1" max="10"></label><span v-else>Стирает только нарисованные линии</span></div>
<div v-if="editable&&selectedItem&&!selectedItem.data.layerGroup&&!['link','stroke'].includes(selectedItem.data.kind)" class="properties-section"><strong>Карточка</strong><label>Ширина <input type="number" min="160" :max="selectedItem.data.kind==='frame'?undefined:2000" :value="selectedItem.data.width||220" @input="styleSelected({width:Number(($event.target as HTMLInputElement).value)})"></label><label>Высота <input type="number" min="100" :max="selectedItem.data.kind==='frame'?undefined:2000" :value="selectedItem.data.height||110" @input="styleSelected({height:Number(($event.target as HTMLInputElement).value)})"></label><label>Размер шрифта <input type="number" min="8" max="72" :value="selectedItem.data.fontSize||(selectedItem.data.kind==='frame'?26:14)" @input="styleSelected({fontSize:Number(($event.target as HTMLInputElement).value)})"></label><label>Шрифт <select :value="selectedItem.data.fontFamily||'system'" @change="styleSelected({fontFamily:($event.target as HTMLSelectElement).value as any})"><option value="system">Системный</option><option value="serif">С засечками</option><option value="mono">Моноширинный</option></select></label><label>Начертание <select :value="selectedItem.data.fontWeight||'normal'" @change="styleSelected({fontWeight:($event.target as HTMLSelectElement).value as any})"><option value="normal">Обычное</option><option value="bold">Полужирное</option></select></label></div>
<div v-if="editable&&selectedItem?.data.kind==='frame'&&!selectedItem.data.layerGroup" class="properties-section"><label>Заголовок <select :value="selectedItem.data.titlePosition||'top-right'" @change="styleSelected({titlePosition:($event.target as HTMLSelectElement).value})"><option v-for="p in [{id:'top-left',name:'Сверху слева'},{id:'top-center',name:'Сверху по центру'},{id:'top-right',name:'Сверху справа'},{id:'bottom-left',name:'Снизу слева'},{id:'bottom-center',name:'Снизу по центру'},{id:'bottom-right',name:'Снизу справа'}]" :key="p.id" :value="p.id">{{p.name}}</option></select></label><label>Цвет заголовка <input type="color" :value="selectedItem.data.titleColor||'#334155'" @input="styleSelected({titleColor:($event.target as HTMLInputElement).value})"></label></div>
<div v-if="editable && selectedItem && hasFileDisplayOptions(selectedItem)" class="properties-section">
  <label>На доске
    <select :value="fileDisplay(selectedItem)" :disabled="busy" @change="setFileDisplay(($event.target as HTMLSelectElement).value)">
      <option value="card">{{isImage(selectedItem) ? 'Изображение и название' : 'Содержимое и название'}}</option>
      <option value="content">{{isImage(selectedItem) ? 'Только изображение' : 'Только содержимое'}}</option>
      <option value="filename">Только название</option>
    </select>
  </label>
</div>
<div v-else-if="editable&&selectedItem&&selectedItem.data.kind==='document'" class="properties-section"><label><input type="checkbox" :checked="selectedItem.data.showContent!==false" @change="styleSelected({showContent:($event.target as HTMLInputElement).checked});loadThumbnails()">Показывать содержимое</label></div>
<div v-if="editable && selectedItem && spreadsheetOptions(selectedItem)" class="properties-section">
  <label>Лист
    <select :value="selectedSheet(selectedItem)" :disabled="busy || !sheetNames(selectedItem)?.length"
      @change="setSpreadsheetSheet(selectedItem, ($event.target as HTMLSelectElement).value)">
      <option v-if="!sheetNames(selectedItem)?.length" value="">
        {{thumbnails[thumbnailKey(selectedItem) ?? '']?.kind === 'unavailable' ? 'Листы недоступны' : 'Загружаем листы…'}}
      </option>
      <option v-for="sheet in sheetNames(selectedItem)" :key="sheet" :value="sheet">{{sheet}}</option>
    </select>
  </label>
  <label>Строки
    <input type="number" min="1" :max="spaceSpreadsheetPreviewLimits.rows" step="1"
      :value="spreadsheetOptions(selectedItem)?.rows" :disabled="busy" @change="setSpreadsheetSize(selectedItem, 'rows', $event)">
  </label>
  <label>Столбцы
    <input type="number" min="1" :max="spaceSpreadsheetPreviewLimits.columns" step="1"
      :value="spreadsheetOptions(selectedItem)?.columns" :disabled="busy" @change="setSpreadsheetSize(selectedItem, 'columns', $event)">
  </label>
</div>
<div v-if="editable&&selectedItem" class="inspector-apply"><button class="primary" :disabled="busy" @click="applySelected">Применить</button><button @click="cancelSelected">Отмена</button></div></aside>
 <input ref="fileInput" type="file" hidden @change="upload"><input ref="markdownInput" type="file" accept=".md,.markdown,text/markdown,text/plain" hidden @change="importMarkdown">
 <div v-if="attaching" class="floating-picker"><header><strong>Документы проекта</strong><button @click="attaching=false">Закрыть</button></header><button v-for="f in docs.query.data.value" :key="f.id" @click="add(f.type.startsWith('image/')?'image':'document',f.id);attaching=false">{{f.name}}</button><p v-if="!docs.query.data.value?.length">Пока нет доступных документов</p></div>
 <div v-if="portalOpen" class="floating-picker"><header><strong>Ссылка на пространство</strong><button @click="portalOpen=false">Закрыть</button></header><button v-for="s in spaces.filter(s=>s.id!==space)" :key="s.id" @click="add('space',undefined,{targetSpace:s.id});portalOpen=false"><UIcon name="i-lucide-orbit"/>{{s.name}}</button><p v-if="spaces.length<2">Сначала создайте ещё одно пространство</p></div>
 <div ref="canvas" tabindex="-1" class="space-canvas" :class="{panning:spaceHeld||tool==='hand',placing:['comment','text','pen','highlighter','eraser'].includes(tool)}" @pointerdown.self="down($event)" @pointermove="move" @pointerup="up" @pointercancel="up" @wheel.prevent="wheel">
 <div class="space-world" :class="{'camera-moving':cameraMoving}" :style="{transform:`translate(${offset.x}px,${offset.y}px) scale(${zoom})`}">
 <svg v-for="item in visibleObjects.filter(i=>i.data.kind==='link')" :key="item.id" class="connections" :style="{zIndex:layers.z.get(item.id)}">
  <defs><marker :id="`arrow-${item.id}`" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" :fill="item.data.color||'#64748b'"/></marker></defs>
  <path v-if="selection.has(item.id)" :d="linkPath(item)" fill="none" stroke="#c4b5fd" stroke-width="8"/>
  <path :d="linkPath(item)" fill="none" :stroke="item.data.color||'#64748b'" stroke-width="2" :stroke-dasharray="item.data.lineStyle==='dashed'?'9 6':undefined" :marker-start="['backward','both'].includes(item.data.arrow||'forward')?`url(#arrow-${item.id})`:undefined" :marker-end="['forward','both'].includes(item.data.arrow||'forward')?`url(#arrow-${item.id})`:undefined"/>
  <path :d="linkPath(item)" fill="none" stroke="transparent" stroke-width="16" class="edge" @pointerdown.stop="spaceHeld || tool==='hand' ? down($event) : clickSelect($event.altKey ? item : outerLayerGroup(item), $event.shiftKey)"/>
 </svg>
 <svg v-for="item in visibleObjects.filter(i=>i.data.kind==='stroke'&&!erased.has(i.id))" :key="item.id" class="ink-layer" :style="{zIndex:layers.z.get(item.id)}">
  <path :transform="`translate(${item.data.x},${item.data.y})`" :d="inkPath(item.data)" fill="none" :stroke="selection.has(item.id)?'#8b5cf6':item.data.color||'#334155'" :stroke-width="item.data.strokeWidth||3" :opacity="item.data.opacity||1" stroke-linecap="round" stroke-linejoin="round" class="ink-hit" @pointerdown.stop="down($event,item)"/>
 </svg>
 <svg v-if="inkDraft" class="ink-layer" :style="{zIndex:objects.length+1}"><path :d="inkPath(inkDraft)" :transform="`translate(${inkDraft.x},${inkDraft.y})`" fill="none" :stroke="inkDraft.color" :stroke-width="inkDraft.strokeWidth" :opacity="inkDraft.opacity" stroke-linecap="round" stroke-linejoin="round"/></svg>
 <article v-for="item in visibleObjects.filter(i=>!['link','stroke'].includes(i.data.kind))" :key="item.id" class="space-object" :data-object-id="item.id" :class="[item.data.kind,item.data.kind==='shape'?'shape-'+(item.data.shape||'rectangle'):'',{chosen:selection.has(item.id),'layer-group':item.data.layerGroup, 'file-preview':hasFileDisplayOptions(item) && hasBoardFileContent(item), 'file-preview-sized':!!item.data.height, 'content-only':fileContentOnly(item) && hasBoardFileContent(item)}]" :style="nodeStyle(item)" @pointerdown.stop="down($event,item)" @dblclick="edit(item)">
 <template v-if="item.data.kind==='frame'"><span v-for="edge in ['top','right','bottom','left']" :key="edge" class="frame-hit" :class="edge"></span><div :class="['frame-label','title-'+(item.data.titlePosition||'top-right')]" :style="{color:item.data.titleColor||item.data.textColor,fontSize:(item.data.fontSize||26)+'px'}" @dblclick.stop="edit(item)"><div v-if="editing===item.id" class="inline-editor" @pointerdown.stop><textarea v-model="draft" autofocus @keydown.esc="editing=''"/><button class="primary" :disabled="busy" @click="saveEdit(item)">Применить</button><button @click="editing=''">Отмена</button></div><span v-else>{{item.data.text}}</span></div><span v-for="n in Math.max(0,(item.data.contours||1)-1)" :key="n" class="extra-contour" :style="{inset:(n*7)+'px',borderColor:item.data.borderColor||'#7c3aed',borderWidth:(item.data.borderWidth||2)+'px'}"></span><button v-for="corner in editable&&selected===item.id&&!item.data.layerGroup?['nw','ne','sw','se']:[]" :key="corner" class="resize-handle" :class="corner" :aria-label="`Изменить размер ${corner}`" @pointerdown.stop="resizeStart($event,item,corner)"></button></template>
 <template v-else-if="['document','image'].includes(item.data.kind)">
   <div v-if="hasBoardFileContent(item)" class="board-file-content">
     <img
       v-if="imageSource(item)"
       :src="imageSource(item)"
       :alt="file(item)?.name || 'Изображение'"
       class="board-image"
       draggable="false"
       tabindex="0"
       role="button"
       :aria-pressed="selected === item.id"
       @keydown.enter.stop.prevent="replaceSelection([item.id])"
       @keydown.space.stop.prevent="replaceSelection([item.id])"
       @error="hideFailedImage(item, $event)"
     >
     <img
       v-else-if="fileThumbnail(item)?.kind === 'image'"
       :src="(fileThumbnail(item) as Extract<SpaceFileThumbnail, { kind: 'image' }>).src"
       :alt="`Первая страница — ${file(item)?.name}`"
       class="file-page"
       draggable="false"
     >
     <table v-else-if="fileThumbnail(item)?.kind === 'cells'" class="file-cells" :aria-label="file(item)?.name"
       :style="{ '--preview-rows': spreadsheetOptions(item)?.rows, '--preview-columns': spreadsheetOptions(item)?.columns }">
       <tbody>
         <tr v-for="(row, r) in (fileThumbnail(item) as Extract<SpaceFileThumbnail, { kind: 'cells' }>).rows" :key="r">
           <td v-for="(cell, c) in row" :key="c">{{cell || ' '}}</td>
         </tr>
       </tbody>
     </table>
   </div>
   <template v-else-if="item.data.kind === 'document' && !isImage(item) && item.data.showContent !== false">
     <button v-if="fileThumbnail(item)?.kind === 'unavailable'" @pointerdown.stop @click="retryThumbnail(item)">Обновить миниатюру</button>
     <p v-else-if="thumbnailLoading.has(thumbnailKey(item) ?? '')" class="thumbnail-status">Готовим миниатюру…</p>
   </template>
   <strong v-if="!fileContentOnly(item) || !hasBoardFileContent(item)" class="board-file-name" :title="file(item)?.name">
     {{file(item)?.name || 'Файл недоступен'}}
   </strong>
   <div
     v-if="!hasFileDisplayOptions(item) || (selected === item.id && selection.size === 1 && file(item))"
     :class="{ 'board-file-actions': hasFileDisplayOptions(item) }"
     @pointerdown.stop
     @keydown.enter.stop
     @keydown.space.stop
   >
     <button :disabled="busy" @click="open(item)">{{hasFileDisplayOptions(item) ? 'Рассмотреть' : 'Предпросмотр'}}</button>
     <button :disabled="busy" @click="open(item, true)">Скачать</button>
   </div>
 </template>
 <div v-else-if="item.data.kind === 'web-link'" class="resource-card web-link-card">
   <div class="web-link-header">
     <UIcon name="i-lucide-link-2" aria-hidden="true" />
     <button v-if="editable" type="button" aria-label="Редактировать ссылку" title="Редактировать ссылку"
       :disabled="busy" @pointerdown.stop @dblclick.stop @keydown.enter.stop @click.stop="openWebLinkEditor(item)">
       <UIcon name="i-lucide-pencil" />
     </button>
   </div>
   <h3 v-if="item.data.name">{{ item.data.name }}</h3>
   <p class="web-link-address" :title="item.data.url">{{ item.data.url }}</p>
   <a v-if="spaceWebLinkUrl(item.data.url)" :href="spaceWebLinkUrl(item.data.url)" target="_blank" rel="noopener noreferrer"
     @pointerdown.stop @dblclick.stop @keydown.enter.stop>
     Открыть ссылку <UIcon name="i-lucide-external-link" aria-hidden="true" />
   </a>
 </div>
 <div v-else-if="item.data.kind==='subscription'" class="resource-card"><UIcon name="i-lucide-repeat-2"/><small>ПОДПИСКА</small><h3>{{subscriptionFor(item)?.title||'Подписка недоступна'}}</h3><template v-if="subscriptionFor(item)"><p class="subscription-price">{{subscriptionFor(item)?.subscription?.price}} {{subscriptionFor(item)?.subscription?.currency}}</p><p>Период: {{subscriptionFor(item)?.subscription?.periodCount}} {{subscriptionFor(item)?.subscription?.periodUnit==='month'?'мес.':subscriptionFor(item)?.subscription?.periodUnit==='year'?'лет':'дн.'}}</p><p>Оплачено до {{subscriptionFor(item)?.subscription?.paidUntil}}</p><p>{{subscriptionFor(item)?.sourceName}}</p></template></div>
 <div v-else-if="item.data.kind==='calendar'" class="board-calendar"><header @pointerdown.stop><button @click="moveMonth(item,-1)" aria-label="Предыдущий месяц">‹</button><h3>{{monthTitle(item)}}</h3><button @click="moveMonth(item,1)" aria-label="Следующий месяц">›</button></header><div class="calendar-week"><span v-for="day in ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']" :key="day">{{day}}</span></div><div class="calendar-grid" @pointerdown.stop><button v-for="day in monthDays(item)" :key="day.date" :class="{muted:!day.current,today:day.date===new Date().toLocaleDateString('sv-SE')}" @click="openCalendar(item,day.date)"><span>{{day.day}}</span><i v-for="event in dayEvents(item,day.date).slice(0,2)" :key="event.id" :style="{background:event.color}" :title="event.title">{{event.title}}</i></button></div><button v-if="editable" class="calendar-add" @pointerdown.stop @click="openCalendar(item)">+ Событие или интервал</button></div>
 <template v-else-if="item.data.kind==='task-calendar'||item.data.kind==='task-gantt'">
  <SpaceTaskPlanning v-if="canShowTaskPlanning" :mode="item.data.kind==='task-calendar'?'calendar':'gantt'" :project="project" :portal="fullscreen ? root : undefined" :refresh="taskPlanning.refetch"
    :board="taskPlanning.data.value" :loading="taskPlanning.isPending.value" :failed="!!taskPlanning.error.value" />
  <p v-else>Задачи проекта недоступны.</p>
 </template>
 <SpaceBookingCard v-else-if="item.data.kind === 'booking' && item.data.bookingId" :booking-id="item.data.bookingId" />
 <SpaceBookingPlanning v-else-if="item.data.kind === 'booking-calendar' || item.data.kind === 'booking-gantt'"
  :mode="item.data.kind === 'booking-calendar' ? 'calendar' : 'gantt'" :scope="`space-bookings:${item.id}`" :portal="fullscreen ? root : undefined" />
 <div v-else-if="item.data.kind==='task'" class="resource-card"><UIcon name="i-lucide-columns-3"/><small>КАБАН</small><h3>{{taskResources[item.id]?.title||'Задача недоступна'}}</h3><p v-if="taskResources[item.id]">{{taskResources[item.id]?.completed?'Завершена':'В работе'}}</p><LayoutServiceTabLink v-if="taskResources[item.id]" :to="taskUrl(item)" :tab-label="taskResources[item.id]?.title" @pointerdown.stop>Открыть задачу ↗</LayoutServiceTabLink></div>
 <div v-else-if="item.data.kind==='password'" class="resource-card"><UIcon name="i-lucide-key-round"/><small>ПАРОЛЬ</small><h3>{{passwordFor(item)?.entry.title||'Пароль недоступен'}}</h3><template v-if="passwordFor(item)"><p>{{passwordFor(item)?.entry.username}}</p><code>{{revealed[item.id]?passwordFor(item)?.entry.password:'••••••••'}}</code><button @pointerdown.stop @click="revealed[item.id]=!revealed[item.id]">{{revealed[item.id]?'Скрыть':'Показать пароль'}}</button></template></div>
 <div v-else-if="item.data.kind==='chat'" class="resource-card"><UIcon name="i-lucide-messages-square"/><small>ЧАТ ПРОЕКТА</small><h3>{{chatFor(item)?.name||'Чат недоступен'}}</h3><p v-if="chatFor(item)">{{chatFor(item)?.members.length}} участников</p><LayoutServiceTabLink v-if="chatFor(item)" :to="`/projects/${project.id}/chats?chat=${item.data.chatId}`" :tab-label="chatFor(item)?.name" @pointerdown.stop>Открыть чат ↗</LayoutServiceTabLink></div>
 <div v-else-if="item.data.kind==='person'" class="resource-card person-card"><span class="person-avatar">{{author(item.data.personId!).slice(0,1)}}</span><h3>{{author(item.data.personId!)}}</h3><p class="person-role">{{item.data.role||'Участник проекта'}}</p><p>{{item.data.duty||'Обязанности пока не указаны'}}</p></div>
 <div v-else-if="item.data.kind==='space'" class="portal-card"><UIcon name="i-lucide-orbit"/><h3>{{spaces.find(s=>s.id===item.data.targetSpace)?.name||'Пространство удалено'}}</h3><p>{{spaces.find(s=>s.id===item.data.targetSpace)?.description||'Связанное пространство проекта'}}</p><button :disabled="!spaces.some(s=>s.id===item.data.targetSpace)" @pointerdown.stop @click.stop="choose(item.data.targetSpace!,true)">Открыть пространство <UIcon name="i-lucide-arrow-up-right"/></button></div>
 <div v-else-if="item.data.kind==='table'" class="board-table"><div class="object-caption"><UIcon name="i-lucide-table-2"/>Таблица</div><table><tbody><tr v-for="(row,r) in item.data.rows" :key="r"><td v-for="(value,c) in row" :key="c"><input :value="value" :readonly="!editable" maxlength="2000" @pointerdown.stop @input="cell(item,r,c,($event.target as HTMLInputElement).value)"></td></tr></tbody></table><div v-if="editable" class="table-actions" @pointerdown.stop><button :disabled="busy" @click="resizeTable(item,'row')">+ Строка</button><button :disabled="busy" @click="resizeTable(item,'column')">+ Столбец</button><button :disabled="busy" @click="resizeTable(item,'row',true)">− Строка</button><button :disabled="busy" @click="resizeTable(item,'column',true)">− Столбец</button></div></div>
 <button v-else-if="item.data.kind==='comment'" class="comment-pin" :class="{resolved:item.data.resolved,opened:popupComment?.id===item.id}" :aria-label="item.data.text||'Комментарий'" @pointerdown.stop="down($event,item)" :aria-expanded="popupComment?.id===item.id" @pointerenter="hoverComment(item.id)" @pointerleave="leaveComment" @focus="hoverComment(item.id)" @blur="leaveComment" @click.stop="pinComment(item)"><UIcon :name="item.data.resolved?'i-lucide-check':'i-lucide-message-circle'"/><small v-if="item.data.messages?.length">{{item.data.messages.length}}</small></button>
 <div v-else-if="item.data.kind==='spec'" class="spec-document"><div class="object-caption"><UIcon name="i-lucide-clipboard-list"/>Spec<button v-if="editable" @pointerdown.stop @click="selected=item.id;markdownInput?.click()">Импорт Markdown</button></div><div v-if="editing===item.id" class="inline-editor" @pointerdown.stop><textarea v-model="draft" autofocus @keydown.esc="editing=''"/><button class="primary" :disabled="busy" @click="saveEdit(item)">Применить</button><button @click="editing=''">Отмена</button></div><template v-else><template v-for="(line,index) in (item.data.text||'').split('\n')" :key="index"><h1 v-if="line.startsWith('# ')">{{line.slice(2)}}</h1><h2 v-else-if="line.startsWith('## ')">{{line.slice(3)}}</h2><h3 v-else-if="line.startsWith('### ')">{{line.slice(4)}}</h3><p v-else>{{line||'\u00a0'}}</p></template></template><button v-if="editable && editing!==item.id" @pointerdown.stop @click="edit(item)">Редактировать Spec</button></div>
 <div v-else-if="editing===item.id" class="inline-editor" @pointerdown.stop><template v-if="item.data.kind==='todo'"><h3>Список дел</h3><div v-for="(row,index) in draftTodos" :key="index" class="todo-edit-row"><input v-model="row.done" type="checkbox"><input v-model="row.text" placeholder="Новая задача" maxlength="500"><button @click="draftTodos.splice(index,1)">×</button></div><button @click="draftTodos.push({text:'',done:false})">+ Добавить пункт</button></template><textarea v-else v-model="draft" autofocus @keydown.esc="editing=''"/><div class="inline-actions"><button class="primary" :disabled="busy" @click="saveEdit(item)">Применить</button><button @click="editing=''">Отмена</button></div></div>
 <div v-else-if="item.data.kind==='todo'" class="todos"><label v-for="(line,index) in (item.data.text||'').split('\n')" :key="index" @pointerdown.stop><input type="checkbox" :checked="line.startsWith('[x]')" :disabled="!editable" @change="put(item,{...item.data,text:(item.data.text||'').split('\n').map((l,n)=>n===index?(l.startsWith('[x]')?'[ ] ':'[x] ')+l.replace(/^\[[ x]\]\s*/,''):l).join('\n')})">{{line.replace(/^\[[ x]\]\s*/,'')}}</label></div><div v-else class="object-text">{{item.data.text}}</div>
 <template v-if="editable&&selected===item.id&&!['frame','comment'].includes(item.data.kind)"><button v-for="corner in ['nw','ne','sw','se']" :key="corner" class="resize-handle" :class="corner" :aria-label="`Размер ${corner}`" @pointerdown.stop="resizeStart($event,item,corner)"></button></template></article>
 <div v-for="cursor in visibleCursors" :key="cursor.id" class="remote-cursor" :style="{transform:`translate3d(${cursor.x}px,${cursor.y}px,0) scale(${1/zoom})`,color:color(cursor.user_id),zIndex:objects.length+2}"><svg width="18" height="24" viewBox="0 0 18 24"><path d="M1 1L16 15L9 16L6 22Z" fill="currentColor" stroke="white"/></svg><span :style="{background:color(cursor.user_id)}">{{cursor.name}}</span></div>
 </div>
 <SpaceLayers ref="layerPanel" :key="space" :space-id="space" :rows="layerRows" :selected="selection" :primary="selected" :editable="editable" :busy="busy" @focus="focusLayer" @move="moveLayer" @visibility="toggleLayerVisibility" />
 </div>
 <div v-if="boxSelection" class="selection-box" :style="boxStyle()"></div><div v-if="selection.size" class="group-toolbar"><strong>{{selection.size}} выбрано</strong><button v-if="editable&&selection.size>1" :disabled="busy" @click="changeLayerGroup(false)">Сгруппировать</button><button v-if="editable&&selectedRows.some(item=>item.data.layerGroup)" :disabled="busy" @click="changeLayerGroup(true)">Разгруппировать</button><button :disabled="busy" @click="groupDialog='copy';groupTarget=''">Копировать в…</button><button v-if="editable" :disabled="busy" @click="groupDialog='move';groupTarget=''">Перенести в…</button><button v-if="editable" :disabled="busy" @click="groupAction('delete')">Удалить</button><button @click="replaceSelection([])">Снять выделение</button></div>
 <section v-if="popupComment" class="comment-popover" :style="commentPosition()" role="dialog" aria-label="Обсуждение" @focusin="pinnedComment=popupComment.id" @pointerenter="hoverComment(popupComment.id)" @pointerleave="leaveComment" @keydown.esc.stop="pinnedComment='';hoveredComment=''"><button class="close-comment" aria-label="Закрыть обсуждение" @click="pinnedComment='';hoveredComment=''">×</button><div class="comment-thread"><div class="object-caption"><UIcon name="i-lucide-message-circle"/>Обсуждение <span v-if="popupComment.data.resolved">· Решено</span></div><textarea v-if="editing===popupComment.id" v-model="draft" autofocus @pointerdown.stop @keydown.esc="editing=''"/><h3 v-else>{{popupComment.data.text}}</h3><div class="comment-messages" @pointerdown.stop><article v-for="message in popupComment.data.messages" :key="message.id"><strong>{{author(message.author)}}</strong><p>{{message.text}}</p><time>{{new Date(message.createdAt).toLocaleString('ru-RU')}}</time></article></div><form v-if="editable" @pointerdown.stop @submit.prevent="reply(popupComment)"><input v-model="replyDrafts[popupComment.id]" placeholder="Написать комментарий…" maxlength="4000" required><button :disabled="busy">Отправить</button></form><button v-if="editable" @pointerdown.stop @click="put(popupComment,{...popupComment.data,resolved:!popupComment.data.resolved})">{{popupComment.data.resolved?'Открыть обсуждение':'Отметить решённым'}}</button></div>
</section>
 <details class="keyboard-help" :open="controlsOpen" @toggle="controlsOpen=($event.target as HTMLDetailsElement).open"><summary><UIcon name="i-lucide-keyboard"/>Управление</summary><div class="keyboard-list"><p><kbd>⌘/Ctrl + Z</kbd><span>Отменить последнее действие на доске</span></p><p><kbd>F</kbd><span>Включить или закрыть полноэкранный режим</span></p><p><kbd>Space</kbd><span>Удерживать для перемещения доски</span></p><p><kbd>V</kbd><span>Выделение рамкой</span></p><p><kbd>Shift + клик</kbd><span>Добавить / убрать объект</span></p><p><kbd>H</kbd><span>Перемещение</span></p><p><kbd>Cmd/Ctrl + G</kbd><span>Сгруппировать или разгруппировать</span></p><p><kbd>Cmd/Ctrl + Shift + G</kbd><span>Разгруппировать слои</span></p><p><kbd>T</kbd><span>Текст: выбрать место на доске</span></p><p><kbd>C</kbd><span>Комментарий: выбрать место</span></p><p><kbd>N</kbd><span>Новая заметка</span></p><p><kbd>B / M / E</kbd><span>Маркер / фломастер / ластик</span></p><p><kbd>R</kbd><span>Контурная рамка</span></p><p><kbd>L</kbd><span>Связь двух объектов</span></p><p><kbd>Enter</kbd><span>Редактировать выбранный объект</span></p><p><kbd>⌘/Ctrl D</kbd><span>Дублировать объект</span></p><p><kbd>← ↑ → ↓</kbd><span>Сдвиг на 1, с Shift — на 10</span></p><p><kbd>Delete</kbd><span>Удалить выбранный объект</span></p><p><kbd>+ / −</kbd><span>Масштаб</span></p><p><kbd>0</kbd><span>Сбросить вид</span></p><p><kbd>Esc</kbd><span>Закрыть обсуждение, отменить инструмент</span></p></div></details>
 <div class="canvas-status"><span>{{editable?'Редактирование':'Только просмотр'}}</span></div>
 <div v-if="tooltip" class="hud-tooltip" :style="{left:tooltip.left+'px',bottom:tooltip.bottom+'px'}" role="tooltip">{{tooltip.text}}</div>
 <nav class="board-hud" aria-label="Инструменты доски" @pointerover="hudHover" @pointerleave="tooltip=null" @focusin="hudHover" @focusout="tooltip=null">
 <button data-tip="Найти объект или файл" aria-label="Поиск по пространству" @click="layerPanel?.focusSearch()"><UIcon name="i-lucide-search"/></button>
 <button data-tip="Выделение" aria-label="Выделение" :class="{active:tool==='select'}" @click="tool='select'"><UIcon name="i-lucide-mouse-pointer-2"/></button><button data-tip="Перемещение" aria-label="Перемещение" :class="{active:tool==='hand'}" @click="tool='hand'"><UIcon name="i-lucide-hand"/></button><span class="hud-divider"></span>
 <button v-if="editable" type="button" data-tip="Карточка ссылки" aria-label="Добавить карточку ссылки"
   :disabled="busy" @click="openWebLinkEditor()"><UIcon name="i-lucide-link-2" /></button>
 <template v-if="editable"><button data-tip="Маркер (B)" aria-label="Маркер" :class="{active:tool==='pen'}" @click="tool='pen'"><UIcon name="i-lucide-pencil"/></button><button data-tip="Фломастер (M)" aria-label="Фломастер" :class="{active:tool==='highlighter'}" @click="tool='highlighter'"><UIcon name="i-lucide-highlighter"/></button><button data-tip="Ластик (E)" aria-label="Ластик" :class="{active:tool==='eraser'}" @click="tool='eraser'"><UIcon name="i-lucide-eraser"/></button><button class="note-tool" data-tip="Заметка" aria-label="Добавить заметку" :disabled="busy" @click="add('note')"><span></span></button><button data-tip="Фигуры" aria-label="Фигуры" @click="showPanel('shape')"><UIcon name="i-lucide-square"/></button><button data-tip="Прозрачный контурный блок" aria-label="Прозрачный контурный блок" :disabled="busy" @click="add('frame')"><UIcon name="i-lucide-square-dashed"/></button><button data-tip="Связь: выберите два объекта" aria-label="Добавить связь" :class="{active:tool==='link'}" @click="tool=tool==='link'?'select':'link'"><UIcon name="i-lucide-move-up-right"/></button><span class="hud-divider"></span><button data-tip="Текст (T): нажмите на доску" aria-label="Добавить текст" :class="{active:tool==='text'}" @click="tool='text'"><UIcon name="i-lucide-type"/></button><button data-tip="To-do" aria-label="Добавить To-do" :disabled="busy" @click="add('todo')"><UIcon name="i-lucide-list-todo"/></button><button data-tip="Таблица" aria-label="Добавить таблицу" :disabled="busy" @click="add('table')"><UIcon name="i-lucide-table-2"/></button><button data-tip="Spec" aria-label="Добавить Spec" :disabled="busy" @click="add('spec')"><UIcon name="i-lucide-clipboard-list"/></button><button data-tip="Комментарий (C): нажмите на доску" aria-label="Добавить комментарий" :class="{active:tool==='comment'}" @click="tool='comment'"><UIcon name="i-lucide-message-circle"/></button><button data-tip="Подписка" aria-label="Подписка" @click="showPanel('subscription')"><UIcon name="i-lucide-repeat-2"/></button><button data-tip="Календарь" aria-label="Календарь" @click="add('calendar')"><UIcon name="i-lucide-calendar-days"/></button><button v-if="canShowTaskPlanning" data-tip="Календарь задач проекта" aria-label="Добавить календарь задач проекта" :disabled="busy" @click="add('task-calendar')"><UIcon name="i-lucide-calendar-check"/></button><button v-if="canShowTaskPlanning" data-tip="Диаграмма Ганта проекта" aria-label="Добавить диаграмму Ганта проекта" :disabled="busy" @click="add('task-gantt')"><UIcon name="i-lucide-chart-gantt"/></button><UPopover v-model:open="bookingTools" :portal="fullscreen ? root : true" :content="{ side: 'top', align: 'center' }">
   <button type="button" data-tip="Переговорная комната" aria-label="Объекты переговорной" :disabled="busy"><UIcon name="i-lucide-calendar-clock"/></button>
   <template #content>
     <div class="grid gap-1 p-2" aria-label="Объекты переговорной">
       <UButton label="Карточка брони" icon="i-lucide-calendar-clock" color="neutral" variant="ghost" @click="bookingTools=false; bookingPicker=true" />
       <UButton label="Календарь броней" icon="i-lucide-calendar-days" color="neutral" variant="ghost" @click="addBookingPlanning('booking-calendar')" />
       <UButton label="Гант броней" icon="i-lucide-chart-gantt" color="neutral" variant="ghost" @click="addBookingPlanning('booking-gantt')" />
     </div>
   </template>
 </UPopover><button data-tip="Карточка пространства" aria-label="Карточка пространства" @click="portalOpen=!portalOpen;attaching=false"><UIcon name="i-lucide-orbit"/></button><span class="hud-divider"></span><button data-tip="Задача Кабана" aria-label="Задача Кабана" @click="showTaskPicker"><UIcon name="i-lucide-columns-3"/></button><button data-tip="Пароль" aria-label="Пароль" @click="showPanel('password')"><UIcon name="i-lucide-key-round"/></button><button data-tip="Чат проекта" aria-label="Чат проекта" @click="showPanel('chat')"><UIcon name="i-lucide-messages-square"/></button><button data-tip="Участник проекта" aria-label="Участник проекта" @click="showPanel('person')"><UIcon name="i-lucide-user-round"/></button><button data-tip="Загрузить изображение или документ" aria-label="Загрузить файл" @click="fileInput?.click()"><UIcon name="i-lucide-paperclip"/></button><button data-tip="Документы проекта" aria-label="Документы проекта" @click="attaching=!attaching;portalOpen=false"><UIcon name="i-lucide-folder-open"/></button><button data-tip="Удалить выбранный объект" aria-label="Удалить выбранный объект" :disabled="!selection.size||busy" @click="groupAction('delete')"><UIcon name="i-lucide-trash-2"/></button></template><span class="hud-divider"></span><button class="zoom-tool" data-tip="Сбросить масштаб" @click="zoom=1;offset.x=150;offset.y=100">{{Math.round(zoom*100)}}%</button></nav>
 </div></template>
 <div v-if="settingsOpen" class="settings-overlay" @click.self="settingsOpen=false"><section class="space-settings" role="dialog" aria-modal="true" aria-label="Настройки пространства"><header><h3>Настройки пространства</h3><button @click="settingsOpen=false">Закрыть</button></header><form @submit.prevent="saveSettings"><label>Название<input v-model="spaceName" maxlength="120" required></label><label>Описание<textarea v-model="spaceDescription" maxlength="2000" rows="3"/></label><button class="primary" :disabled="busy">Применить</button></form><h4>Участники</h4><div v-for="member in project.members.filter(m=>m.hasAccess&&m.permission!=='hidden')" :key="member.userId" class="member-row"><span>{{member.fullName||member.email}}</span><strong v-if="member.userId===currentSpace?.created_by">Создатель</strong><select v-else :value="participantPermission(member.userId)" :disabled="busy" @change="run(()=>send('access',session,{userId:member.userId,permission:($event.target as HTMLSelectElement).value}))"><option value="viewer">Просмотр</option><option value="editor">Редактирование</option></select></div><div class="delete-space"><p v-if="deleteConfirm">Удалить пространство и все его объекты? Это действие нельзя отменить.</p><button v-if="!deleteConfirm" class="danger" @click="deleteConfirm=true">Удалить пространство</button><template v-else><button @click="deleteConfirm=false">Отмена</button><button class="danger" :disabled="busy" @click="removeSpace">Удалить навсегда</button></template></div><p v-if="error" class="text-red-500">{{error}}</p></section></div>
 <div v-if="pendingFile" class="settings-overlay"><section class="space-settings" role="dialog" aria-modal="true" aria-label="Загрузка файла"><header><h3>Загрузка файла</h3><button @click="pendingFile=null">Отмена</button></header><p>{{pendingFile.name}}</p><label class="upload-choice"><input v-model="saveToDocuments" type="checkbox">Также сохранить в документы проекта</label><p v-if="!saveToDocuments" class="upload-hint">Файл останется только в этом пространстве.</p><label v-else>Папка назначения<select v-model="folderDestination"><option value="">/ — корень документов</option><option v-for="folder in docs.folders.data.value" :key="folder.id" :value="folder.id">{{folderPath(folder.id)}}</option></select></label><p v-if="error">{{error}}</p><button class="primary" :disabled="busy" @click="confirmUpload">Загрузить и прикрепить</button></section></div>
 <div v-if="resourcePanel" class="settings-overlay" @click.self="resourcePanel=null"><section class="space-settings resource-picker" role="dialog" aria-modal="true"><header><h3>{{resourcePanel==='shape'?'Фигуры':resourcePanel==='person'?'Участник проекта':resourcePanel==='chat'?'Чаты проекта':resourcePanel==='subscription'?'Подписки':'Пароли'}}</h3><button @click="resourcePanel=null">Закрыть</button></header><input v-if="resourcePanel!=='shape'" v-model="resourceSearch" placeholder="Поиск…"><template v-if="resourcePanel==='shape'"><button v-for="shape in [{id:'rectangle',name:'Прямоугольник'},{id:'ellipse',name:'Круг / овал'},{id:'diamond',name:'Ромб'},{id:'triangle',name:'Треугольник'},{id:'hexagon',name:'Шестиугольник'},{id:'pill',name:'Скруглённый блок'}]" :key="shape.id" @click="add('shape',undefined,{shape:shape.id});resourcePanel=null">{{shape.name}}</button></template>
 <template v-else-if="resourcePanel==='person'"><label>Роль на доске<input v-model="personRole" maxlength="200" placeholder="Например, дизайнер"></label><label>Что будет делать<textarea v-model="personDuty" maxlength="2000" rows="3"/></label><button v-for="member in project.members.filter(m=>m.hasAccess&&m.permission!=='hidden'&&(m.fullName||m.email).toLowerCase().includes(resourceSearch.toLowerCase()))" :key="member.userId" @click="add('person',undefined,{personId:member.userId,role:personRole,duty:personDuty});resourcePanel=null">{{member.fullName||member.email}}</button></template>
 <template v-else-if="resourcePanel==='chat'"><button v-for="chat in chats.filter(c=>c.name.toLowerCase().includes(resourceSearch.toLowerCase()))" :key="chat.id" @click="add('chat',undefined,{chatId:chat.id});resourcePanel=null">{{chat.name}}</button><p v-if="!chats.length">Нет доступных бесед проекта.</p></template>
 <template v-else-if="resourcePanel==='subscription'"><button class="primary" @click="subCreating=!subCreating">Новая подписка</button><form v-if="subCreating" @submit.prevent="createSubscription"><label>Название<input v-model="subForm.title" required maxlength="120"></label><label>Стоимость<input v-model.number="subForm.price" type="number" min="0" step="0.01" required></label><label>Валюта<select v-model="subForm.currency"><option>RUB</option><option>USD</option><option>EUR</option><option>CNY</option></select></label><label>Период<input v-model.number="subForm.periodCount" type="number" min="1" max="1000"><select v-model="subForm.periodUnit"><option value="month">Месяц</option><option value="year">Год</option><option value="day">День</option></select></label><UFormField label="С даты" required><SharedDatePicker v-model="subForm.startsOn" required class="w-full"/></UFormField><UFormField label="Оплачено до" required><SharedDatePicker v-model="subForm.paidUntil" :min="subForm.startsOn" required class="w-full"/></UFormField><p>Новая подписка сохранится в ваших личных подписках. Доступ других участников зависит от прав на карточку.</p><button class="primary" :disabled="busy">Создать и прикрепить</button></form><button v-for="subscription in subscriptions.filter(s=>s.title.toLowerCase().includes(resourceSearch.toLowerCase()))" :key="subscription.source.sourceId+subscription.source.entryId" @click="add('subscription',undefined,{subscriptionSource:subscription.source});resourcePanel=null">{{subscription.title}} · {{subscription.sourceName}}</button></template>
 <template v-else><button class="primary" @click="newPassword=!newPassword">Новый пароль</button><form v-if="newPassword" @submit.prevent="attachPassword()"><label>Название<input v-model="passwordForm.title" required maxlength="120"></label><label>Адрес<input v-model="passwordForm.url" maxlength="2000"></label><label>Логин<input v-model="passwordForm.username" maxlength="300" autocomplete="off"></label><label>Пароль<input v-model="passwordForm.password" type="password" maxlength="1024" autocomplete="new-password"></label><label>Примечание<textarea v-model="passwordForm.notes" maxlength="10000"/></label><button class="primary" :disabled="busy">Создать в паролях проекта и прикрепить</button></form><h4>Пароли проекта</h4><button v-for="password in passwords.filter(p=>p.entry.title.toLowerCase().includes(resourceSearch.toLowerCase()))" :key="password.id" @click="add('password',undefined,{passwordId:password.id});resourcePanel=null">{{password.entry.title}}</button><h4>Из ваших хранилищ</h4><p class="upload-hint">Выбранный пароль будет скопирован в «Пароли проекта» и станет доступен его участникам.</p><button v-for="choice in passwordChoices.filter(p=>p.title.toLowerCase().includes(resourceSearch.toLowerCase()))" :key="`${choice.source.kind}-${choice.source.sourceId}-${choice.source.entryId}`" :disabled="busy" @click="attachPassword(choice.source)">{{choice.title}} · {{choice.sourceName}} — скопировать и прикрепить</button></template><p v-if="error">{{error}}</p></section></div>
 <BookingPicker v-if="bookingPicker" :portal="fullscreen ? root : undefined" @choose="attachBooking" @close="bookingPicker=false" />
 <ChatTaskPicker v-if="taskPicker" :project-id="project.id" attachment-hint="Задача сохранится в Кабане и будет прикреплена к пространству." @choose="attachTask" @close="closeTaskPicker"/>
 <div v-if="calendarEditing" class="settings-overlay"><section class="space-settings calendar-editor" role="dialog" aria-modal="true" aria-label="События календаря"><header><h3>События и интервалы</h3><button @click="calendarEditing=null">Отмена</button></header><form ref="calendarEventForm" @submit.prevent="addEvent"><input v-model="eventForm.title" maxlength="200" placeholder="Название события" required><SharedDateTimePicker v-model="eventForm.start" label="Начало" required/><SharedDateTimePicker v-model="eventForm.end" label="Конец" required/><select v-model="eventForm.type"><option value="event">Событие</option><option value="range">Выделенный интервал</option></select><input v-model="eventForm.color" type="color"><button>Добавить в календарь</button></form><p v-if="calendarError">{{calendarError}}</p><div v-for="(event,index) in calendarDraft" :key="event.id" class="calendar-event-row"><span :style="{background:event.color}"></span><div><strong>{{event.title}}</strong><p>{{new Date(event.start).toLocaleString('ru-RU')}} — {{new Date(event.end).toLocaleString('ru-RU')}}</p></div><button @click="calendarDraft.splice(index,1)">Удалить</button></div><button class="primary" :disabled="busy" @click="applyCalendar">Применить</button></section></div>
 <div v-if="groupDialog" class="settings-overlay" @click.self="groupDialog=null"><section class="space-settings" role="dialog" aria-modal="true"><header><h3>{{groupDialog==='copy'?'Копировать':'Перенести'}} {{selection.size}} объектов</h3><button @click="groupDialog=null">Отмена</button></header><label>Пространство назначения<select v-model="groupTarget"><option value="">Выберите пространство</option><option v-for="target in spaces.filter(s=>s.id!==space&&['owner','editor'].includes(s.permission))" :key="target.id" :value="target.id">{{target.name}}</option></select></label><p>Вложения и связи между выбранными объектами сохранятся.</p><button class="primary" :disabled="!groupTarget||busy" @click="groupAction(groupDialog!)">{{groupDialog==='copy'?'Копировать':'Перенести'}}</button><p v-if="error">{{error}}</p></section></div>
 <ProjectImageViewer :file="imagePreview?.file ?? null" :load="fileContent" :portal="fullscreen ? root : undefined" @close="imagePreview = null">
   <template #actions>
     <UButton v-if="imagePreview && documentEditor(imagePreview.file.name)" label="Открыть в PhotoCraft" icon="i-lucide-external-link" color="neutral" variant="soft" @click="open(imagePreview.item, false, true)" />
   </template>
 </ProjectImageViewer>
 <UModal :open="!!webLinkEditor" :title="webLinkEditor?.id ? 'Редактировать ссылку' : 'Добавить ссылку'"
   :portal="fullscreen ? root : true" :dismissible="!busy" :close="!busy" :ui="{ content: 'z-[1100]' }"
   @update:open="value => { if (!value && !busy) webLinkEditor = null }">
   <template #body>
     <form class="grid gap-4" @submit.prevent="saveWebLink">
       <UFormField label="Адрес ссылки" required>
         <UInput v-model="webLinkForm.url" type="url" required :maxlength="spaceWebLinkMaxLength"
           placeholder="https://github.com/owner/repository.git" class="w-full" :disabled="busy" autofocus />
       </UFormField>
       <UFormField label="Название">
         <UInput v-model="webLinkForm.name" maxlength="120" class="w-full" :disabled="busy" />
       </UFormField>
       <p v-if="webLinkError" role="alert" class="text-sm text-error">{{ webLinkError }}</p>
       <div class="flex justify-end gap-2">
         <UButton label="Отмена" type="button" variant="ghost" color="neutral" :disabled="busy" @click="webLinkEditor=null" />
         <UButton type="submit" :label="webLinkEditor?.id ? 'Сохранить' : 'Добавить'" :loading="busy" />
       </div>
     </form>
   </template>
 </UModal>
 <UModal
   :open="!!officePreview"
   :title="officePreview?.file.name || 'Просмотр документа'"
   :portal="fullscreen ? root : true"
   :transition="false"
   :ui="{ content: 'z-[1100]', wrapper: 'min-w-0 flex-1', title: 'truncate', body: 'min-h-0 bg-slate-100 dark:bg-slate-900' }"
   fullscreen
   @update:open="value => { if (!value) officePreview = null }"
 >
   <template #actions>
     <UButton v-if="officePreview" class="me-10 shrink-0" color="neutral" variant="soft" icon="i-lucide-external-link"
       :label="`Открыть в ${documentEditor(officePreview.file.name)?.label}`" @click="open(officePreview.item, false, true)" />
   </template>
   <template #body>
     <template v-if="officePreviewContent?.kind === 'image'">
       <p class="mb-3 text-center text-sm">Первая страница</p>
       <img :src="officePreviewContent.src" alt="Первая страница документа" class="mx-auto h-auto max-w-full bg-white shadow-sm">
     </template>
     <template v-else-if="officePreviewContent?.kind === 'cells'">
       <p class="mb-3 text-sm">Лист «{{officePreviewContent.sheet}}»</p>
       <div class="overflow-auto">
         <table class="office-preview-cells w-full bg-white text-sm text-slate-900" :aria-label="officePreviewContent.sheet">
           <tbody>
             <tr v-for="(row, r) in officePreviewContent.rows" :key="r">
               <td v-for="(cell, c) in row" :key="c">{{cell || ' '}}</td>
             </tr>
           </tbody>
         </table>
       </div>
     </template>
     <div v-else-if="officePreviewContent?.kind === 'unavailable'" class="space-y-3">
       <p role="alert">Не удалось показать содержимое файла.</p>
       <UButton v-if="officePreview" label="Повторить" color="neutral" variant="outline" @click="officePreview = {...officePreview}" />
     </div>
     <p v-else role="status">Готовим предпросмотр…</p>
   </template>
 </UModal>
</section>
</template>
<style scoped>
.space-object.file-preview {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  padding: 0;
}
.space-object.file-preview.file-preview-sized { height: var(--board-card-height); }
.space-object.file-preview.content-only { grid-template-rows: minmax(0, 1fr); }
.space-object.content-only {
  border-color: transparent;
  background: transparent !important;
  box-shadow: none;
}
.file-preview > .board-file-content {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-radius: 9px 9px 0 0;
}
.file-preview.content-only > .board-file-content { border-radius: 0; }
.file-preview.file-preview-sized > .board-file-content { container-type: size; }
.file-preview > .board-file-name {
  margin: 0;
  padding: 6px 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-preview .board-image,
.file-preview .file-page {
  display: block;
  box-sizing: border-box;
  margin: 0;
  border: 0;
  object-fit: contain;
}
.file-preview:not(.file-preview-sized).content-only .board-image { height: 110px; }
.file-preview.file-preview-sized .board-image,
.file-preview.file-preview-sized .file-page { height: 100%; max-height: none; }
.file-preview .file-cells { margin: 0; background: white; }
.file-preview.file-preview-sized .file-cells {
  height: 100%;
  font-size: clamp(6px, min(calc(8cqw / var(--preview-columns, 2)), calc(50cqh / var(--preview-rows, 5))), 28px);
}
.file-preview.file-preview-sized .file-cells tbody {
  display: grid;
  height: 100%;
  grid-template-rows: repeat(var(--preview-rows, 5), minmax(0, 1fr));
}
.file-preview.file-preview-sized .file-cells tr {
  display: grid;
  grid-template-columns: repeat(var(--preview-columns, 2), minmax(0, 1fr));
}
.file-preview.file-preview-sized .file-cells td {
  display: block;
  align-content: center;
  min-width: 0;
  min-height: 0;
  padding: 0 4px;
  border-top: 0;
  border-left: 0;
  line-height: 1.1;
}
.file-preview.file-preview-sized .file-cells { display: block; border-top: 1px solid #e2e8f0; border-left: 1px solid #e2e8f0; }
.board-image:focus-visible { outline: 2px solid #7c3aed; outline-offset: -2px; }
.board-file-actions {
  position: absolute;
  top: 100%;
  left: 50%;
  margin-top: 10px;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  padding: 4px;
  white-space: nowrap;
  background: white;
  border: 1px solid #d8e0eb;
  border-radius: 9px;
  box-shadow: 0 4px 12px #0f172a18;
}
.office-preview-cells { border-collapse: collapse; }
.office-preview-cells td { min-width: 7rem; padding: .5rem .75rem; border: 1px solid #e2e8f0; overflow-wrap: anywhere; }
.space-world.camera-moving{transition:transform 300ms cubic-bezier(.2,.75,.25,1)}
@media(prefers-reduced-motion:reduce){.space-world.camera-moving{transition:none}}

.spaces{background:white;border:1px solid #e2e8f0;border-radius:18px;overflow:hidden}.space-bar{display:flex;align-items:center;gap:10px;padding:12px;flex-wrap:wrap;border-bottom:1px solid #e2e8f0;font-size:12px}.space-bar form{display:flex;gap:8px}.space-bar input,.space-bar select,button{border:1px solid #dbe2ea;border-radius:7px;padding:7px 10px;background:white}button{cursor:pointer;font-size:12px}button:disabled{opacity:.45;cursor:default}.space-bar>span{color:#64748b}.help{padding:10px 16px;font-size:12px;color:#64748b}.space-canvas{height:65vh;min-height:420px;position:relative;overflow:hidden;touch-action:none;background-color:#f8fafc;background-image:radial-gradient(#cbd5e1 1px,transparent 1px);background-size:24px 24px}.space-world{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none}.space-object{position:absolute;width:220px;min-height:110px;border:1px solid #cbd5e1;border-radius:10px;padding:16px;box-shadow:0 4px 12px #0f172a12;cursor:grab;pointer-events:auto}.space-object.note{border-radius:2px}.space-object.shape{border:2px solid #64748b;text-align:center}.chosen{outline:2px solid #7c3aed;outline-offset:2px}.object-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px}.space-object textarea{width:100%;min-height:120px;font-size:14px;cursor:text}.space-object img{width:100%;max-height:200px;object-fit:contain}.space-object strong{display:block;overflow-wrap:anywhere;font-size:12px;margin-bottom:10px}.todos{display:flex;flex-direction:column;gap:10px;font-size:13px}.todos label{display:flex;gap:8px;overflow-wrap:anywhere}.connections{position:absolute;left:0;top:0;overflow:visible;width:1px;height:1px;pointer-events:none}.edge{pointer-events:stroke;cursor:pointer}.remote-cursor{position:absolute;left:0;top:0;transform-origin:0 0;transition:transform 90ms linear;will-change:transform;pointer-events:none;z-index:100;display:flex;align-items:flex-start;gap:2px}.remote-cursor span{margin-top:18px;padding:3px 7px;border-radius:5px;color:white;white-space:nowrap;font-size:11px}
.spaces.is-fullscreen,.spaces:fullscreen{position:fixed;inset:0;z-index:1000;border-radius:0;display:flex;flex-direction:column;background:white}.spaces.is-fullscreen .space-canvas,.spaces:fullscreen .space-canvas{flex:1;height:auto;min-height:0}.properties label{display:flex;align-items:center;gap:8px}.properties input[type=color]{width:40px;height:32px;padding:2px}.space-object textarea{color:inherit;background:transparent}.space-bar button:focus-visible,.space-bar select:focus-visible{outline:2px solid #7c3aed;outline-offset:2px}

.space-header{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:18px 22px;border-bottom:1px solid #e8edf3}.space-title{display:flex;align-items:center;gap:14px;min-width:0}.space-title>.iconify{font-size:25px;color:#8b5cf6}.space-title h1{font-size:16px;font-weight:650}.space-title p{font-size:12px;color:#94a3b8;max-width:600px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:4px}.space-header-actions{display:flex;align-items:center;gap:10px}.space-header button{display:inline-flex;align-items:center;gap:8px}.live-status{font-size:11px;color:#94a3b8}.live-status.online{color:#059669}.space-catalog{padding:32px;min-height:480px;background:#f8fafc}.catalog-heading{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:26px}.catalog-heading h3{font-size:24px;font-weight:600;margin-top:8px}.catalog-heading h3 span{font-size:13px;color:#94a3b8;margin-left:8px}.eyebrow{font-size:10px;letter-spacing:.15em;color:#94a3b8}.catalog-heading form{display:flex;gap:10px}.catalog-heading input,.space-settings input,.space-settings textarea{border:1px solid #e2e8f0;border-radius:9px;padding:10px 12px;font-size:13px}.primary{background:#7c3aed;color:white;border-color:#7c3aed;display:inline-flex;gap:8px;align-items:center}.space-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:22px}.space-card{padding:0;border-radius:16px;text-align:left;overflow:hidden;transition:transform .2s,box-shadow .2s;background:white;border:1px solid #e2e8f0}.space-card:hover{transform:translateY(-3px);box-shadow:0 12px 30px #0f172a0c}.space-card-preview{height:155px;background-color:hsl(var(--card-hue) 65% 97%);background-image:radial-gradient(#cbd5e1 1px,transparent 1px);background-size:15px 15px;position:relative}.mini-note{position:absolute;left:22%;top:25%;width:70px;height:65px;background:#fff0ac;box-shadow:0 4px 12px #0001;transform:rotate(-7deg);border-radius:3px}.mini-block{position:absolute;right:21%;bottom:25%;width:65px;height:44px;border:2px solid hsl(var(--card-hue) 60% 70%);border-radius:8px;background:white}.mini-line{position:absolute;width:90px;top:53%;left:40%;border-top:2px dashed #a5b4c9;transform:rotate(15deg)}.card-open{position:absolute;right:14px;top:14px;background:white;padding:6px;border-radius:8px;display:flex;color:#7c3aed}.space-card-content{padding:18px}.space-card h4{font-size:15px;font-weight:650}.space-card p{margin-top:7px;color:#94a3b8;min-height:36px;font-size:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.space-card footer{display:flex;justify-content:space-between;border-top:1px solid #f1f5f9;margin-top:14px;padding-top:12px;color:#94a3b8;font-size:10px}.catalog-empty{text-align:center;padding:75px 20px;color:#94a3b8}.catalog-empty>.iconify{font-size:45px;color:#c4b5fd}.catalog-empty h3{font-size:20px;color:#475569;margin:18px 0 8px}.canvas-shell{position:relative;min-height:560px}.space-canvas{height:70vh;min-height:560px}.board-hud{position:absolute;bottom:22px;left:50%;transform:translateX(-50%);max-width:calc(100% - 32px);display:flex;align-items:center;gap:5px;background:#ffffffed;backdrop-filter:blur(20px);border:1px solid #e2e8f0;border-radius:19px;padding:9px;box-shadow:0 12px 35px #0f172a18,0 2px 6px #0f172a08;z-index:110;overflow-x:auto}.board-hud button{display:flex;align-items:center;justify-content:center;flex-shrink:0;border:0;padding:0;width:38px;height:40px;border-radius:10px;background:transparent;color:#334155}.board-hud button .iconify{font-size:22px}.board-hud button:hover{background:#f1f5f9}.board-hud button.active{background:#9747ff;color:white}.hud-divider{height:30px;width:1px;flex-shrink:0;background:#e5e7eb;margin:0 4px}.board-hud .zoom-tool{width:52px;font-size:11px}.note-tool span{display:block;width:24px;height:25px;border-radius:3px;background:#f7a8d6;box-shadow:-4px 3px #fbcfe8;transform:rotate(-7deg)}.canvas-status{position:absolute;left:16px;top:12px;display:flex;gap:12px;font-size:10px;color:#94a3b8;pointer-events:none}.properties{position:absolute;right:14px;top:42px;max-width:calc(100% - 28px);background:white;z-index:120;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 8px 24px #0001}.floating-picker{position:absolute;right:16px;bottom:100px;width:300px;max-height:320px;overflow:auto;background:white;border:1px solid #e2e8f0;border-radius:14px;padding:14px;z-index:121;box-shadow:0 10px 35px #0002;display:flex;flex-direction:column;gap:8px}.floating-picker header{display:flex;justify-content:space-between;align-items:center}.floating-picker>button{text-align:left;display:flex;align-items:center;gap:8px}.portal-card>.iconify{font-size:30px;color:#8b5cf6}.portal-card h3{font-size:16px;font-weight:600;margin:10px 0}.portal-card p{font-size:12px;color:#94a3b8;margin-bottom:16px}.portal-card button{display:flex;gap:8px;align-items:center;color:#7c3aed}.space-object.frame{border-style:solid;border-radius:12px}.space-object.spec{padding:26px;min-height:420px}.object-caption{display:flex;gap:8px;align-items:center;color:#94a3b8;font-size:11px;margin-bottom:18px}.object-caption button{margin-left:auto;font-size:10px}.spec-document h1{font-size:28px;font-weight:650;margin:18px 0}.spec-document h2{font-size:21px;font-weight:600;margin:16px 0}.spec-document h3{font-size:17px;font-weight:600;margin:12px 0}.spec-document p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.8}.spec-document textarea{min-height:330px;line-height:1.7}.board-table{overflow:auto}.board-table table{width:100%;border-collapse:collapse;table-layout:fixed}.board-table td{border:1px solid #e2e8f0;min-width:90px}.board-table tr:first-child{background:#f8fafc;font-weight:600}.board-table input{width:100%;min-width:65px;padding:9px;font-size:12px;background:transparent}.table-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:12px}.table-actions button{font-size:10px;padding:5px}.comment-thread h3{font-size:14px;font-weight:600}.comment-thread form{display:flex;gap:6px;margin:14px 0}.comment-thread form input{min-width:0;width:100%;font-size:12px;border-bottom:1px solid #e2e8f0}.comment-messages{max-height:260px;overflow:auto}.comment-messages article{margin-top:12px;padding:10px;background:#f8fafc;border-radius:8px;font-size:12px}.comment-messages p{white-space:pre-wrap;overflow-wrap:anywhere}.comment-messages time{display:block;font-size:9px;color:#94a3b8;margin-top:6px}.settings-overlay{position:absolute;inset:0;z-index:200;background:#0f172a55;display:flex;justify-content:center;align-items:center;padding:20px}.space-settings{width:520px;max-width:100%;max-height:90%;overflow:auto;border-radius:18px;background:white;padding:24px;box-shadow:0 30px 90px #0003}.space-settings header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}.space-settings h3{font-size:18px;font-weight:600}.space-settings form{display:flex;flex-direction:column;gap:15px}.space-settings label{display:flex;flex-direction:column;gap:6px;font-size:12px}.space-settings h4{font-size:14px;font-weight:600;margin:24px 0 14px}.member-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px 0;font-size:12px;border-bottom:1px solid #f1f5f9}.member-row select{border:1px solid #e2e8f0;padding:7px;border-radius:7px}.delete-space{margin-top:24px;padding-top:16px;border-top:1px solid #fee2e2;font-size:12px}.delete-space p{margin-bottom:12px;color:#b91c1c}.danger{color:#dc2626;border-color:#fecaca}.spaces{position:relative}.spaces.is-fullscreen .canvas-shell,.spaces:fullscreen .canvas-shell{flex:1;min-height:0;display:flex;flex-direction:column}.spaces.is-fullscreen .space-canvas,.spaces:fullscreen .space-canvas{flex:1;min-height:0}.spaces.previewing{z-index:40}.spaces.is-fullscreen .space-catalog{flex:1;overflow:auto}@media(max-width:800px){.space-header{padding:14px;gap:10px}.catalog-heading{align-items:stretch;flex-direction:column}.catalog-heading form{flex-wrap:wrap}.space-catalog{padding:20px}.board-hud{bottom:14px;gap:2px;padding:7px}.board-hud button{width:34px;height:36px}.space-title p{max-width:180px}.live-status{display:none}}

.space-object.frame{border-style:dashed;pointer-events:none;z-index:0;border-radius:8px}.space-object:not(.frame):not(.comment){z-index:1}.space-object.comment{z-index:30;cursor:grab}.space-object.comment:has(.opened){z-index:35}.frame-hit{position:absolute;pointer-events:auto}.frame-hit.top,.frame-hit.bottom{left:0;right:0;height:10px}.frame-hit.top{top:-5px}.frame-hit.bottom{bottom:-5px}.frame-hit.left,.frame-hit.right{top:0;bottom:0;width:10px}.frame-hit.left{left:-5px}.frame-hit.right{right:-5px}.frame-label{position:absolute;left:12px;top:-27px;max-width:calc(100% - 24px);pointer-events:auto;color:inherit;font-size:12px;cursor:grab;white-space:nowrap}.frame-label textarea{min-height:32px;width:200px;background:white;white-space:normal}.resize-handle{position:absolute;width:12px;height:12px;padding:0;border:2px solid #8b5cf6;background:white;border-radius:2px;pointer-events:auto;z-index:3}.resize-handle.nw{left:-7px;top:-7px;cursor:nwse-resize}.resize-handle.ne{right:-7px;top:-7px;cursor:nesw-resize}.resize-handle.sw{left:-7px;bottom:-7px;cursor:nesw-resize}.resize-handle.se{right:-7px;bottom:-7px;cursor:nwse-resize}.space-object.text{border-radius:0}.space-object.text .object-text{font-size:18px;line-height:1.45}.comment-pin{position:relative;width:32px;height:32px;padding:0;border:2px solid white;background:#8b5cf6;color:white;border-radius:50% 50% 50% 5px;box-shadow:0 3px 10px #0002;display:flex;align-items:center;justify-content:center}.comment-pin .iconify{font-size:18px}.comment-pin.resolved{background:#94a3b8}.comment-pin.opened{outline:2px solid #c4b5fd;outline-offset:2px}.comment-pin small{position:absolute;right:-7px;top:-7px;background:white;color:#7c3aed;border-radius:12px;min-width:16px;font-size:9px;border:1px solid #ddd6fe}.comment-popover{position:absolute;width:320px;max-width:calc(100% - 20px);max-height:calc(100% - 40px);overflow:auto;z-index:130;border:1px solid #e2e8f0;border-radius:16px 16px 16px 3px;background:white;padding:20px;box-shadow:0 12px 35px #0f172a22}.close-comment{position:absolute;right:8px;top:7px;border:0;padding:0 6px;font-size:20px}.comment-popover .object-caption{padding-right:12px}.comment-popover .comment-messages{max-height:210px}.keyboard-help{position:absolute;left:14px;bottom:22px;z-index:125;font-size:12px}.keyboard-help summary{display:flex;align-items:center;gap:8px;list-style:none;cursor:pointer;background:white;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;box-shadow:0 4px 14px #0f172a12}.keyboard-help summary::-webkit-details-marker{display:none}.keyboard-list{position:absolute;left:0;bottom:48px;width:320px;max-height:440px;overflow:auto;background:white;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 10px 30px #0002;padding:16px}.keyboard-list p{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:9px 0;font-size:11px}.keyboard-list kbd{font-family:inherit;white-space:nowrap;min-width:36px;padding:3px 5px;border:1px solid #e2e8f0;border-radius:5px;background:#f8fafc;text-align:center;font-size:10px}.keyboard-list span{text-align:right;color:#64748b}.space-canvas.panning{cursor:grab}.space-canvas.panning:active{cursor:grabbing}.space-canvas.placing{cursor:crosshair}.back-space{font-size:11px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:1100px){.keyboard-help{bottom:88px}.back-space{max-width:170px}.space-title p{max-width:200px}}
.web-link-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.web-link-header > .iconify { color: #8b5cf6; font-size: 22px; }
.web-link-header button { display: inline-flex; padding: 5px; }
.web-link-card .web-link-address { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.web-link-card a { display: inline-flex; align-items: center; gap: 5px; text-decoration: underline; }
.web-link-card a:focus-visible { outline: 2px solid #7c3aed; outline-offset: 3px; }
.frame-label{left:auto;right:0;top:-46px;font-size:26px;font-weight:650;text-align:right;max-width:100%;line-height:1.3}.extra-contour{position:absolute;border-style:dashed;border-radius:6px;pointer-events:none}.resource-card>.iconify{font-size:26px;color:#8b5cf6}.resource-card small{display:block;font-size:9px;letter-spacing:.12em;color:#94a3b8;margin:10px 0}.resource-card h3{font-size:15px;font-weight:650;margin:10px 0;overflow-wrap:anywhere}.resource-card p{font-size:12px;color:#64748b;white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0}.resource-card a{font-size:12px;color:#7c3aed}.resource-card code{display:block;overflow-wrap:anywhere;margin:12px 0;font-size:12px}.person-avatar{display:flex;align-items:center;justify-content:center;width:42px;height:42px;background:#ede9fe;color:#7c3aed;border-radius:50%;font-weight:600;font-size:20px}.person-role{font-weight:600}.resource-picker{display:flex;flex-direction:column;gap:10px}.resource-picker>button{text-align:left}.resource-picker label{display:grid;gap:6px}.upload-choice{display:flex!important;flex-direction:row!important;align-items:center;gap:8px;margin:18px 0}.upload-hint{font-size:12px;line-height:1.6;color:#94a3b8;margin:12px 0}.space-settings select{border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin:10px 0}.space-object.shape-ellipse{border-radius:50%;min-height:150px;display:flex;align-items:center;justify-content:center}.space-object.shape-pill{border-radius:60px}.space-object.shape-diamond{clip-path:polygon(50% 0,100% 50%,50% 100%,0 50%);border:0;padding:45px 35px;min-height:180px;}.space-object.shape-triangle{clip-path:polygon(50% 0,100% 100%,0 100%);border:0;padding:75px 38px 25px;min-height:180px;}.space-object.shape-hexagon{clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%);border:0;padding:40px;min-height:150px;}
.ink-layer{position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none;z-index:2}.ink-hit{pointer-events:stroke;cursor:crosshair}

.space-canvas{-webkit-user-select:none;user-select:none}.space-canvas input,.space-canvas textarea{user-select:text;-webkit-user-select:text}.space-canvas.panning,.space-canvas.panning *{user-select:none!important;-webkit-user-select:none!important}.card-properties{position:absolute;right:14px;top:42px;width:300px;max-height:calc(100% - 150px);overflow:auto;z-index:120;background:white;border:1px solid #e2e8f0;border-radius:14px;box-shadow:0 10px 30px #0001;padding:14px}.properties-section{display:flex;flex-direction:column;gap:12px;font-size:12px;padding-bottom:14px;margin-bottom:14px;border-bottom:1px solid #f1f5f9}.properties-section label{display:flex;align-items:center;justify-content:space-between;gap:10px}.properties-section input:not([type=color]):not([type=checkbox]),.properties-section select{width:130px;border:1px solid #e2e8f0;border-radius:7px;padding:6px;font-size:12px}.inspector-apply,.inline-actions{display:flex;gap:8px;margin-top:12px}.inline-editor textarea{min-height:100px;width:100%;padding:8px;border:1px solid #c4b5fd;border-radius:8px}.inline-editor button{margin-top:8px}.todo-edit-row{display:flex;align-items:center;gap:8px;margin:8px 0}.todo-edit-row input:not([type=checkbox]){min-width:0;flex:1;border:1px solid #e2e8f0;border-radius:7px;padding:7px;font-size:inherit}.todo-edit-row button{border:0}.space-object .object-text,.space-object .resource-card h3,.space-object .resource-card p,.space-object .resource-card code,.space-object .portal-card h3,.space-object .portal-card p,.space-object .todos,.space-object .board-table input{font-size:inherit;font-family:inherit;font-weight:inherit}.space-object .resource-card h3,.space-object .portal-card h3{font-size:1.1em}.frame-label.title-top-right{left:auto;right:0;top:-46px;text-align:right}.frame-label.title-top-left{left:0;right:auto;text-align:left}.frame-label.title-top-center{left:50%;right:auto;transform:translateX(-50%);text-align:center}.frame-label.title-bottom-left{left:0;right:auto;top:auto;bottom:-46px;text-align:left}.frame-label.title-bottom-center{left:50%;right:auto;top:auto;bottom:-46px;transform:translateX(-50%);text-align:center}.frame-label.title-bottom-right{left:auto;right:0;top:auto;bottom:-46px;text-align:right}.file-page{height:220px;object-fit:contain;background:white;border:1px solid #e2e8f0;margin-bottom:12px}.file-cells{width:100%;table-layout:fixed;border-collapse:collapse;font-size:10px;margin-bottom:12px}.file-cells td{border:1px solid #e2e8f0;padding:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.thumbnail-status{font-size:10px;color:#94a3b8}.hud-tooltip{position:absolute;transform:translateX(-50%);z-index:150;background:#242135;color:white;max-width:240px;text-align:center;padding:8px 12px;border-radius:9px;font-size:11px;pointer-events:none;box-shadow:0 4px 15px #0002}.hud-tooltip:after{content:'';position:absolute;left:50%;bottom:-4px;border:4px solid transparent;border-top-color:#242135;border-bottom:0;transform:translateX(-50%)}
.board-calendar header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;text-transform:capitalize}.board-calendar h3{font-size:1.2em;font-weight:600}.board-calendar header button{border:0;font-size:22px}.calendar-week,.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.calendar-week{color:#94a3b8;text-align:center;font-size:.75em;margin-bottom:8px}.calendar-grid button{min-height:46px;border:0;padding:4px;border-radius:6px;text-align:left;font-size:.8em;overflow:hidden;background:#f8fafc}.calendar-grid button.muted{opacity:.35}.calendar-grid button.today{outline:1px solid #8b5cf6;background:#f5f3ff}.calendar-grid i{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:white;font-size:8px;padding:2px;margin-top:2px;border-radius:3px;font-style:normal}.calendar-add{margin-top:14px;color:#7c3aed;border-style:dashed;width:100%}.calendar-event-row{display:flex;align-items:center;gap:10px;margin:12px 0;font-size:12px}.calendar-event-row>span{width:6px;align-self:stretch;border-radius:5px}.calendar-event-row>div{flex:1}.calendar-event-row p{font-size:10px;color:#94a3b8}.subscription-price{font-size:1.5em!important;color:#7c3aed!important;font-weight:600!important}
.space-object .spec-document h1{font-size:2em}.space-object .spec-document h2{font-size:1.5em}.space-object .spec-document h3{font-size:1.2em}.space-object .spec-document p{font-size:inherit}
.selection-box{position:absolute;border:1px solid #8b5cf6;background:#8b5cf61c;pointer-events:none;z-index:105}.group-toolbar{position:absolute;top:10px;left:50%;transform:translateX(-50%);z-index:125;display:flex;align-items:center;gap:8px;padding:9px 12px;background:white;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 5px 20px #0001;font-size:11px;white-space:nowrap}.header-reveal{display:none}.spaces.is-fullscreen>.space-header,.spaces:fullscreen>.space-header{position:absolute;left:0;right:0;top:0;z-index:180;background:#fffffff5;backdrop-filter:blur(16px);transform:translateY(-100%);opacity:0;transition:transform .2s,opacity .2s;box-shadow:0 4px 20px #0001}.spaces.is-fullscreen>.header-reveal,.spaces:fullscreen>.header-reveal{display:block;position:absolute;left:0;right:0;top:0;height:16px;z-index:179}.spaces.is-fullscreen.header-open>.space-header,.spaces:fullscreen.header-open>.space-header{transform:translateY(0);opacity:1}.spaces.is-fullscreen>.header-reveal:after{content:'';position:absolute;left:50%;top:4px;width:40px;height:3px;transform:translateX(-50%);border-radius:3px;background:#cbd5e1}
.space-canvas:focus{outline:none}
.space-object.layer-group:not(.chosen){border-color:transparent!important}
.space-object.layer-group:not(.chosen) .frame-hit,.space-object.layer-group:not(.chosen) .frame-label{display:none}

.spaces{
  display:flex;flex:1;flex-direction:column;min-width:0;min-height:0;
  border:0;border-radius:0;isolation:isolate
}
.space-header{flex-shrink:0}
.space-catalog{
  flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;
  padding-bottom:calc(80px + env(safe-area-inset-bottom))
}
.space-grid{grid-template-columns:repeat(auto-fill,minmax(min(250px,100%),1fr))}
.canvas-shell,.space-canvas{flex:1;min-height:0}
.canvas-shell{display:flex;flex-direction:column}
.space-canvas{height:auto}
@media(max-width:1700px){
  .spaces:not(.is-fullscreen):not(:fullscreen) .board-hud{bottom:calc(76px + env(safe-area-inset-bottom))}
  .spaces:not(.is-fullscreen):not(:fullscreen) .keyboard-help{bottom:max(22px,env(safe-area-inset-bottom))}
}
@media(max-width:650px){
  .space-header{flex-wrap:wrap}
  .space-header-actions{flex-wrap:wrap;row-gap:6px}
  .space-title>div{min-width:0}
  .space-title h1{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .catalog-heading input{min-width:0;max-width:100%}
}
</style>
