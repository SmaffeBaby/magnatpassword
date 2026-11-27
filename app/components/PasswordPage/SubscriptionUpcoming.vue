<script setup lang="ts">
import SubscriptionFilters from './SubscriptionFilters.vue'
import { useSubscriptionFilters } from '~/composables/finances/useSubscriptionFilters'
import { canRenewSubscription, subscriptionEnded, subscriptionEndLabel } from '~~/shared/utils/subscriptions'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'

const props = defineProps<{ entries: ScopedCredential[]; busy: boolean }>()
const emit = defineEmits<{ edit: [entry: ScopedCredential]; renew: [entry: ScopedCredential, fieldId: string] }>()
const { group, currency, search, statusFilter, groups, currencyOptions, statusOptions, matchingRows, today, status, dateLabel, moneyLabel, periodLabel } = useSubscriptionFilters(props)
</script>

<template>
  <section class="upcoming-page">
    <SubscriptionFilters v-model:group="group" v-model:currency="currency" v-model:search="search" v-model:status="statusFilter" :groups="groups" :currency-options="currencyOptions" :status-options="statusOptions" />
    <p class="subscription-note">Найдено подписок: {{ matchingRows.length }}.</p>
    <div class="upcoming-grid">
      <article v-for="row in matchingRows" :key="row.key" class="upcoming-tile" :class="{ 'is-due': !subscriptionEnded(row.subscription, today) && row.daysLeft <= 7, 'is-overdue': !subscriptionEnded(row.subscription, today) && row.daysLeft < 0 }">
        <button class="subscription-service" @click="emit('edit', row.entry)">{{ row.entry.title }}</button>
        <p>{{ row.field.label }} · {{ (row.entry.vaultNames ?? [row.entry.vaultName]).join(' · ') }}</p>
        <strong>{{ moneyLabel(row.subscription) }} / {{ periodLabel(row.subscription) }}</strong>
        <progress v-if="!subscriptionEnded(row.subscription, today)" :value="row.progress" max="100" :aria-label="status(row.daysLeft)" />
        <p>Оплачено до {{ dateLabel(row.subscription.paidUntil) }}<template v-if="canRenewSubscription(row.subscription, today)"> · {{ status(row.daysLeft) }}</template></p>
        <p v-if="row.subscription.endsOn">{{ subscriptionEndLabel(row.subscription, today) }}</p>
        <div class="flex flex-wrap gap-2 mt-4">
          <UButton size="sm" variant="outline" color="neutral" label="Изменить" @click="emit('edit', row.entry)" />
          <UButton v-if="canRenewSubscription(row.subscription, today)" size="sm" variant="soft" :disabled="busy" label="Отметить оплату" @click="emit('renew', row.entry, row.field.id)" />
        </div>
      </article>
    </div>
    <p v-if="!matchingRows.length" class="subscription-empty">Подписок с такими фильтрами нет.</p>
  </section>
</template>
