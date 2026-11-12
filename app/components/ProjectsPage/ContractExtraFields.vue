<script setup lang="ts">
import type { ContractField } from '~~/shared/types/contract-fields'
import { safeUrl } from '~~/shared/utils/crypto'
const fields=defineModel<ContractField[]>({required:true})
defineProps<{disabled?:boolean;readonly?:boolean}>()
const types=[{label:'Текст',value:'text'},{label:'Многострочный текст',value:'multiline'},{label:'Дата',value:'date'},{label:'Сумма в рублях',value:'money'},{label:'Ссылка',value:'url'},{label:'Число',value:'number'},{label:'Флажок',value:'checkbox'}]
function add(){if(fields.value.length<50)fields.value.push({id:crypto.randomUUID(),label:'Новое поле',type:'text',value:''})}
function change(field:ContractField,value:string){field.type=value as ContractField['type'];field.value=value==='checkbox'?'false':''}
function display(field:ContractField){if(!field.value)return '—';if(field.type==='money')return new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'}).format(Number(field.value));if(field.type==='date')return field.value.split('-').reverse().join('.');return field.type==='checkbox'?(field.value==='true'?'Да':'Нет'):field.value}
</script>
<template>
 <section class="contract-extra" aria-label="Дополнительные поля договора"><header><h3>Дополнительные поля</h3><UButton v-if="!readonly" label="Добавить поле" icon="i-lucide-plus" size="sm" color="neutral" variant="outline" :disabled="disabled||fields.length>=50" @click="add"/></header>
  <p v-if="!fields.length" class="text-xs text-muted">{{readonly?'Дополнительных полей нет.':'Добавьте текст, дату, сумму в рублях, ссылку, число или флажок.'}}</p>
  <article v-for="field in fields" :key="field.id" class="space-y-3 rounded-xl border border-default p-3">
   <template v-if="readonly"><h4 class="text-sm font-semibold">{{field.label}}</h4><a v-if="field.type==='url'&&safeUrl(field.value)" :href="safeUrl(field.value)" target="_blank" rel="noopener noreferrer" class="break-all text-sm text-primary underline">{{field.value}}</a><p v-else class="whitespace-pre-wrap break-words text-sm">{{display(field)}}</p></template>
   <template v-else><div class="flex flex-wrap gap-2"><UInput v-model="field.label" aria-label="Название дополнительного поля" :maxlength="120" class="min-w-32 flex-1" :disabled="disabled"/><USelect :model-value="field.type" :items="types" aria-label="Тип дополнительного поля" :disabled="disabled" @update:model-value="change(field,String($event))"/><UButton icon="i-lucide-x" aria-label="Убрать дополнительное поле" color="neutral" variant="ghost" :disabled="disabled" @click="fields=fields.filter(f=>f.id!==field.id)"/></div>
   <UTextarea v-if="field.type==='multiline'" v-model="field.value" :aria-label="field.label" :maxlength="10000" class="w-full" :disabled="disabled"/>
   <UCheckbox v-else-if="field.type==='checkbox'" :model-value="field.value==='true'" :label="field.label" :disabled="disabled" @update:model-value="field.value=$event?'true':'false'"/>
   <UInput v-else :model-value="field.value" @update:model-value="field.value=String($event ?? '')" :aria-label="field.label" :type="field.type==='date'?'date':field.type==='money'||field.type==='number'?'number':field.type==='url'?'url':'text'" :step="field.type==='money'?'0.01':undefined" :min="field.type==='money'?0:undefined" :placeholder="field.type==='money'?'Сумма в рублях':undefined" class="w-full" :disabled="disabled" :maxlength="10000"/></template>
  </article>
 </section>
</template>
<style scoped>
.contract-extra{display:grid;gap:14px;min-width:0;border-top:1px solid #e2e8f0;padding-top:20px}.contract-extra>header{display:flex;align-items:center;justify-content:space-between;gap:12px}.contract-extra h3{font-weight:600;font-size:14px;color:#475569}
</style>
