<script setup lang="ts">
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
const props=defineProps<{entries:ScopedCredential[];busy:boolean}>()
const emit=defineEmits<{edit:[entry:ScopedCredential];renew:[entry:ScopedCredential,fieldId:string]}>()
const {rows,today,selected,monthTitle,cells,selectedRows,move,goToday,status,dateLabel,moneyLabel}=useSubscriptionCalendar(props)
</script>
<template>
 <section class="subscription-calendar">
  <div class="subscription-calendar-heading"><div><h2>{{ monthTitle }}</h2><p>Сроки оплаты и плановые списания. Всего подписок: {{ rows.length }}</p></div><div class="flex gap-2"><UButton variant="outline" color="neutral" icon="i-lucide-chevron-left" aria-label="Предыдущий месяц" @click="move(-1)" /><UButton variant="outline" color="neutral" label="Сегодня" @click="goToday" /><UButton variant="outline" color="neutral" icon="i-lucide-chevron-right" aria-label="Следующий месяц" @click="move(1)" /></div></div>
  <p v-if="!rows.length" class="subscription-empty">Добавьте дополнительное поле типа «Подписка» в карточке сервиса — здесь появится дата окончания.</p>
  <div class="subscription-calendar-scroll"><div class="subscription-calendar-grid">
   <div v-for="day in ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']" :key="day" class="calendar-weekday">{{ day }}</div>
   <button v-for="cell in cells" :key="cell.date" class="calendar-day" :class="{outside:cell.outside,selected:cell.date===selected,today:cell.date===today}" :aria-label="`${dateLabel(cell.date)}, подписок: ${cell.events.length}`" :aria-pressed="cell.date===selected" @click="selected=cell.date"><span>{{ cell.day }}</span><small v-for="row in cell.events.slice(0,3)" :key="row.key" :class="{'is-overdue':row.daysLeft<0}">{{ row.entry.title }}</small><small v-if="cell.events.length>3">Ещё {{ cell.events.length-3 }}</small></button>
  </div></div>
  <div class="subscription-day-details"><h3>{{ dateLabel(selected) }}</h3><p v-if="!selectedRows.length">На этот день нет окончаний подписок.</p><article v-for="row in selectedRows" :key="row.key"><div><button class="subscription-service" @click="emit('edit',row.entry)">{{ row.entry.title }} · {{ row.field.label }}</button><p>{{ row.entry.vaultName }} · {{ moneyLabel(row.subscription) }}</p><p>{{ row.subscription.autoRenew?'Плановое списание':'Оплачено до' }}: {{ dateLabel(row.subscription.paidUntil) }} · {{ status(row.daysLeft) }}</p></div><div class="flex gap-2"><UButton size="sm" color="neutral" variant="outline" label="Изменить" @click="emit('edit',row.entry)" /><UButton size="sm" variant="soft" :disabled="busy" label="Отметить оплату" @click="emit('renew',row.entry,row.field.id)" /></div></article></div>
  <p class="subscription-note">Календарь не выполняет платежи. После оплаты отметьте следующий период или измените дату в карточке. Даты и уведомления указаны по московскому времени.</p>
 </section>
</template>
