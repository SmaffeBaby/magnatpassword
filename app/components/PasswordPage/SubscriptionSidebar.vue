<script setup lang="ts">
import { subscriptionDeadline, subscriptionEndLabel } from '~~/shared/utils/subscriptions'
import { useSubscriptionSidebar } from '~/composables/finances/useSubscriptions'

import type { ScopedCredential } from '~~/shared/utils/vault-sources'
const props=defineProps<{entries:ScopedCredential[]}>()
const emit=defineEmits<{edit:[entry:ScopedCredential];calendar:[]}>()
const {upcoming,today,status,dateLabel}=useSubscriptionSidebar(props)
</script>
<template>
 <section v-if="upcoming.length" class="subscription-sidebar">
  <button class="subscription-sidebar-heading" @click="emit('calendar')">БЛИЖАЙШИЕ ПОДПИСКИ<UIcon name="i-lucide-calendar-days" /></button>
  <button v-for="row in upcoming" :key="row.key" class="subscription-upcoming" :class="{'is-due':row.daysLeft<=7,'is-overdue':row.daysLeft<0}" @click="emit('edit',row.entry)">
   <strong>{{ row.entry.title }}</strong><small>{{ row.field.label }} · {{ row.entry.vaultName }}</small>
   <progress :value="row.progress" max="100" :aria-label="status(row.daysLeft)" />
   <span>{{ subscriptionDeadline(row.subscription) === row.subscription.endsOn ? subscriptionEndLabel(row.subscription,today) : dateLabel(row.subscription.paidUntil) + ' · ' + status(row.daysLeft) }}</span>
  </button>
 </section>
</template>
