<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { companyInputSchema, newCompanyDraft } from '~~/shared/utils/project-companies'
import ProjectCompanyFields from './ProjectCompanyFields.vue'

const props = defineProps<{ initialSearch: string; connect: (catalogId: string) => Promise<boolean> }>()
const open = defineModel<boolean>('open', { default: false })
const auth = useAuthStore(), client = useQueryClient(), formId = useId()
const draft = ref(newCompanyDraft()), busy = ref(false), error = ref(''), createdId = ref('')
watch(open, value => { if (value) { draft.value = newCompanyDraft(props.initialSearch); error.value = ''; createdId.value = '' } })
watch(() => auth.user?.id, () => { open.value = false })
async function save() {
  if (busy.value) return
  const parsed = companyInputSchema.safeParse(draft.value)
  if (!parsed.success) { error.value = parsed.error.issues[0]?.message || 'Проверьте реквизиты'; return }
  const userId = auth.user?.id
  busy.value = true; error.value = ''
  try {
    if (!createdId.value) {
      const result = await sharedRequest<{ id: string }>('/api/projects/companies', { method: 'POST', body: parsed.data })
      if (auth.user?.id !== userId) return
      createdId.value = result.id
      await client.invalidateQueries({ queryKey: ['account', userId, 'project-companies'] })
    }
    if (auth.user?.id !== userId) return
    const connected = await props.connect(createdId.value)
    if (auth.user?.id !== userId) return
    if (!connected) { error.value = 'Компания сохранена в общей базе, но не выбрана в проекте. Повторите выбор. Если данные проекта изменились, закройте и откройте основную форму заново.'; return }
    open.value = false
  } catch (failure: any) { if (auth.user?.id === userId) error.value = failure?.data?.message || failure.message || 'Не удалось сохранить компанию' }
  finally { busy.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :title="draft.isOwnLegalEntity ? 'Добавить юр. лицо' : 'Добавить контрагента'" description="Компания появится в общей базе, подключится к проекту и будет выбрана в текущем поле." :dismissible="!busy" :close="!busy" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body><form :id="formId" class="company-create-form" @submit.prevent="save"><ProjectCompanyFields v-model="draft" :disabled="busy || !!createdId"/><UAlert v-if="error" color="error" :description="error"/></form></template>
    <template #footer><div class="company-create-actions"><UButton label="Отмена" color="neutral" variant="outline" :disabled="busy" @click="open = false"/><UButton :label="createdId ? 'Выбрать компанию' : 'Сохранить и выбрать'" type="submit" :form="formId" :loading="busy"/></div></template>
  </UModal>
</template>

<style scoped>
.company-create-form{display:grid;gap:20px}.company-create-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:12px;width:100%}
</style>
