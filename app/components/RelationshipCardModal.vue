<script setup lang="ts">
const props=defineProps<{controller:ReturnType<typeof useRelationshipCards>;busy:boolean}>()
const relations=reactive(props.controller)
</script>
<template>
  <UModal v-model:open="relations.open" :title="!relations.editable?'Карточка взаимосвязей':relations.recordId?'Изменить карточку взаимосвязей':'Новая карточка взаимосвязей'" description="Объедините доступы Password, подписки и другие сервисы." :dismissible="!busy" :ui="{content:'sm:max-w-2xl',body:'min-w-0 overflow-y-auto',footer:'justify-end flex-wrap'}">
    <template #body><form v-if="relations.draft" id="relationship-card-form" class="space-y-5" @submit.prevent="relations.save"><fieldset :disabled="!relations.editable||busy" class="space-y-5">
      <UFormField label="Название карточки" required><UInput v-model="relations.draft!.title" class="w-full" required :maxlength="120" placeholder="Например, Сайт компании"/></UFormField>
      <UFormField label="Сайт"><UInput v-model="relations.draft!.url" class="w-full" type="url" :maxlength="2000" placeholder="https://example.com"/></UFormField>
      <UFormField label="Хранилища" required><USelectMenu :model-value="relations.targets" :items="relations.vaultOptions" value-key="value" multiple :disabled="!relations.canShare" class="w-full" aria-label="Хранилища карточки взаимосвязей" @update:model-value="relations.setTargets"/></UFormField>
      <UFormField label="Категории доступа" :required="relations.categoryRequired"><USelectMenu v-model="relations.categories" :items="relations.categoryOptions" value-key="value" multiple :disabled="!relations.canCategorize" class="w-full" aria-label="Категории доступа карточки взаимосвязей"/></UFormField>
      <UFormField label="Пароли из Password"><USelectMenu v-model="relations.passwords" :items="relations.passwordOptions" value-key="value" multiple class="w-full" aria-label="Связанные пароли" placeholder="Выберите доступы"/></UFormField>
      <UFormField label="Подписки из Финансов"><USelectMenu v-model="relations.finances" :items="relations.financeOptions" value-key="value" multiple class="w-full" aria-label="Связанные подписки" placeholder="Выберите подписки"/></UFormField>
      <UFormField label="Другие карточки"><USelectMenu v-model="relations.other" :items="relations.otherOptions" value-key="value" multiple class="w-full" aria-label="Другие карточки взаимосвязей" placeholder="Например, сервер или домен"/></UFormField>
      <UFormField label="Описание"><UTextarea v-model="relations.draft!.notes" class="w-full" :maxlength="10000"/></UFormField>
      <p class="text-xs text-slate-500">Привязка не выдаёт доступ к паролям или подпискам. Каждый участник видит только доступные ему записи.</p>
    </fieldset><UAlert v-if="relations.error" color="error" :description="relations.error"/></form></template>
    <template #footer><UButton v-if="relations.recordId&&relations.editable" color="error" variant="ghost" label="Удалить карточку" :disabled="busy" @click="relations.deleteOpen=true"/><UButton color="neutral" variant="outline" :label="relations.editable?'Отмена':'Закрыть'" :disabled="busy" @click="relations.open=false"/><UButton v-if="relations.editable" type="submit" form="relationship-card-form" label="Сохранить карточку" :loading="busy"/></template>
  </UModal>
  <UModal v-model:open="relations.deleteOpen" title="Удалить карточку взаимосвязей?" description="Пароли и подписки останутся в своих разделах."><template #footer><UButton color="neutral" variant="outline" label="Отмена" @click="relations.deleteOpen=false"/><UButton color="error" label="Удалить карточку" :loading="busy" @click="relations.remove"/></template></UModal>
</template>
