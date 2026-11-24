<script setup lang="ts">
import type { HomeAppId } from '~~/shared/types/home-layout'
import { homeApps } from '~~/shared/utils/home-layout'
import ServiceShortcutCards from './ServiceShortcutCards.vue'

const props = defineProps<{ mode: 'replace' | 'new'; dragging?: boolean }>()
const emit = defineEmits<{ choose: [path: string] }>()
const home = useHomeLayoutStore(), auth = useAuthStore(), route = useRoute()
const open = defineModel<boolean>('open', { default: false })
const service = ref<HomeAppId | null>(null)
const panel = ref<HTMLElement>()
function label(id: HomeAppId) { return id === 'applications' ? 'Редакторы' : homeApps[id].label }
watch(service, async (current, previous) => {
  await nextTick()
  if (!open.value) return
  panel.value?.querySelector<HTMLElement>(current ? '.service-back' : `[data-service="${previous}"]`)?.focus()
})
const rows = computed(() => home.display.rows.filter(row => row.cards.length))
watch(open, value => {
  if (!value) return
  if (!home.ready && !home.loading) void home.load()
  service.value = null
})
watch([() => route.fullPath, () => auth.user?.id], () => { open.value = false })
watch(() => props.dragging, dragging => { if (dragging) open.value = false })

function choose(path: string) {
  open.value = false
  emit('choose', path)
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ side: 'bottom', align: 'center', sideOffset: 10, collisionPadding: 12 }"
    :ui="{ content: 'overflow-hidden rounded-[22px] shadow-xl' }"
  >
    <slot/>
    <template #content>
        <section ref="panel" class="services-panel" :class="{ 'services-panel-submenu': service }" :aria-label="service ? label(service) : mode === 'new' ? 'Новая вкладка' : 'Все сервисы'">
          <header>
            <button v-if="service" type="button" class="service-back" aria-label="Назад к сервисам" @click="service = null"><UIcon name="i-lucide-arrow-left"/></button>
            <strong>{{ service ? label(service) : mode === 'new' ? 'Новая вкладка' : 'Все сервисы' }}</strong>
            <UButton icon="i-lucide-house" color="neutral" variant="ghost" aria-label="На главную" @click="choose('/')"/>
          </header>
          <ServiceShortcutCards v-if="service" :service="service" in-tabs @choose="choose"/>
          <p v-else-if="home.loading" role="status">Загружаем сервисы…</p>
          <UAlert v-else-if="home.error && !home.ready" color="error" title="Не удалось загрузить сервисы" :actions="[{label:'Повторить',onClick:()=>home.load()}]"/>
          <template v-else>
            <div v-for="(row, index) in rows" :key="index" class="services-row" :class="`align-${row.align}`">
              <button v-for="id in row.cards" :key="id" type="button" class="service-card" :data-service="id" @click="service = id">
                <UIcon :name="homeApps[id].icon"/>{{ label(id) }}
              </button>
            </div>
            <p v-if="!rows.length">Сервисы скрыты в настройках главной страницы.</p>
          </template>
        </section>
    </template>
  </UPopover>
</template>

<style scoped>
.service-back,.service-card { display:flex; align-items:center; gap:8px; border:1px solid #dce5ef; background:#fff; color:#334155; }
.service-back { justify-content:center; width:36px; min-height:36px; border-radius:11px; }
.service-back:hover,.service-card:hover { background:#eaf2fa; }
.service-back:focus-visible,.service-card:focus-visible { outline:2px solid #356c9e; outline-offset:-2px; }
.services-panel { width:min(540px,calc(100vw - 36px)); display:grid; gap:12px; padding:14px; background:#f8fbfe; max-height:65dvh; overflow:auto; }
.services-panel-submenu { background:white; }
.services-panel header { display:flex; align-items:center; gap:8px; }
.services-panel header strong { flex:1; color:#26374d; }
.services-row { display:flex; flex-wrap:wrap; gap:8px; }
.services-row.align-center { justify-content:center; }
.services-row.align-right { justify-content:flex-end; }
.service-card { flex:0 0 calc((100% - 16px)/3); min-width:0; min-height:49px; border-radius:10px; padding:8px; text-align:left; font-size:13px; }
.service-card img,.service-card .iconify { width:20px; height:20px; flex-shrink:0; }
@media(max-width:600px) { .service-card { flex-basis:calc((100% - 8px)/2); } }
</style>
