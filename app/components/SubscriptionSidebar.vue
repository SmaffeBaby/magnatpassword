<script setup lang="ts">
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
const props=defineProps<{entries:ScopedCredential[]}>()
const emit=defineEmits<{edit:[entry:ScopedCredential];calendar:[]}>()
const {upcoming,status,dateLabel}=useSubscriptionSidebar(props)
</script>
<template>
 <section v-if="upcoming.length" class="subscription-sidebar">
  <button class="subscription-sidebar-heading" @click="emit('calendar')">БЛИЖАЙШИЕ ПОДПИСКИ<UIcon name="i-lucide-calendar-days" /></button>
  <button v-for="row in upcoming" :key="row.key" class="subscription-upcoming" :class="{'is-due':row.daysLeft<=7,'is-overdue':row.daysLeft<0}" @click="emit('edit',row.entry)">
   <strong>{{ row.entry.title }}</strong><small>{{ row.field.label }} · {{ row.entry.vaultName }}</small>
   <progress :value="row.progress" max="100" :aria-label="status(row.daysLeft)" />
   <span>{{ dateLabel(row.subscription.paidUntil) }} · {{ status(row.daysLeft) }}</span>
  </button>
 </section>
</template>
