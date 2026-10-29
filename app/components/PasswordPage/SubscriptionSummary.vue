<script setup lang="ts">
import { useSubscriptionSummary } from '../../composables/useSubscriptions'

import type { ScopedCredential } from '~~/shared/utils/vault-sources'
const props=defineProps<{entry:ScopedCredential;entries?:ScopedCredential[];busy:boolean;readonly?:boolean}>()
const emit=defineEmits<{renew:[entry:ScopedCredential,fieldId:string];history:[entry:ScopedCredential,fieldId:string];open:[entry:ScopedCredential]}>()
const {rows,status,dateLabel,moneyLabel,periodLabel}=useSubscriptionSummary(props)
</script>
<template>
 <section v-for="row in rows" :key="row.key" class="subscription-summary" :class="{'is-due':row.daysLeft<=7,'is-overdue':row.daysLeft<0}">
  <div class="subscription-summary-heading"><strong>{{ row.field.label }}</strong><span>{{ moneyLabel(row.subscription) }} / {{ periodLabel(row.subscription) }}</span></div>

  <p>Основная карточка: <button v-if="row.primaryEntry" type="button" class="subscription-card-link" @click="emit('open',row.primaryEntry)">{{ row.primaryTitle }}</button><span v-else>{{ row.primaryTitle }}</span></p>
  <p v-if="row.linkedCards.length">Другие карточки: <template v-for="(card,index) in row.linkedCards" :key="card.key"><span v-if="index">, </span><button v-if="card.entry" type="button" class="subscription-card-link" @click="emit('open',card.entry)">{{ card.title }}</button><span v-else>{{ card.title }}</span></template></p>
  <p>Оплачено до {{ dateLabel(row.subscription.paidUntil) }}</p>
  <p v-if="row.subscription.autoRenew">Следующее списание: {{ dateLabel(row.subscription.paidUntil) }}</p>
  <progress :value="row.progress" max="100" :aria-label="`Срок подписки: ${status(row.daysLeft)}`" />
  <small>{{ status(row.daysLeft) }}</small>
  <div class="subscription-summary-actions"><NuxtLink v-if="row.entry.kind==='subscription'" :to="{path:'/finances/subscriptions',query:{subscription:row.entry.sharedCardId||row.entry.id}}" class="subscription-card-link">Открыть подписку в «Финансах» →</NuxtLink><template v-else>
  <UButton type="button" size="xs" color="neutral" variant="outline" icon="i-lucide-history" label="История списаний" @click="emit('history',row.entry,row.field.id)"/>
  <UButton type="button" size="xs" variant="soft" :disabled="busy||readonly" label="Отметить оплату следующего периода" @click="emit('renew',row.entry,row.field.id)" />
  </template></div>
 </section>
</template>
