<script setup lang="ts">
defineProps<{inline?:boolean;title:string;description:string;busy:boolean}>()
const open=defineModel<boolean>('open',{default:false})
</script>
<template><section v-if="inline" class="template-library-panel"><header><h2>{{title}}</h2><p>{{description}}</p></header><slot/></section><UModal v-else v-model:open="open" :title="title" :description="description" :dismissible="!busy" :close="!busy" :ui="{content:'sm:max-w-5xl'}"><template #body><slot/></template></UModal></template>
<style scoped>
.template-library-panel{margin-top:28px}.template-library-panel>header{margin-bottom:24px}.template-library-panel>header h2{font-size:20px;font-weight:650;color:#334155}.template-library-panel>header p{font-size:13px;color:#8292a8;line-height:1.7;margin-top:9px}
</style>
