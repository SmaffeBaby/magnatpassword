<script setup lang="ts" generic="Cell extends { date: string; day: number; outside: boolean; events: unknown[] }">
import DatePicker from './DatePicker.vue'
import { dateLabel, validDate } from '~~/shared/utils/subscriptions'

withDefaults(defineProps<{ title: string; description: string; today: string; cells: Cell[]; eventLabel?: string }>(),{eventLabel:'событий'})
const month=defineModel<string>('month',{required:true})
const selected=defineModel<string>('selected',{required:true})
defineEmits<{move:[delta:number];today:[]}>()
function jumpTo(date: string) {
  if (!validDate(date)) return
  month.value = date.slice(0, 7) + '-01'
  selected.value = date
}
</script>

<template>
  <div class="month-calendar">
    <div class="subscription-calendar-heading"><div><h2>{{title}}</h2><p>{{description}}</p></div><div class="calendar-controls"><DatePicker :model-value="selected" min="1900-01-01" max="9998-12-31" :clearable="false" aria-label="Перейти к дате" class="w-36" @update:model-value="jumpTo"/><UButton variant="outline" color="neutral" icon="i-lucide-chevron-left" aria-label="Предыдущий месяц" @click="$emit('move',-1)"/><UButton variant="outline" color="neutral" label="Сегодня" @click="$emit('today')"/><UButton variant="outline" color="neutral" icon="i-lucide-chevron-right" aria-label="Следующий месяц" @click="$emit('move',1)"/></div></div>
    <slot name="summary"/>
    <div class="subscription-calendar-scroll"><div class="subscription-calendar-grid">
      <div v-for="day in ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']" :key="day" class="calendar-weekday">{{day}}</div>
      <button v-for="cell in cells" :key="cell.date" type="button" class="calendar-day" :class="{outside:cell.outside,selected:cell.date===selected,today:cell.date===today}" :aria-label="`${dateLabel(cell.date)}, ${eventLabel}: ${cell.events.length}`" :aria-pressed="cell.date===selected" @click="selected=cell.date"><span>{{cell.day}}</span><slot name="cell" :cell="cell"/></button>
    </div></div>
    <slot name="details"/>
  </div>
</template>
