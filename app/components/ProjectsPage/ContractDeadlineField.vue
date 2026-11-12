<script setup lang="ts">
const deadline=defineModel<string>({required:true}),noDeadline=defineModel<boolean>('noDeadline',{default:false}),autoRenew=defineModel<boolean>('autoRenew',{default:false})
defineProps<{disabled?:boolean}>()
function setNoDeadline(value:boolean){noDeadline.value=value;if(value){deadline.value='';autoRenew.value=false}}
function setAutoRenew(value:boolean){autoRenew.value=value;if(value)noDeadline.value=false}
</script>
<template>
 <div class="grid min-w-0 gap-3"><UInput v-model="deadline" type="date" aria-label="Срок договора" :disabled="disabled||noDeadline" class="w-full"/><div class="flex flex-wrap gap-x-5 gap-y-2"><UCheckbox :model-value="noDeadline" label="Без срока" :disabled="disabled" @update:model-value="setNoDeadline($event===true)"/><UCheckbox :model-value="autoRenew" label="Автопродление" :disabled="disabled" @update:model-value="setAutoRenew($event===true)"/></div></div>
</template>
