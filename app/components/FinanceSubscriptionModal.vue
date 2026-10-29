<script setup lang="ts">
import SubscriptionEditor from './PasswordPage/SubscriptionEditor.vue'
const props = defineProps<{ controller: ReturnType<typeof useFinanceSubscriptions>; busy: boolean }>()
const finance = reactive(props.controller)
</script>
<template>
  <UModal v-model:open="finance.open" :title="!finance.editable ? 'Подписка' : finance.recordId ? 'Изменить подписку' : 'Новая подписка'" description="Сроки, стоимость и оплаты подписки. Привязки к сервисам настраиваются во «Взаимосвязях»." :dismissible="!busy" :ui="{content:'sm:max-w-2xl',body:'min-w-0 overflow-y-auto',footer:'justify-end flex-wrap'}">
    <template #body><form v-if="finance.draft && finance.field" id="finance-subscription-form" class="space-y-5" @submit.prevent="finance.save">
      <fieldset :disabled="!finance.editable || busy" class="space-y-5">
      <UFormField label="Название / сервис" required><UInput v-model="finance.draft.title" required :maxlength="120" class="w-full" placeholder="Например, TimeWeb" /></UFormField>
      <UFormField label="Назначение подписки" required><UInput v-model="finance.field.label" required :maxlength="60" class="w-full" placeholder="Например, Оплата домена" /></UFormField>
      <UFormField label="Хранилища" required><USelectMenu :model-value="finance.targets" :items="finance.vaultOptions" value-key="value" multiple :disabled="!finance.canShare" class="w-full" aria-label="Хранилища подписки" @update:model-value="finance.setTargets" /></UFormField>
      <UFormField label="Категории доступа" :required="finance.categoryRequired"><USelectMenu v-model="finance.categories" :items="finance.categoryOptions" value-key="value" multiple :disabled="!finance.canCategorize" class="w-full" aria-label="Категории доступа подписки" placeholder="Все участники хранилища" /><p class="mt-2 text-xs text-slate-500">Категории определяют видимость подписки для участников с ограниченным доступом.</p></UFormField>
      <SubscriptionEditor :field="finance.field" :cards="finance.cards" />
      <UFormField label="Заметка"><UTextarea v-model="finance.draft.notes" class="w-full" :maxlength="10000" /></UFormField>
      </fieldset>
      <UAlert v-if="finance.error" color="error" :description="finance.error" />
    </form></template>
    <template #footer><UButton v-if="finance.recordId && finance.editable" color="error" variant="ghost" label="Удалить подписку" :disabled="busy" @click="finance.archiveOpen=true" /><UButton color="neutral" variant="outline" :label="finance.editable ? 'Отмена' : 'Закрыть'" :disabled="busy" @click="finance.open=false" /><UButton v-if="finance.editable" type="submit" form="finance-subscription-form" label="Сохранить подписку" :loading="busy" /></template>
  </UModal>
  <UModal v-model:open="finance.archiveOpen" title="Удалить подписку?" description="Подписка исчезнет из плана и календаря. История оплат и карточки «Паролей» сохранятся."><template #footer><UButton color="neutral" variant="outline" label="Отмена" @click="finance.archiveOpen=false" /><UButton color="error" label="Удалить подписку" :loading="busy" @click="finance.archive" /></template></UModal>
</template>
