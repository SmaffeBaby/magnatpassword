<script setup lang="ts">
import { dashboardBlocks, defaultDashboard, type DashboardBlockKey } from '~~/shared/utils/project-dashboard'

const props = defineProps<{ projectId: string }>()
const { query, blocks, save } = useProjectDashboard(() => props.projectId)
const auth = useAuthStore()
const open = ref(false), busy = ref(false), error = ref(''), revision = ref(0)
const draft = ref(defaultDashboard().blocks), dragging = ref<DashboardBlockKey | null>(null), announcement = ref('')
const descriptions = new Map(dashboardBlocks.map(block => [block.key, block]))
function show() {
  draft.value = blocks.value.map(block => ({ ...block }))
  revision.value = query.data.value?.revision ?? 0
  error.value = ''; announcement.value = ''; open.value = true
}
function move(key: DashboardBlockKey, to: number) {
  if (busy.value || to < 0 || to >= draft.value.length) return
  const from = draft.value.findIndex(block => block.key === key)
  if (from < 0 || from === to) return
  const [block] = draft.value.splice(from, 1)
  draft.value.splice(to, 0, block!)
  announcement.value = `${descriptions.get(key)?.label}: позиция ${to + 1} из ${draft.value.length}`
}
function drop(to: number) { if (dragging.value) move(dragging.value, to); dragging.value = null }
function startDrag(event: DragEvent, key: DashboardBlockKey) {
  if (busy.value || !event.dataTransfer) return
  dragging.value = key
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', key)
}
async function apply() {
  if (busy.value) return
  busy.value = true; error.value = ''
  try { await save(revision.value, { blocks: draft.value }); open.value = false }
  catch (failure: any) { error.value = failure?.data?.message || failure.message || 'Не удалось сохранить вид страницы' }
  finally { busy.value = false }
}
watch(() => auth.user?.id, () => { open.value = false })
</script>

<template>
  <UButton label="Настроить вид" icon="i-lucide-layout-dashboard" color="neutral" variant="outline" :disabled="!query.data.value || !!query.error.value" @click="show"/>
  <UModal v-model:open="open" title="Вид страницы проекта" description="Выберите блоки и их порядок. Настройки сохраняются только для вас, для этого проекта, на всех устройствах." :dismissible="!busy" :close="!busy" :ui="{ content: 'sm:max-w-2xl' }">
    <template #body>
      <form class="dashboard-settings" @submit.prevent="apply">
        <p class="dashboard-settings-hint">Перетаскивайте за значок слева или меняйте порядок стрелками.</p>
        <ol class="dashboard-settings-list" aria-label="Блоки страницы проекта">
          <li v-for="(block, index) in draft" :key="block.key" :class="{ 'is-hidden-block': !block.visible, 'is-dragging': dragging === block.key }" @dragover.prevent @drop.prevent="drop(index)">
            <span class="dashboard-drag-handle" :draggable="!busy" aria-hidden="true" @dragstart="startDrag($event, block.key)" @dragend="dragging = null"><UIcon name="i-lucide-grip-vertical"/></span>
            <span class="dashboard-block-icon"><UIcon :name="descriptions.get(block.key)!.icon"/></span>
            <div class="dashboard-block-choice"><UCheckbox v-model="block.visible" :label="descriptions.get(block.key)!.label" :disabled="busy"/><small>{{ descriptions.get(block.key)!.description }}</small></div>
            <div class="dashboard-reorder"><UButton type="button" icon="i-lucide-chevron-up" color="neutral" variant="ghost" size="sm" :aria-label="`Переместить «${descriptions.get(block.key)!.label}» выше`" :disabled="busy || index === 0" @click="move(block.key, index - 1)"/><UButton type="button" icon="i-lucide-chevron-down" color="neutral" variant="ghost" size="sm" :aria-label="`Переместить «${descriptions.get(block.key)!.label}» ниже`" :disabled="busy || index === draft.length - 1" @click="move(block.key, index + 1)"/></div>
          </li>
        </ol>
        <span class="sr-only" role="status" aria-live="polite">{{ announcement }}</span>
        <UAlert v-if="error" color="error" :description="error"/>
        <div class="dashboard-settings-footer"><UButton type="button" label="Сбросить" icon="i-lucide-rotate-ccw" color="neutral" variant="ghost" :disabled="busy" @click="draft = defaultDashboard().blocks"/><div><UButton type="button" label="Отмена" color="neutral" variant="outline" :disabled="busy" @click="open = false"/><UButton type="submit" label="Сохранить" :loading="busy"/></div></div>
      </form>
    </template>
  </UModal>
</template>

<style scoped>
.dashboard-settings{display:grid;gap:20px}.dashboard-settings-hint{font-size:13px;line-height:1.7;color:#8292a8}.dashboard-settings-list{display:grid;gap:10px;list-style:none;padding:0;margin:0}.dashboard-settings-list li{display:flex;align-items:center;gap:12px;padding:16px 14px;border:1px solid #e2e8f0;background:#fff;border-radius:14px;transition:border-color .15s,opacity .15s}.dashboard-settings-list .is-hidden-block{background:#f8fafc}.dashboard-settings-list .is-hidden-block .dashboard-block-icon{opacity:.45}.dashboard-settings-list .is-dragging{opacity:.5;border-color:var(--ui-primary)}.dashboard-drag-handle{display:grid;place-items:center;align-self:stretch;cursor:grab;color:#94a3b8;font-size:20px}.dashboard-drag-handle:active{cursor:grabbing}.dashboard-block-icon{display:grid;place-items:center;width:36px;height:36px;flex-shrink:0;border-radius:10px;background:#f1f3f8;color:var(--ui-primary);font-size:20px}.dashboard-block-choice{flex:1;min-width:0}.dashboard-block-choice small{display:block;margin-top:5px;font-size:11px;line-height:1.6;color:#94a3b8}.dashboard-reorder{display:flex;flex-shrink:0}.dashboard-settings-footer{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.dashboard-settings-footer>div{display:flex;gap:10px}@media(max-width:500px){.dashboard-settings-list li{padding:12px 10px;gap:8px}.dashboard-block-icon{display:none}.dashboard-reorder{flex-direction:column}.dashboard-block-choice small{font-size:10px}.dashboard-settings-footer{gap:8px}.dashboard-settings-footer>div{gap:8px}}
</style>
