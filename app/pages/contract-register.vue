<script setup lang="ts">
import ProjectCompanyDirectory from '~/components/ProjectsPage/ProjectCompanyDirectory.vue'
import ContractRegister from '~/components/ProjectsPage/ContractRegister.vue'
definePageMeta({layout:'home'})
const access=useProjectAccess(),route=useRoute()
const tab=computed(()=>['counterparties','legal-entities'].includes(String(route.query.tab))?String(route.query.tab):'contracts')
const title=computed(()=>tab.value==='counterparties'?'Контрагенты':tab.value==='legal-entities'?'Наши юр. лица':'Реестр договоров')
</script>
<template>
 <div><header class="mb-8"><h1 class="text-3xl font-semibold text-slate-700">{{title}}</h1></header><p v-if="access.isPending.value" role="status">Проверяем доступ…</p><UAlert v-else-if="access.error.value" color="error" title="Не удалось проверить доступ" :actions="[{label:'Повторить',onClick:()=>access.refetch()}]"/><template v-else-if="access.data.value?.allowed"><ContractRegister v-if="tab==='contracts'"/><ProjectCompanyDirectory v-else :key="tab" :own-only="tab==='legal-entities'" base-path="/contract-register"/></template><UAlert v-else color="neutral" title="Нет доступа к реестру договоров" description="Сервис доступен пользователям с доступом к «Проектам»."/></div>
</template>
