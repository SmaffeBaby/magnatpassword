<script setup lang="ts">
import type { SubscriptionPayment } from '~~/shared/types/subscriptions'
import { dateLabel } from '~~/shared/utils/subscriptions'
defineProps<{ payment: SubscriptionPayment | null; busy: boolean; error: string }>()
const open = defineModel<boolean>('open', { required: true })
const paidOn = defineModel<string>('paidOn', { required: true })
const emit = defineEmits<{ confirm: [] }>()
const formId = useId()
</script>
<template>
 <UModal v-model:open="open" title="Отметить оплату подписки" description="Проверьте дату списания и срок, до которого оплачена подписка." :dismissible="!busy" :ui="{footer:'justify-end'}">
  <template #body><form v-if="payment" :id="formId" class="space-y-4" @submit.prevent="emit('confirm')">
   <p class="font-medium">{{ payment.service }} · {{ payment.label }}</p>
   <div class="subscription-form-grid">
    <UFormField label="Сумма оплаты" required><UInput v-model.number="payment.amount" type="number" :min="0" :max="1000000000" step="0.01" required class="w-full"/></UFormField>
    <UFormField label="Валюта"><USelect v-model="payment.currency" :items="['RUB','USD','EUR','CNY']" class="w-full"/></UFormField>
    <UFormField label="Дата оплаты" required><UInput v-model="paidOn" type="date" required class="w-full"/></UFormField>
    <UFormField label="Оплачено до" required><UInput v-model="payment.periodUntil" type="date" :min="payment.periodFrom" required class="w-full"/></UFormField>
   </div>
   <p class="text-sm text-slate-500">Оплачиваемый период: {{ dateLabel(payment.periodFrom) }} — {{ dateLabel(payment.periodUntil) }}. Для прошлой оплаты без продления используйте «Добавить оплату» в истории списаний.</p>
   <UAlert v-if="error" color="error" :description="error"/>
  </form></template>
  <template #footer><UButton color="neutral" variant="outline" label="Отмена" :disabled="busy" @click="open=false"/><UButton type="submit" :form="formId" label="Подтвердить оплату" :loading="busy"/></template>
 </UModal>
</template>
