<script setup lang="ts">
import HomeServiceCard from '~/components/Layout/HomeServiceCard.vue'
definePageMeta({ layout: 'home' })
const home = useHomeLayoutStore()
const rows = computed(() => home.display.rows.map(row => ({ ...row, cards: row.cards })).filter(row => row.cards.length))
</script>
<template>
  <div class="home-custom-layout">
    <p v-if="home.loading" class="home-layout-loading" role="status">Загружаем главную страницу…</p>
    <template v-else>
      <div v-for="(row,index) in rows" :key="index" class="home-application-row" :class="`align-${row.align}`" :aria-label="`Ряд ${index + 1}`">
        <HomeServiceCard v-for="id in row.cards" :key="id" :service="id" />
      </div>
      <div v-if="!rows.length" class="home-layout-empty"><UIcon name="i-lucide-layout-dashboard"/><h1>Всё по-своему</h1><p>Плашки скрыты. Верните нужные через «Настроить главную».</p><UButton color="neutral" variant="outline" label="Настроить главную" @click="home.open"/></div>
    </template>
    <UAlert v-if="home.error && !home.editing" color="error" title="Настройки главной страницы недоступны" :description="home.error" :actions="[{label:'Повторить',onClick:()=>home.load()}]"/>
  </div>
</template>

<style scoped>
.home-custom-layout{width:100%;max-width:1660px;display:flex;flex-direction:column;gap:24px;min-width:0}.home-application-row{display:flex;flex-wrap:wrap;align-items:center;gap:24px;width:100%;min-width:0}.align-left{justify-content:flex-start}.align-center{justify-content:center}.align-right{justify-content:flex-end}.home-application-row :deep(.password-launch-card){flex:0 1 300px;min-width:0;max-width:100%;width:300px;padding:26px 22px;gap:16px;font-size:clamp(23px,2vw,32px);white-space:nowrap}.home-application-row :deep(.finance-app-icon),.home-application-row :deep(.password-launch-card img),.home-application-row :deep(.projects-launch-icon){width:44px;height:44px;flex-shrink:0}.home-layout-loading{text-align:center;color:#64748b;font-size:14px}.home-layout-empty{text-align:center;color:#64748b;padding:40px 16px}.home-layout-empty>.iconify{width:36px;height:36px;color:#94a3b8}.home-layout-empty h1{margin:14px 0 8px;font-size:22px;color:#334155;font-weight:600}.home-layout-empty p{font-size:14px;line-height:1.7;margin-bottom:20px}@media(max-width:767px){.home-custom-layout{gap:20px}.home-application-row{gap:20px}.home-application-row :deep(.password-launch-card){flex:0 1 360px;width:100%;font-size:28px;padding:24px}.home-layout-empty p{max-width:280px;margin-inline:auto}}

.home-application-row{align-items:stretch}.home-application-row :deep(.password-launch-card){box-sizing:border-box;flex:0 0 300px;width:300px;height:112px;min-height:112px;max-height:112px;padding:20px 22px;font-size:24px;line-height:1.2;white-space:normal;overflow:hidden;justify-content:flex-start}.home-application-row :deep(.password-launch-card>img),.home-application-row :deep(.password-launch-card>.iconify),.home-application-row :deep(.password-launch-card>.finance-app-icon),.home-application-row :deep(.password-launch-card>.projects-app-icon){box-sizing:border-box;width:44px;height:44px;min-width:44px;max-width:44px;flex:0 0 44px;font-size:44px;padding:0}.home-application-row :deep(.projects-launch-icon>.iconify){width:36px;height:36px;font-size:36px}.home-application-row :deep(.password-launch-card>span:last-child:not(.iconify)){min-width:0;font-size:inherit!important;line-height:1.2;white-space:normal!important;overflow-wrap:normal}@media(max-width:767px){.home-application-row :deep(.password-launch-card){flex:0 1 360px;width:100%;height:104px;min-height:104px;max-height:104px;font-size:24px;padding:18px 20px}}
</style>
