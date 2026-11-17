<script setup lang="ts">
import type { ProjectChatMessage } from '~~/shared/types/project-chats'
const props = defineProps<{ message: ProjectChatMessage; userId?: string; busy: boolean }>()
const emit = defineEmits<{ interact: [body: { action: string; itemId?: string | null; value?: boolean }] }>()
const myVote = computed(() => props.message.votes.find(vote => vote.userId === props.userId)?.optionId)
const count = (id: string) => props.message.votes.filter(vote => vote.optionId === id).length
const percent = (id: string) => props.message.votes.length ? Math.round(count(id) / props.message.votes.length * 100) : 0
const done = (id: string) => props.message.todoStates.find(state => state.itemId === id)?.done ?? false
</script>
<template>
  <section v-if="message.poll" class="chat-poll" aria-label="Голосование"><h3>{{message.poll.question}}</h3><small>{{message.pollClosed?'Голосование завершено':'Один вариант · голос можно изменить'}}</small><button v-for="option in message.poll.options" :key="option.id" class="chat-poll-option" :class="{'is-chosen':myVote===option.id}" :disabled="busy||message.pollClosed" :aria-pressed="myVote===option.id" @click="emit('interact',{action:'vote',itemId:myVote===option.id?null:option.id})"><span class="chat-poll-bar" :style="{width:`${percent(option.id)}%`}"/><span>{{myVote===option.id?'✓ ':''}}{{option.label}}</span><strong>{{count(option.id)}} · {{percent(option.id)}}%</strong></button><div class="chat-poll-footer"><small>Голосов: {{message.votes.length}}</small><UButton v-if="message.authorId===userId&&!message.pollClosed" label="Завершить" color="neutral" variant="ghost" size="xs" :disabled="busy" @click="emit('interact',{action:'close-poll'})"/></div></section>
  <section v-if="message.todo" class="chat-todo" aria-label="Список дел"><h3>{{message.todo.title}}</h3><small>Выполнено: {{message.todo.items.filter(item=>done(item.id)).length}} из {{message.todo.items.length}}</small><UCheckbox v-for="item in message.todo.items" :key="item.id" :model-value="done(item.id)" :label="item.label" :class="{'chat-todo-done':done(item.id)}" :disabled="busy" @update:model-value="value=>emit('interact',{action:'todo',itemId:item.id,value:value===true})"/></section>
</template>
<style scoped>
.chat-poll,.chat-todo{display:grid;gap:10px;min-width:min(220px,100%)}.chat-poll h3,.chat-todo h3{font-size:13px;font-weight:600;white-space:pre-wrap}.chat-poll small,.chat-todo small{font-size:10px;color:#64748b}.chat-poll-option{display:flex;gap:12px;justify-content:space-between;text-align:left;padding:9px;border:1px solid #b5c4d2;border-radius:8px;position:relative;overflow:hidden;font-size:12px}.chat-poll-option>span:not(.chat-poll-bar),.chat-poll-option>strong{position:relative;z-index:1}.chat-poll-option strong{font-size:10px;white-space:nowrap;align-self:center}.chat-poll-bar{position:absolute;inset:0 auto 0 0;background:#8db7df35;transition:width .2s}.chat-poll-option.is-chosen{border-color:#4487b8}.chat-poll-footer{display:flex;justify-content:space-between;align-items:center}.chat-todo-done{text-decoration:line-through;opacity:.7}
</style>
