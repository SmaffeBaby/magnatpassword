<script setup lang="ts">
import type { HomeAppId } from '~~/shared/types/home-layout'
import { documentEditors } from '~~/shared/utils/project-documents'

const props = defineProps<{ mode: 'replace' | 'new'; dragging?: boolean }>()
const emit = defineEmits<{ choose: [path: string] }>()
const home = useHomeLayoutStore(), auth = useAuthStore(), route = useRoute()
const open = ref(false), editors = ref(false)
const cards: Record<HomeAppId, { to: string; name: string; icon: string }> = {
  applications: { to: '', name: 'Редакторы', icon: 'i-lucide-layout-grid' },
  contracts: { to: '/contract-register', name: 'Реестр договоров', icon: 'i-lucide-notebook-tabs' },
  passwords: { to: '/password', name: 'Пароли', icon: 'i-lucide-key-round' },
  finances: { to: '/finances', name: 'Финансы', icon: 'i-lucide-chart-pie' },
  relationships: { to: '/relationships', name: 'Взаимосвязи', icon: 'i-lucide-network' },
  projects: { to: '/projects', name: 'Проекты', icon: 'i-lucide-folder-kanban' },
  spaces: { to: '/spaces', name: 'Пространства', icon: 'i-lucide-orbit' },
  team: { to: '/team', name: 'Команда', icon: 'i-lucide-users-round' },
  kaban: { to: '/kaban', name: 'Задачи', icon: 'i-lucide-list-checks' }
}
const rows = computed(() => home.display.rows.filter(row => row.cards.length))
watch(open, value => {
  if (!value) return
  if (!home.ready && !home.loading) void home.load()
  editors.value = false
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
        <section class="services-panel" :aria-label="mode === 'new' ? 'Новая вкладка' : 'Все сервисы'">
          <header>
            <button v-if="editors" type="button" class="service-back" aria-label="Назад к сервисам" @click="editors = false"><UIcon name="i-lucide-arrow-left"/></button>
            <strong>{{ editors ? 'Редакторы' : mode === 'new' ? 'Новая вкладка' : 'Все сервисы' }}</strong>
            <UButton icon="i-lucide-house" color="neutral" variant="ghost" aria-label="На главную" @click="choose('/')"/>
          </header>
          <div v-if="editors" class="services-row">
            <button v-for="editor in documentEditors" :key="editor.key" type="button" class="service-card" @click="choose(`/office/${editor.key}`)">
              <img :src="`/editor-icons/${editor.key}.ico`" alt=""/>{{ editor.label }}
            </button>
          </div>
          <p v-else-if="home.loading" role="status">Загружаем сервисы…</p>
          <UAlert v-else-if="home.error && !home.ready" color="error" title="Не удалось загрузить сервисы" :actions="[{label:'Повторить',onClick:()=>home.load()}]"/>
          <template v-else>
            <div v-for="(row, index) in rows" :key="index" class="services-row" :class="`align-${row.align}`">
              <button v-for="id in row.cards" :key="id" type="button" class="service-card" @click="id === 'applications' ? editors = true : choose(cards[id].to)">
                <UIcon :name="cards[id].icon"/>{{ cards[id].name }}
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
.services-panel header { display:flex; align-items:center; gap:8px; }
.services-panel header strong { flex:1; color:#26374d; }
.services-row { display:flex; flex-wrap:wrap; gap:8px; }
.services-row.align-center { justify-content:center; }
.services-row.align-right { justify-content:flex-end; }
.service-card { flex:0 0 calc((100% - 16px)/3); min-width:0; min-height:49px; border-radius:10px; padding:8px; text-align:left; font-size:13px; }
.service-card img,.service-card .iconify { width:20px; height:20px; flex-shrink:0; }
@media(max-width:600px) { .service-card { flex-basis:calc((100% - 8px)/2); } }
</style>
