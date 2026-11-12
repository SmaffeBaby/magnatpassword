<script setup lang="ts">
import ContractRegisterCard from '~/components/ContractRegisterCard.vue'
import ProjectsCard from '~/components/ProjectsPage/ProjectsCard.vue'
import RelationshipsCard from '~/components/RelationshipsCard.vue'
import FinanceCard from '~/components/FinanceCard.vue'
import PasswordCard from '~/components/PasswordPage/PasswordCard.vue'
import TeamCard from '~/components/TeamCard.vue'
import KabanCard from '~/components/KabanCard.vue'
definePageMeta({ layout: 'home' })
const projectAccess = useProjectAccess()
const home = useHomeLayoutStore()
const components = { contracts: ContractRegisterCard, passwords: PasswordCard, finances: FinanceCard, relationships: RelationshipsCard, projects: ProjectsCard, team: TeamCard, kaban: KabanCard }
const rows = computed(() => home.display.rows.map(row => ({ ...row, cards: row.cards.filter(id => !['projects','contracts'].includes(id) || projectAccess.data.value?.allowed) })).filter(row => row.cards.length))
</script>
<template>
  <div class="home-custom-layout">
    <p v-if="home.loading" class="home-layout-loading" role="status">Загружаем главную страницу…</p>
    <template v-else>
      <div v-for="(row,index) in rows" :key="index" class="home-application-row" :class="`align-${row.align}`" :aria-label="`Ряд ${index + 1}`"><component v-for="id in row.cards" :key="id" :is="components[id]" hero/></div>
      <div v-if="!rows.length" class="home-layout-empty"><UIcon name="i-lucide-layout-dashboard"/><h1>Всё по-своему</h1><p>Плашки скрыты. Верните нужные через «Настроить главную».</p><UButton color="neutral" variant="outline" label="Настроить главную" @click="home.open"/></div>
    </template>
    <UAlert v-if="home.error && !home.editing" color="error" title="Настройки главной страницы недоступны" :description="home.error" :actions="[{label:'Повторить',onClick:()=>home.load()}]"/>
  </div>
  <UAlert v-if="projectAccess.error.value" class="home-access-error" color="error" title="Не удалось проверить доступ к проектам" :actions="[{ label: 'Повторить', onClick: () => projectAccess.refetch() }]" />
</template>

<style scoped>
.home-custom-layout{width:100%;max-width:1660px;display:flex;flex-direction:column;gap:24px;min-width:0}.home-application-row{display:flex;flex-wrap:wrap;align-items:center;gap:24px;width:100%;min-width:0}.align-left{justify-content:flex-start}.align-center{justify-content:center}.align-right{justify-content:flex-end}.home-application-row :deep(.password-launch-card){flex:0 1 300px;min-width:0;max-width:100%;width:300px;padding:26px 22px;gap:16px;font-size:clamp(23px,2vw,32px);white-space:nowrap}.home-application-row :deep(.finance-app-icon),.home-application-row :deep(.password-launch-card img),.home-application-row :deep(.projects-launch-icon){width:44px;height:44px;flex-shrink:0}.home-layout-loading{text-align:center;color:#64748b;font-size:14px}.home-layout-empty{text-align:center;color:#64748b;padding:40px 16px}.home-layout-empty>.iconify{width:36px;height:36px;color:#94a3b8}.home-layout-empty h1{margin:14px 0 8px;font-size:22px;color:#334155;font-weight:600}.home-layout-empty p{font-size:14px;line-height:1.7;margin-bottom:20px}@media(max-width:767px){.home-custom-layout{gap:20px}.home-application-row{gap:20px}.home-application-row :deep(.password-launch-card){flex:0 1 360px;width:100%;font-size:28px;padding:24px}.home-layout-empty p{max-width:280px;margin-inline:auto}}
</style>
