<script setup lang="ts">
import type {UnwrapNestedRefs} from 'vue'
import type {useKaban} from '~/composables/useKaban'
import type {KabanTask} from '~~/shared/types/kaban'
import PersonAvatar from '../PersonAvatar.vue'
const props=defineProps<{controller:UnwrapNestedRefs<ReturnType<typeof useKaban>>;task:KabanTask;done?:boolean}>()
const c=props.controller
const stage=computed(()=>({done:!!props.done}))
const emit=defineEmits<{drag:[id:string]}>()
</script>
<template><article class="kaban-task-card" :class="{'is-overdue':c.kabanOverdue(task,stage.done),'is-done':stage.done}" :draggable="task.canEdit&&!c.busy&&!task.archived&&c.view==='board'" @dragstart="event=>{emit('drag',task.id);if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',task.id)}}" @dragend="emit('drag','')">
        <UButton v-if="task.canEdit" class="kaban-card-settings" icon="i-lucide-settings-2" color="neutral" variant="ghost" size="xs" :aria-label="`Настройки задачи: ${task.title}`" :disabled="c.busy" @click="c.openTask(task,undefined,true)"/><button class="kaban-task-open" @click="c.openTask(task)"><span class="kaban-task-category">{{c.displayData?.categories.filter(category=>task.categoryIds.includes(category.id)).map(category=>category.name).join(' · ')}}</span><small v-if="c.workspaceId==='all'||task.locations.length>1" class="kaban-task-sources">{{c.taskSourceNames(task)}}</small><strong>{{task.title}}</strong><p v-if="task.description">{{task.description}}</p></button>
        <div class="kaban-task-meta"><span v-if="task.dueOn" :class="{'is-overdue':c.kabanOverdue(task,stage.done)}"><UIcon name="i-lucide-calendar-days"/>{{c.dateLabel(task.dueOn)}}</span><span v-else><UIcon name="i-lucide-calendar-off"/>Без срока</span><span v-if="task.todos.length"><UIcon name="i-lucide-list-checks"/>{{task.todos.filter(item=>item.done).length}} / {{task.todos.length}}</span><span v-if="task.fileCount"><UIcon name="i-lucide-paperclip"/>{{task.fileCount}}</span></div>
        <progress v-if="task.todos.length" :value="task.todos.filter(item=>item.done).length" :max="task.todos.length" aria-label="Прогресс списка дел"/>
<div v-if="c.view==='closed'" class="kaban-task-dates"><span>Создана: {{c.taskStamp(task.createdAt)}}</span><span>{{task.closedAt?'Закрыта: '+c.taskStamp(task.closedAt):'Дата закрытия не сохранена'}}</span></div>
        <footer><span :title="`Создатель: ${c.person(task.creatorId)?.fullName||'Участник'}`"><PersonAvatar :name="c.person(task.creatorId)?.fullName||'Участник'" :src="c.person(task.creatorId)?.avatarUrl"/><small>{{c.person(task.creatorId)?.fullName||'Участник'}}</small></span><span class="kaban-task-avatars"><PersonAvatar v-for="id in task.participantIds.slice(0,3)" :key="id" :name="c.person(id)?.fullName||'Участник'" :src="c.person(id)?.avatarUrl" :title="c.person(id)?.fullName"/><small v-if="task.participantIds.length>3">+{{task.participantIds.length-3}}</small></span></footer>
       </article></template>
