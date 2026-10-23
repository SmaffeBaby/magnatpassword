<script setup lang="ts">
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
const props=defineProps<{entry:ScopedCredential;entries?:ScopedCredential[];busy:boolean}>()
const emit=defineEmits<{renew:[entry:ScopedCredential,fieldId:string]}>()
const {rows,status,dateLabel,moneyLabel,periodLabel}=useSubscriptionSummary(props)
</script>
<template>
 <section v-for="row in rows" :key="row.key" class="subscription-summary" :class="{'is-due':row.daysLeft<=7,'is-overdue':row.daysLeft<0}">
  <div><strong>{{ row.field.label }}</strong><span>{{ moneyLabel(row.subscription) }} / {{ periodLabel(row.subscription) }}</span></div>
  <p v-if="row.owner">Подписка из карточки «{{ row.owner }}»</p>
  <p>Основная карточка: {{ row.primaryTitle }}</p>
  <p v-if="row.linkedTitles.length">Другие карточки: {{ row.linkedTitles.join(', ') }}</p>
  <p>Оплачено до {{ dateLabel(row.subscription.paidUntil) }}</p>
  <p v-if="row.subscription.autoRenew">Следующее списание: {{ dateLabel(row.subscription.paidUntil) }}</p>
  <progress :value="row.progress" max="100" :aria-label="`Срок подписки: ${status(row.daysLeft)}`" />
  <small>{{ status(row.daysLeft) }}</small>
  <UButton size="xs" variant="soft" :disabled="busy" label="Отметить оплату следующего периода" @click="emit('renew',row.entry,row.field.id)" />
 </section>
</template>
