<script setup lang="ts">
import ProjectCompanyCreateModal from './ProjectCompanyCreateModal.vue'

defineOptions({ inheritAttrs: false })
defineProps<{
  modelValue: string
  items: { value: string; label: string; inn?: string; description?: string; disabled?: boolean }[]
  disabled?: boolean
  createDescription?: string
  connectCreated: (catalogId: string) => Promise<boolean>
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const menuOpen = ref(false), createOpen = ref(false), initialSearch = ref(''), searchTerm = ref('')
function create(search: string) { initialSearch.value = search; menuOpen.value = false; createOpen.value = true }
</script>

<template>
  <USelectMenu v-bind="$attrs" v-model:open="menuOpen" v-model:search-term="searchTerm" :model-value="modelValue" :items="items" value-key="value" :filter-fields="['label', 'inn']" :search-input="{ placeholder: 'Название или ИНН' }" :disabled="disabled" :create-item="disabled ? false : { when: 'always', position: 'bottom' }" @update:model-value="value => { if (typeof value === 'string') emit('update:modelValue', value) }" @create="create">
    <template #empty>Компании не найдены</template>
    <template #create-item-label="{ item }"><span class="company-picker-create"><UIcon name="i-lucide-plus"/>Добавить «{{ item }}»</span></template>
    <template #content-bottom><div v-if="!searchTerm.trim()" class="company-picker-footer"><UButton label="Добавить компанию" icon="i-lucide-plus" color="neutral" variant="ghost" size="sm" class="w-full" :disabled="disabled" @click="create('')"/></div></template>
  </USelectMenu>
  <ProjectCompanyCreateModal v-model:open="createOpen" :initial-search="initialSearch" :connect="connectCreated" :description="createDescription"/>
</template>

<style scoped>
.company-picker-create{display:flex;align-items:center;gap:8px;color:var(--ui-primary)}.company-picker-create>.iconify{width:16px;height:16px;flex:0 0 16px}.company-picker-footer{padding:6px;border-top:1px solid #e2e8f0}
</style>
