<script setup lang="ts">
import { usePaymentHistory } from '../composables/usePaymentHistory'

import { todayDate } from '~~/shared/utils/subscriptions'
import type { VaultSource } from '~~/shared/types/sharing'
const props = defineProps<{ sources: VaultSource[]; subscriptionKey?: string }>()
const { group, currency, search, groups, currencyOptions, subscription, from, to, options, addOptions, validRange, payments, totals, busy, error, editorOpen, deleteOpen, deleting, draft, draftSubscription, paidOn, editing, add, edit, canManage, save, askDelete, remove, dateLabel, amountLabel } = usePaymentHistory(props)
const paymentFormId = useId()
const currencies = ['RUB', 'USD', 'EUR', 'CNY']
</script>
<template>
 <section class="subscription-finances">
  <h3 v-if="subscriptionKey" class="text-base font-semibold mb-4">{{ options.find(option=>option.value===subscriptionKey)?.label || 'История подписки' }}</h3>
  <div class="flex flex-wrap gap-3 mb-4">
   <USelectMenu v-if="!subscriptionKey" v-model="subscription" :items="[{label:'Все подписки',value:'all'},...options]" value-key="value" class="min-w-60 flex-1" aria-label="Подписка для истории списаний"/>
   <UButton icon="i-lucide-plus" label="Добавить оплату" :disabled="busy||!addOptions.length" @click="add"/>
  </div>
  <div class="flex flex-wrap gap-3 mb-4"><USelect v-model="group" :items="groups" aria-label="Хранилище истории"/><USelect v-model="currency" :items="currencyOptions" aria-label="Валюта истории"/><UInput v-model="search" icon="i-lucide-search" placeholder="Поиск по истории" aria-label="Поиск по истории" class="flex-1"/></div>
  <div class="finance-date-filters"><UFormField label="Оплаты с"><UInput v-model="from" type="date" aria-label="История с даты"/></UFormField><UFormField label="По"><UInput v-model="to" type="date" aria-label="История до даты"/></UFormField><UButton color="neutral" variant="ghost" label="За всё время" @click="from='';to=''"/></div>
  <UAlert v-if="!validRange" color="warning" title="Укажите корректный диапазон дат." class="mb-4"/>
  <div class="calendar-total"><span>Оплачено · {{ payments.length }} записей</span><strong v-for="total in totals" :key="total.currency">{{ amountLabel(total.amount,total.currency) }}</strong></div>
  <div class="finance-table-scroll"><table class="finance-table"><thead><tr><th>Дата оплаты</th><th>Карточка / подписка</th><th>Сумма</th><th>Оплаченный период</th><th>Действия</th></tr></thead><tbody><tr v-for="payment in payments" :key="`${payment.sharedCardId||payment.vaultId}/${payment.id}`"><td>{{ dateLabel(todayDate(new Date(payment.paidAt))) }}</td><td>{{ payment.service }}<small>{{ payment.label }} · {{ payment.vaultNames.join(' · ') }}</small></td><td>{{ amountLabel(payment.amount,payment.currency) }}</td><td>{{ dateLabel(payment.periodFrom) }} — {{ dateLabel(payment.periodUntil) }}</td><td><div class="flex gap-1"><UButton color="neutral" variant="ghost" icon="i-lucide-pencil" aria-label="Изменить оплату" :disabled="busy||!canManage(payment)" @click="edit(payment)"/><UButton color="error" variant="ghost" icon="i-lucide-trash-2" aria-label="Удалить оплату" :disabled="busy||!canManage(payment)" @click="askDelete(payment)"/></div></td></tr></tbody></table></div>
  <p v-if="!payments.length" class="subscription-empty">Оплат с выбранными фильтрами нет. Добавьте прошлые списания для отчёта.</p>
  <p class="subscription-note">История включает внесённые вручную оплаты и записи кнопки «Отметить оплату». Изменение истории не меняет текущий срок подписки. Общая подписка учитывается один раз.</p>
  <UModal v-model:open="editorOpen" :title="editing?'Изменить оплату':'Добавить прошлую оплату'" description="Укажите фактическую сумму, дату оплаты и оплаченный период." :dismissible="!busy" :ui="{content:'sm:max-w-2xl',footer:'justify-end'}">
   <template #body><form v-if="draft" :id="paymentFormId" class="space-y-4" @submit.prevent="save">
    <UFormField label="Подписка" required><USelectMenu v-model="draftSubscription" :items="editing?options:addOptions" value-key="value" :disabled="editing||busy" class="w-full" aria-label="Подписка оплаты"/></UFormField>
    <div class="subscription-form-grid"><UFormField label="Сумма оплаты" required><UInput v-model.number="draft.amount" type="number" :min="0" :max="1000000000" step="0.01" class="w-full" required/></UFormField><UFormField label="Валюта"><USelect v-model="draft.currency" :items="currencies" class="w-full"/></UFormField><UFormField label="Дата оплаты" required><UInput v-model="paidOn" type="date" class="w-full" required/></UFormField><div/><UFormField label="Период с" required><UInput v-model="draft.periodFrom" type="date" class="w-full" required/></UFormField><UFormField label="Период до" required><UInput v-model="draft.periodUntil" type="date" :min="draft.periodFrom" class="w-full" required/></UFormField></div>
    <UAlert v-if="error" color="error" :description="error"/>
   </form></template>
   <template #footer><UButton color="neutral" variant="outline" label="Отмена" :disabled="busy" @click="editorOpen=false"/><UButton type="submit" :form="paymentFormId" label="Сохранить оплату" :loading="busy"/></template>
  </UModal>
  <UModal v-model:open="deleteOpen" title="Удалить запись об оплате?" description="Запись будет удалена из истории, календаря и финансов. Текущий срок подписки сохранится." :dismissible="!busy" :ui="{footer:'justify-end'}"><template #body><p v-if="deleting">{{ deleting.service }} · {{ deleting.label }} · {{ amountLabel(deleting.amount,deleting.currency) }}</p><UAlert v-if="error" class="mt-4" color="error" :description="error"/></template><template #footer><UButton color="neutral" variant="outline" label="Отмена" :disabled="busy" @click="deleteOpen=false"/><UButton color="error" label="Удалить запись" :loading="busy" @click="remove"/></template></UModal>
 </section>
</template>
