<script setup lang="ts">
import { svgImageUrl } from '~~/shared/utils/media'
import { useKaban } from '~/composables/useKaban'
import WorkspaceSidebar from '../WorkspaceSidebar.vue'
import PasswordHeader from '../PasswordPage/PasswordHeader.vue'
import KabanCategoryNav from './KabanCategoryNav.vue'
import KabanCategoryBrowser from './KabanCategoryBrowser.vue'
import type { KabanCategory } from '~~/shared/types/kaban'
import KabanTaskCard from './KabanTaskCard.vue'
import BoarLogo from '../BoarLogo.vue'
import KabanTaskModal from './KabanTaskModal.vue'
import KabanHistorySettings from './KabanHistorySettings.vue'
const c=reactive(useKaban()),dragged=ref('')
const boardElement=ref<HTMLElement|null>(null)
async function openStage(stageId:string){
 const target=await c.openStage(stageId)
 if(!target)return
 await nextTick()
 boardElement.value?.querySelector<HTMLElement>(`[data-kaban-stage="${CSS.escape(target)}"]`)?.scrollIntoView({block:'nearest',inline:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})
}
const taskFormId=useId(),stageFormId=useId(),archiveTarget=ref<KabanCategory|null>(null)
const selected=computed(()=>c.categories.find(category=>category.id===c.selectedCategory))
const selectedParent=computed(()=>c.categories.find(category=>category.id===selected.value?.parentId))
const colors=['#64748b','#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#a855f7']
function drop(stageId:string){const task=c.displayData?.tasks.find(task=>task.id===dragged.value);dragged.value='';if(task)void c.moveTask(task,stageId)}
let cancelPointerDrag: (()=>void)|undefined
function pointerDrag(event:PointerEvent,id:string){
 if(event.button!==0||c.busy)return
 cancelPointerDrag?.()
 const startX=event.clientX,startY=event.clientY,pointerId=event.pointerId
 const handle=event.currentTarget as HTMLElement
 let moved=false
 handle.setPointerCapture(pointerId)
 function move(next:PointerEvent){
  if(next.pointerId!==pointerId)return
  if(Math.hypot(next.clientX-startX,next.clientY-startY)>6){moved=true;dragged.value=id}
 }
 function cleanup(){
  window.removeEventListener('pointermove',move)
  window.removeEventListener('pointerup',finish)
  window.removeEventListener('pointercancel',cancel)
  if(handle.hasPointerCapture(pointerId))handle.releasePointerCapture(pointerId)
  dragged.value='';cancelPointerDrag=undefined
 }
 function cancel(){cleanup()}
 function finish(next:PointerEvent){
  if(next.pointerId!==pointerId)return
  const stageId=moved?document.elementFromPoint(next.clientX,next.clientY)?.closest<HTMLElement>('[data-kaban-stage]')?.dataset.kabanStage:undefined
  cleanup()
  const task=c.displayData?.tasks.find(task=>task.id===id)
  if(task&&stageId)void c.moveTask(task,stageId)
 }
 cancelPointerDrag=cleanup
 window.addEventListener('pointermove',move)
 window.addEventListener('pointerup',finish)
 window.addEventListener('pointercancel',cancel)
}
onBeforeUnmount(()=>cancelPointerDrag?.())
function notification(notification:{entryId:string|null;vaultId:string|null}){navigateTo({path:'/password',query:{...(notification.entryId?{entry:notification.entryId}:{}),...(notification.vaultId?{vault:notification.vaultId}:{})}})}
</script>
<template>
 <div class="vault-shell kaban-shell">
  <WorkspaceSidebar v-model:vault-id="c.workspaceId" :open="c.mobileOpen" section="КАБАН">
   <nav class="vault-nav" aria-label="Задачи"><button :class="{selected:c.view==='board'&&c.selectedCategory==='all'&&!c.onlyMine&&!c.onlyOverdue}" @click="c.setView('board')"><UIcon name="i-lucide-columns-3"/>Доска задач<span class="nav-count">{{c.totalTasks.filter(task=>!task.archived).length}}</span></button><button :class="{selected:c.onlyMine}" @click="c.setView('board');c.onlyMine=true"><UIcon name="i-lucide-user-round-check"/>Мои задачи</button><button :class="{selected:c.onlyOverdue}" @click="c.setView('board');c.onlyOverdue=true"><UIcon name="i-lucide-clock-alert"/>Просроченные</button><button :class="{selected:c.view==='closed'}" @click="c.setView('closed')"><UIcon name="i-lucide-archive"/>Закрытые задачи<span class="nav-count">{{c.totalTasks.filter(task=>task.archived).length}}</span></button><button :class="{selected:c.view==='history'}" @click="c.setView('history')"><UIcon name="i-lucide-history"/>История изменений</button></nav>
   <div class="sidebar-label category-label"><button type="button" class="kaban-sidebar-heading" @click="c.setView('categories')">КАТЕГОРИИ</button><button v-if="c.canCategorize" aria-label="Создать категорию задач" @click="c.editCategory()"><UIcon name="i-lucide-plus"/></button></div>
   <KabanCategoryNav :categories="c.categories" :active="c.selectedCategory" :count="c.categoryCount" @select="c.chooseCategory"/>
   <div v-if="c.canCategorize" class="kaban-sidebar-actions"><button class="add-category" @click="c.editCategory()"><UIcon name="i-lucide-plus"/>Новая категория</button><button class="add-category" :disabled="!c.categories.some(category=>!category.parentId)" @click="c.editCategory(undefined,selected?.parentId||selected?.id||c.categories.find(category=>!category.parentId)?.id||null)"><UIcon name="i-lucide-folder-plus"/>Новая подкатегория</button></div>
  </WorkspaceSidebar>
  <button v-if="c.mobileOpen" class="sidebar-scrim" aria-label="Закрыть меню" @click="c.mobileOpen=false"/>
  <main class="vault-main"><header class="vault-topbar password-topbar"><PasswordHeader :workspace-name="c.workspaceName" :title="c.view==='categories'?'Категории':'Кабан'" @toggle-menu="c.mobileOpen=!c.mobileOpen" @open-entry="notification"/></header>
   <div class="vault-content kaban-content">
    <div class="page-heading kaban-heading"><div class="kaban-heading-title"><span class="kaban-logo"><BoarLogo/></span><div><h1>{{c.view==='closed'?'Закрытые задачи':c.view==='history'?'История изменений':c.view==='categories'?'Категории':'Кабан'}}<span class="title-dot">.</span></h1><p v-if="c.workspaceId==='all'||selected">{{c.workspaceId==='all'?(c.view==='categories'?'Категории всех доступных хранилищ':'Задачи из всех доступных хранилищ'):selected?`${selectedParent?.name?selectedParent.name+' / ':''}${selected.name}`:''}}</p></div></div><div class="heading-actions"><UButton v-if="selected&&c.canCategorize" icon="i-lucide-pencil" color="neutral" variant="outline" label="Категория" @click="c.editCategory(selected)"/><UButton v-if="selected&&c.canCategorize" icon="i-lucide-archive" color="neutral" variant="outline" label="Закрыть категорию" :disabled="c.busy" @click="archiveTarget=selected"/><UButton v-if="c.view==='board'&&c.displayData?.canManage" icon="i-lucide-settings-2" color="neutral" variant="outline" label="Стадии" :disabled="c.busy" @click="c.editStages"/><UButton v-if="c.displayData?.canEdit&&c.view==='board'" icon="i-lucide-plus" label="Новая задача" :disabled="c.busy||c.loading" @click="c.openTask()"/></div></div>
    <UAlert v-if="c.error" color="error" :description="c.error" :actions="[{label:'Обновить доску',onClick:()=>c.load()}]" class="mb-5"/>
    <UAlert v-if="c.shared.error" color="error" :description="c.shared.error" class="mb-5"/>
    <div v-if="c.workspaceId==='all'&&c.view!=='categories'" class="kaban-board-picker"><p>Показаны задачи всех хранилищ. Выберите хранилище, чтобы открыть его доску отдельно.</p><div><button v-for="source in c.visibleSources" :key="source.id" @click="c.workspaceId=source.id"><img v-if="source.data.svg" :src="svgImageUrl(source.data.svg)" class="vault-display-image" alt=""/><UIcon v-else :name="source.id==='personal'?'i-lucide-user-round':'i-lucide-vault'"/><span><strong>{{source.name}}</strong><small>{{source.id==='personal'?'Личная доска':'Общая доска хранилища'}}</small></span><UIcon name="i-lucide-arrow-up-right"/></button></div></div>
    <p v-if="c.loading&&!c.displayData" class="kaban-loading" role="status">Загружаем доску…</p>
    <KabanCategoryBrowser v-else-if="c.displayData&&c.view==='categories'" :categories="c.categories" :count="c.categoryCount" :can-create="c.canCreateCategories" :can-add-child="c.canAddSubcategory" @select="c.chooseCategory" @create="c.createCategory()" @create-child="c.createCategory"/>
    <template v-else-if="c.displayData&&c.view==='history'">
     <div class="kaban-history-toolbar"><p class="kaban-help">Все изменения задач, категорий, стадий и вложений. Время указано по Москве.</p><div class="kaban-history-actions"><KabanHistorySettings :key="c.workspaceId" :boards="c.workspaces.filter(item=>item.canManage).map(item=>({id:item.board.id,label:c.sourceName(item.board.id)}))" @changed="c.loadHistory()"/><UButton label="Обновить историю" icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="c.historyLoading" @click="c.loadHistory()"/></div></div>
     <div class="kaban-history"><article v-for="event in c.history" :key="event.id"><PersonAvatar :name="event.actor?.fullName||'Система'" :src="event.actor?.avatarUrl"/><div><strong>{{event.label}}</strong><p v-for="detail in event.details" :key="detail">{{detail}}</p><small>{{event.actor?.fullName||event.actor?.email||'Система'}} · {{new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Moscow'}).format(new Date(event.createdAt))}}</small></div></article><p v-if="!c.history.length&&!c.historyLoading" class="kaban-help">Изменений пока нет.</p></div><UButton v-if="c.historyBefore" label="Показать ещё" color="neutral" variant="outline" :loading="c.historyLoading" @click="c.loadHistory(true)"/>
    </template>
    <template v-else-if="c.displayData">
     <div class="kaban-toolbar"><UInput v-model="c.search" icon="i-lucide-search" placeholder="Найти задачу…" aria-label="Поиск задач" class="flex-1"/><UButton color="neutral" :variant="c.onlyMine?'soft':'ghost'" label="Мои задачи" :aria-pressed="c.onlyMine" @click="c.onlyMine=!c.onlyMine"/><UButton color="neutral" :variant="c.onlyOverdue?'soft':'ghost'" label="Просроченные" :aria-pressed="c.onlyOverdue" @click="c.onlyOverdue=!c.onlyOverdue"/><UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" aria-label="Обновить доску" :loading="c.loading" @click="c.load()"/></div>
     <UAlert v-if="!c.displayData.canEdit" title="Доступ только для просмотра" color="neutral" class="mb-4"/>
     <div v-if="c.workspaceId!=='all'&&c.view==='board'&&!c.categoryOptions.length" class="kaban-onboarding"><UIcon name="i-lucide-folder-plus"/><strong>Начните с категории</strong><p>{{c.canCategorize?'Создайте собственную категорию Кабана и добавляйте в неё подкатегории. Категории паролей здесь не используются.':'Попросите администратора хранилища создать категорию или открыть доступ к существующей.'}}</p><UButton v-if="c.canCategorize" label="Создать категорию" icon="i-lucide-plus" @click="c.editCategory()"/></div>
     <div v-if="c.view==='closed'" class="kaban-closed-filters"><UFormField label="Закрыты с"><UInput v-model="c.closedFrom" type="date" aria-label="Закрыты с" :max="c.closedUntil||undefined"/></UFormField><UFormField label="По"><UInput v-model="c.closedUntil" type="date" aria-label="Закрыты по" :min="c.closedFrom||undefined"/></UFormField><UButton label="Сбросить период" color="neutral" variant="ghost" :disabled="!c.closedFrom&&!c.closedUntil" @click="c.closedFrom='';c.closedUntil=''"/><small>По дате закрытия · московское время</small></div><div v-if="c.view==='closed'" class="kaban-closed-grid"><KabanTaskCard v-for="task in c.closedTasks" :key="task.id" :task="task" :controller="c"/><p v-if="!c.closedTasks.length" class="kaban-help">За выбранный период закрытых задач нет.</p></div>
     <p v-if="c.view!=='closed'&&c.workspaceId==='all'&&!c.tasks.length" class="kaban-loading">Нет задач по выбранным условиям.</p>
     <div v-if="c.view!=='closed'" ref="boardElement" class="kaban-board" aria-label="Канбан-доска">
      <section v-for="stage in c.boardStages" :key="stage.id" :data-kaban-stage="stage.id" class="kaban-column" :class="{'is-drop-target':!!dragged}" @dragover.prevent @drop.prevent="drop(stage.id)">
       <header><span class="kaban-stage-dot" :style="{background:stage.color}"/><h2><button v-if="c.workspaceId==='all'" type="button" class="kaban-stage-link" :disabled="c.loading||c.busy" :aria-label="`Открыть доску: ${stage.name}`" @click="openStage(stage.id)">{{stage.name}}</button><template v-else>{{stage.name}}</template></h2><span class="kaban-column-count">{{c.tasks.filter(task=>task.stageId===stage.id).length}}</span><UButton v-if="c.workspaceId!=='all'&&c.displayData.canEdit&&c.view==='board'" size="xs" icon="i-lucide-plus" color="neutral" variant="ghost" :aria-label="`Добавить задачу: ${stage.name}`" :disabled="c.busy" @click="c.openTask(undefined,stage.id)"/></header>
       <div class="kaban-column-body"><KabanTaskCard v-for="task in c.tasks.filter(task=>task.stageId===stage.id)" :key="task.id" :task="task" :done="stage.done" :controller="c" @drag="dragged=$event" @pointer-drag="pointerDrag"/><p v-if="!c.tasks.some(task=>task.stageId===stage.id)" class="kaban-column-empty">{{c.displayData.canEdit?'Перетащите задачу сюда или создайте новую':'Пока нет задач'}}</p></div>
      </section>
     </div>
    </template>
   </div>
  </main>
  <KabanTaskModal :controller="c"/>
  <UModal v-model:open="c.stagesOpen" title="Стадии категорий" description="Категория может иметь собственные стадии. Подкатегории наследуют стадии родителя, пока не задан свой набор. Занятую стадию можно удалить после перемещения задач." :dismissible="!c.busy" :ui="{content:'sm:max-w-3xl'}"><template #body><form :id="stageFormId" class="kaban-stage-editor" @submit.prevent="c.saveStages"><UFormField label="Категория"><USelect :model-value="c.stageCategoryId || '__defaults__'" @update:model-value="c.stageCategoryId = $event === '__defaults__' ? '' : String($event)" :items="[{label:'Стандартные стадии доски',value:'__defaults__'},...(c.data?.categories.filter(item=>!item.archived).map(item=>({label:item.name,value:item.id}))||[])]" class="w-full" :disabled="c.busy" /></UFormField><UCheckbox v-if="c.stageCategoryId && c.data?.categories.find(item=>item.id===c.stageCategoryId)?.stages" v-model="c.stageInherit" label="Вернуть наследование стадий" :disabled="c.busy" /><div v-for="(stage,index) in c.stageDraft" :key="stage.id" class="kaban-stage-edit-row"><UInput v-model="stage.name" :aria-label="`Название стадии ${index+1}`" :maxlength="60" required :disabled="c.busy" class="flex-1"/><input v-model="stage.color" type="color" :aria-label="`Цвет стадии ${index+1}`" :disabled="c.busy"/><UCheckbox v-model="stage.done" label="Готово" :disabled="c.busy"/><UButton type="button" icon="i-lucide-arrow-up" color="neutral" variant="ghost" :aria-label="`Поднять стадию ${index+1}`" :disabled="c.busy||index===0" @click="c.shiftStage(index,-1)"/><UButton type="button" icon="i-lucide-arrow-down" color="neutral" variant="ghost" :aria-label="`Опустить стадию ${index+1}`" :disabled="c.busy||index===c.stageDraft.length-1" @click="c.shiftStage(index,1)"/><UButton type="button" icon="i-lucide-trash-2" color="error" variant="ghost" :aria-label="`Удалить стадию ${stage.name}`" :disabled="c.busy||c.stageDraft.length<=1||c.stageCount(stage.id)>0" @click="c.stageDraft.splice(index,1)"/></div><UButton type="button" icon="i-lucide-plus" label="Добавить стадию" color="neutral" variant="outline" :disabled="c.busy||c.stageDraft.length>=12" @click="c.addStage"/><UAlert v-if="c.stageError" color="error" :description="c.stageError"/></form></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="c.busy" @click="c.stagesOpen=false"/><UButton type="submit" :form="stageFormId" label="Сохранить стадии" :loading="c.busy"/></template></UModal>
  <UModal v-model:open="c.categoryOpen" :title="c.categoryForm.id?'Изменить категорию':'Новая категория задач'" description="Своя категория Кабана. Можно сделать её подкатегорией другой категории." :dismissible="!c.structureBusy"><template #body><form :id="taskFormId" class="space-y-4" @submit.prevent="c.saveCategory"><UFormField v-if="!c.categoryForm.id" label="Хранилище" required><USelect v-model="c.categoryBoardId" :items="c.categoryBoardOptions" :disabled="c.structureBusy" class="w-full" aria-label="Хранилище категории"/></UFormField><UFormField label="Название" required><UInput v-model="c.categoryForm.name" :maxlength="60" required class="w-full"/></UFormField><UFormField label="Родительская категория"><USelect v-model="c.categoryParent" :items="c.parentOptions" class="w-full"/></UFormField><UFormField label="Цвет"><div class="flex gap-2"><button v-for="color in colors" :key="color" type="button" class="kaban-color-choice" :style="{background:color}" :aria-label="`Цвет ${color}`" :aria-pressed="c.categoryForm.color===color" @click="c.categoryForm.color=color"><UIcon v-if="c.categoryForm.color===color" name="i-lucide-check"/></button></div></UFormField><UAlert v-if="c.categoryError" color="error" :description="c.categoryError"/></form></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="c.structureBusy" @click="c.categoryOpen=false"/><UButton type="submit" :form="taskFormId" label="Сохранить категорию" :loading="c.structureBusy"/></template></UModal>
  <UModal :open="!!archiveTarget" title="Закрыть категорию?" description="Категория, её открытые подкатегории и задачи переместятся в «Закрытые задачи». Их можно восстановить." :dismissible="!c.busy" @update:open="value=>{if(!value)archiveTarget=null}"><template #body><p>{{archiveTarget?.name}}</p><UAlert v-if="c.error" color="error" :description="c.error"/></template><template #footer><UButton label="Отмена" color="neutral" variant="outline" :disabled="c.busy" @click="archiveTarget=null"/><UButton label="Закрыть категорию" :loading="c.busy" @click="async()=>{if(archiveTarget){await c.archiveCategory(archiveTarget,true);if(!c.error)archiveTarget=null}}"/></template></UModal>
 </div>
</template>

<style scoped>
.kaban-sidebar-heading{font:inherit;letter-spacing:inherit;text-align:left;cursor:pointer}
.category-label .kaban-sidebar-heading{font:inherit;letter-spacing:inherit}
.kaban-sidebar-heading:hover,.kaban-stage-link:hover{color:var(--ui-primary);text-decoration:underline;text-underline-offset:3px}
.kaban-stage-link{display:block;width:100%;text-align:left;font:inherit;overflow-wrap:anywhere}
</style>
