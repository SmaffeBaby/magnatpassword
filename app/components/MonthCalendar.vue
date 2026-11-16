<script setup lang="ts" generic="Cell extends { date: string; day: number; outside: boolean; events: unknown[] }">
import { dateLabel } from '~~/shared/utils/subscriptions'

withDefaults(defineProps<{ title: string; description: string; today: string; cells: Cell[]; monthOptions: {label:string;value:string}[]; eventLabel?: string }>(),{eventLabel:'событий'})
const month=defineModel<string>('month',{required:true})
const year=defineModel<number>('year',{required:true})
const selected=defineModel<string>('selected',{required:true})
defineEmits<{move:[delta:number];today:[]}>()
</script>

<template>
  <div class="month-calendar">
    <div class="subscription-calendar-heading"><div><h2>{{title}}</h2><p>{{description}}</p></div><div class="calendar-controls"><USelect v-model="month" :items="monthOptions" aria-label="Месяц календаря"/><UInput v-model.number="year" type="number" :min="1900" :max="9998" aria-label="Год календаря" class="calendar-year"/><UButton variant="outline" color="neutral" icon="i-lucide-chevron-left" aria-label="Предыдущий месяц" @click="$emit('move',-1)"/><UButton variant="outline" color="neutral" label="Сегодня" @click="$emit('today')"/><UButton variant="outline" color="neutral" icon="i-lucide-chevron-right" aria-label="Следующий месяц" @click="$emit('move',1)"/></div></div>
    <slot name="summary"/>
    <div class="subscription-calendar-scroll"><div class="subscription-calendar-grid">
      <div v-for="day in ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']" :key="day" class="calendar-weekday">{{day}}</div>
      <button v-for="cell in cells" :key="cell.date" type="button" class="calendar-day" :class="{outside:cell.outside,selected:cell.date===selected,today:cell.date===today}" :aria-label="`${dateLabel(cell.date)}, ${eventLabel}: ${cell.events.length}`" :aria-pressed="cell.date===selected" @click="selected=cell.date"><span>{{cell.day}}</span><slot name="cell" :cell="cell"/></button>
    </div></div>
    <slot name="details"/>
  </div>
</template>
