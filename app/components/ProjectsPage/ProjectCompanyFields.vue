<script setup lang="ts">
import { companyFields, type CompanyInput } from '~~/shared/utils/project-companies'
const draft = defineModel<CompanyInput>({ required: true })
defineProps<{ disabled?: boolean }>()
</script>

<template>
  <div class="company-fields">
    <label v-for="field in companyFields" :key="field.key">{{ field.label }}<input v-model="draft[field.key]" :maxlength="field.max" :required="field.key === 'company'" :disabled="disabled" :inputmode="['inn', 'kpp', 'ogrn'].includes(field.key) ? 'numeric' : 'text'"/></label>
    <label class="company-own-check"><input v-model="draft.isOwnLegalEntity" type="checkbox" :disabled="disabled"/>Наше юридическое лицо</label>
  </div>
</template>

<style scoped>
.company-fields{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:20px;min-width:0}.company-fields label{display:flex;flex-direction:column;gap:8px;font-size:13px;color:#475569}.company-fields label:first-child,.company-fields label:nth-child(5),.company-fields .company-own-check{grid-column:1/-1}.company-fields input:not([type=checkbox]){padding:10px 12px;border-radius:8px;border:1px solid #cbd5e1;background:white;min-width:0;width:100%;outline-color:var(--ui-primary)}.company-fields .company-own-check{flex-direction:row;align-items:center;gap:10px}.company-own-check input{accent-color:var(--ui-primary)}@media(max-width:600px){.company-fields{grid-template-columns:1fr}}
</style>
