<script setup lang="ts">
import PasswordCard from './PasswordPage/PasswordCard.vue'
import FinanceCard from './FinanceCard.vue'
import RelationshipsCard from './RelationshipsCard.vue'
import ProjectsCard from './ProjectsPage/ProjectsCard.vue'
import TeamCard from './TeamCard.vue'
import KabanCard from './KabanCard.vue'
const projectAccess=useProjectAccess(),home=useHomeLayoutStore(),auth=useAuthStore(),route=useRoute()
const open=ref(false)
const { application } = useAccountBrand()
const currentServiceName = computed(() => application.value?.name || 'Все сервисы')
const components={passwords:PasswordCard,finances:FinanceCard,relationships:RelationshipsCard,projects:ProjectsCard,team:TeamCard,kaban:KabanCard}
const rows=computed(()=>home.display.rows.map(row=>({...row,cards:row.cards.filter(id=>id!=='projects'||projectAccess.data.value?.allowed)})).filter(row=>row.cards.length))
watch(()=>route.path,()=>{open.value=false})
watch(()=>auth.user?.id,()=>{open.value=false})
watch(open,value=>{if(value&&!home.ready&&!home.loading)void home.load()})
</script>
<template>
 <nav class="workspace-apps services-switcher" aria-label="Приложения">
  <UPopover v-model:open="open" :content="{side:'bottom',align:'center',sideOffset:12,collisionPadding:16}" :ui="{content:'services-popover rounded-[22px] shadow-xl'}">
   <button type="button" class="password-glass services-trigger" :class="{'is-open':open}" :aria-label="currentServiceName" :aria-expanded="open"><UIcon name="i-lucide-layout-grid"/><span>{{ currentServiceName }}</span><UIcon name="i-lucide-chevron-down" class="services-chevron"/></button>
   <template #content>
    <section class="services-panel" aria-label="Все сервисы">
     <header><div><strong>Все сервисы</strong></div><UButton to="/" icon="i-lucide-house" color="neutral" variant="ghost" aria-label="На главную" @click="open=false"/></header>
     <p v-if="home.loading" class="services-status" role="status">Загружаем сервисы…</p>
     <UAlert v-else-if="home.error&&!home.ready" color="error" title="Не удалось загрузить сервисы" :description="home.error" :actions="[{label:'Повторить',onClick:()=>home.load()}]"/>
     <template v-else-if="home.ready">
      <div v-for="(row,index) in rows" :key="index" class="services-row" :class="`align-${row.align}`" :aria-label="`Ряд ${index+1}`"><component v-for="id in row.cards" :key="id" :is="components[id]" @click="open=false"/></div>
      <div v-if="!rows.length" class="services-empty"><UIcon name="i-lucide-layout-dashboard"/><p>Все сервисы скрыты в настройках главной страницы.</p><UButton to="/" label="Открыть главную" color="neutral" variant="outline" @click="open=false"/></div>
     </template>
     <UAlert v-if="projectAccess.error.value" color="error" title="Не удалось проверить доступ к проектам" :actions="[{label:'Повторить',onClick:()=>projectAccess.refetch()}]"/>
    </section>
   </template>
  </UPopover>
 </nav>
</template>
<style scoped>
.services-switcher{overflow:visible;width:auto;justify-self:center}
.workspace-apps .services-trigger{display:inline-flex;flex-direction:row;align-items:center;justify-content:center;gap:10px;padding:11px 18px;font-size:14px;border:1px solid #e2e8f0;cursor:pointer;transition:box-shadow .2s,border-color .2s,background .2s}
.services-trigger:hover,.services-trigger.is-open{border-color:#cbd5e1;box-shadow:0 5px 20px #0f172a0c;background:#fff}
.services-trigger:focus-visible{outline:2px solid var(--ui-primary);outline-offset:4px}
.services-trigger>.iconify{width:20px;height:20px;flex-shrink:0}
.services-trigger>.services-chevron{width:15px;height:15px;color:#8291a6;transition:transform .2s}
.services-trigger.is-open>.services-chevron{transform:rotate(180deg)}
.services-panel{width:min(680px,calc(100vw - 32px));max-height:min(680px,calc(100dvh - 150px));overflow-y:auto;padding:22px;display:flex;flex-direction:column;gap:18px;background:linear-gradient(145deg,#fff,#f8fafc);border-radius:22px}
.services-panel>header{display:flex;align-items:center;justify-content:space-between;gap:20px;padding-bottom:14px;border-bottom:1px solid #e7edf3}
.services-panel>header strong{font-size:17px;font-weight:650;color:#334155}
.services-row{display:flex;flex-wrap:wrap;gap:12px;min-width:0}.align-left{justify-content:flex-start}.align-center{justify-content:center}.align-right{justify-content:flex-end}
.services-row :deep(.password-glass){display:flex;flex-direction:row;align-items:center;justify-content:flex-start;width:calc((100% - 24px)/3);min-width:0;gap:10px;padding:17px 14px;border-radius:16px;font-size:14px;white-space:normal;transition:transform .18s,box-shadow .18s;background:#fff;box-shadow:0 4px 18px #0f172a06;border:1px solid #e7edf3}
.services-row :deep(.password-glass:hover){transform:translateY(-2px);box-shadow:0 8px 24px #0f172a0c}
.services-row :deep(.password-glass:focus-visible){outline:2px solid var(--ui-primary);outline-offset:2px}
.services-row :deep(.password-glass.router-link-active){border-color:var(--ui-primary);box-shadow:0 0 0 1px var(--ui-primary)}
.services-row :deep(.password-glass img),.services-row :deep(.finance-app-icon),.services-row :deep(.projects-app-icon){width:26px;height:26px;flex-shrink:0}
.services-empty{text-align:center;padding:16px;color:#8291a6}.services-empty>.iconify{width:32px;height:32px}.services-empty p{font-size:13px;line-height:1.7;margin:12px 0 16px}.services-status{font-size:13px;color:#8291a6;padding:20px 0;text-align:center}
@media(max-width:600px){.workspace-apps .services-trigger{padding:8px 14px;font-size:13px;gap:8px}.services-panel{padding:18px;gap:14px;max-height:calc(100dvh - 170px)}.services-row{gap:10px}.services-row :deep(.password-glass){width:calc((100% - 10px)/2);padding:16px 10px;font-size:12px;gap:8px}.services-row :deep(.password-glass img),.services-row :deep(.finance-app-icon),.services-row :deep(.projects-app-icon){width:22px;height:22px}}
@media(prefers-reduced-motion:reduce){.services-trigger,.services-trigger>.services-chevron,.services-row :deep(.password-glass){transition:none}}
</style>
