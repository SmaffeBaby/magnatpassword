<script setup lang="ts">
import type { HomeAppId, HomeAlignment } from '~~/shared/types/home-layout'
import { homeApps } from '~~/shared/utils/home-layout'
const home = useHomeLayoutStore(), projectAccess = useProjectAccess()
const dragged = ref<HomeAppId | null>(null)
const alignments: { value: HomeAlignment; label: string; icon: string }[] = [
  { value: 'left', label: 'Слева', icon: 'i-lucide-align-left' },
  { value: 'center', label: 'По центру', icon: 'i-lucide-align-center' },
  { value: 'right', label: 'Справа', icon: 'i-lucide-align-right' }
]
const rowOptions = computed(() => [...home.draft.rows.map((_, index) => ({ label: `Ряд ${index + 1}`, value: String(index) })), { label: '+ Новый ряд', value: 'new' }])
function changeRow(id: HomeAppId, value: string) {
  if (value !== 'new' && home.draft.rows[Number(value)]?.cards.includes(id)) return
  home.move(id, value === 'new' ? 'new' : Number(value))
}
function shift(id: HomeAppId, row: number, position: number, delta: number) { home.move(id, row, delta > 0 ? position + 2 : position - 1) }
function startDrag(event: DragEvent, id: HomeAppId) {
  if (home.saving) { event.preventDefault(); return }
  dragged.value = id
  if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', id) }
}
function drop(row: number | 'new', position?: number) { if (dragged.value && !home.saving) home.move(dragged.value, row, position); dragged.value = null }
onBeforeUnmount(() => home.cancel())
</script>

<template>
 <UButton icon="i-lucide-layout-dashboard" color="neutral" variant="ghost" class="home-customize-trigger" label="Настроить главную" :disabled="!home.ready || home.loading" @click="home.open"/>
 <UModal :open="home.editing" title="Настроить главную" description="Соберите удобное рабочее пространство. Настройки сохраняются в вашем аккаунте." :dismissible="!home.saving" :ui="{content:'sm:max-w-4xl',body:'min-w-0',footer:'justify-between flex-wrap'}" @update:open="value => { if (!value) home.cancel() }">
  <template #body>
   <div class="home-layout-editor" :aria-busy="home.saving">
    <p class="home-editor-help">Перетаскивайте плашки между рядами или используйте стрелки и выбор ряда. Выравнивание задаётся для каждого ряда.</p>
    <fieldset v-for="(row, index) in home.draft.rows" :key="index" class="home-editor-row" :disabled="home.saving || home.loading" @dragover.prevent @drop.prevent="drop(index)">
     <legend>Ряд {{ index + 1 }}</legend>
     <div class="home-row-toolbar">
      <div class="home-alignments" role="group" :aria-label="`Выравнивание ряда ${index + 1}`"><UButton v-for="align in alignments" :key="align.value" :icon="align.icon" :label="align.label" size="sm" color="neutral" :variant="row.align === align.value ? 'soft' : 'ghost'" :aria-pressed="row.align === align.value" @click="row.align = align.value"/></div>
      <div class="flex gap-1"><UButton icon="i-lucide-arrow-up" size="sm" color="neutral" variant="ghost" :aria-label="`Поднять ряд ${index + 1}`" :disabled="index === 0 || home.saving" @click="home.reorderRow(index,-1)"/><UButton icon="i-lucide-arrow-down" size="sm" color="neutral" variant="ghost" :aria-label="`Опустить ряд ${index + 1}`" :disabled="index === home.draft.rows.length - 1 || home.saving" @click="home.reorderRow(index,1)"/></div>
     </div>
     <div class="home-editor-cards" :class="`align-${row.align}`">
      <article v-for="(id, position) in row.cards" :key="id" class="home-editor-card" :class="{'is-dragged':dragged === id}" :draggable="!home.saving" @dragstart="startDrag($event,id)" @dragend="dragged=null" @dragover.prevent.stop @drop.prevent.stop="drop(index,position)">
       <div class="home-editor-card-heading"><UIcon name="i-lucide-grip-vertical" class="home-drag-handle"/><UIcon :name="homeApps[id].icon"/><strong>{{ homeApps[id].label }}</strong><UButton icon="i-lucide-eye-off" size="xs" color="neutral" variant="ghost" :aria-label="`Скрыть ${homeApps[id].actionLabel}`" :disabled="home.saving" @click="home.hide(id)"/></div>
       <p v-if="id === 'projects' && !projectAccess.data.value?.allowed" class="home-card-access">Появится при наличии доступа</p>
       <div class="home-card-position"><UButton icon="i-lucide-chevron-left" size="xs" variant="outline" color="neutral" :aria-label="`${homeApps[id].label}: переместить влево`" :disabled="position === 0 || home.saving" @click="shift(id,index,position,-1)"/><USelect :model-value="String(index)" :items="rowOptions" size="sm" :aria-label="`Ряд плашки «${homeApps[id].label}»`" :disabled="home.saving" @update:model-value="value => changeRow(id,String(value))"/><UButton icon="i-lucide-chevron-right" size="xs" variant="outline" color="neutral" :aria-label="`${homeApps[id].label}: переместить вправо`" :disabled="position === row.cards.length - 1 || home.saving" @click="shift(id,index,position,1)"/></div>
      </article>
     </div>
    </fieldset>
    <div v-if="dragged" class="home-new-row" @dragover.prevent @drop.prevent="drop('new')"><UIcon name="i-lucide-plus"/> Перенесите сюда, чтобы создать новый ряд</div>
    <div v-if="home.draft.hidden.length" class="home-hidden-apps"><h3>Скрытые плашки</h3><p>Их можно вернуть в любой момент.</p><div class="flex flex-wrap gap-2"><UButton v-for="id in home.draft.hidden" :key="id" :icon="homeApps[id].icon" :label="`Показать ${homeApps[id].actionLabel}`" color="neutral" variant="outline" :disabled="home.saving || home.loading" @click="home.show(id)"/></div></div>
    <UAlert v-if="home.error" color="error" :description="home.error"/>
    <UButton v-if="home.conflict" color="neutral" variant="outline" label="Загрузить сохранённый вариант" :loading="home.loading" @click="home.load"/>
   </div>
  </template>
  <template #footer><UButton icon="i-lucide-rotate-ccw" color="neutral" variant="ghost" label="По умолчанию" :disabled="home.saving || home.loading" @click="home.reset"/><div class="flex gap-2"><UButton label="Отмена" color="neutral" variant="outline" :disabled="home.saving" @click="home.cancel"/><UButton label="Сохранить" :loading="home.saving" :disabled="home.loading" @click="home.save"/></div></template>
 </UModal>
</template>

<style scoped>
.home-layout-editor{display:flex;flex-direction:column;gap:20px}.home-editor-help{font-size:13px;line-height:1.7;color:#64748b}.home-editor-row{min-width:0;border:1px solid #e2e8f0;border-radius:20px;padding:12px 16px 16px;background:#f8fafc99}.home-editor-row legend{padding:0 8px;font-size:13px;font-weight:600;color:#475569}.home-row-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}.home-alignments{display:flex;gap:2px;padding:3px;border:1px solid #e2e8f0;border-radius:10px;background:#fff}.home-editor-cards{display:flex;flex-wrap:wrap;gap:12px;min-height:36px}.align-left{justify-content:flex-start}.align-center{justify-content:center}.align-right{justify-content:flex-end}.home-editor-card{flex:0 1 228px;min-width:0;width:100%;padding:12px;border:1px solid #e2e8f0;border-radius:14px;background:#fff;box-shadow:0 4px 12px #0f172a04;cursor:grab}.home-editor-card:active{cursor:grabbing}.home-editor-card.is-dragged{opacity:.45}.home-editor-card-heading{display:flex;align-items:center;gap:8px;color:#334155;font-size:13px}.home-editor-card-heading strong{flex:1;min-width:0}.home-drag-handle{color:#94a3b8}.home-card-position{display:flex;align-items:center;gap:6px;margin-top:12px}.home-card-position :deep([role=combobox]){flex:1;min-width:0}.home-card-access{font-size:11px;color:#94a3b8;margin-top:8px}.home-hidden-apps h3{font-weight:600;font-size:14px}.home-hidden-apps p{font-size:12px;color:#64748b;margin:4px 0 12px}.home-new-row{display:flex;align-items:center;justify-content:center;gap:8px;padding:20px;border:1px dashed #94a3b8;border-radius:14px;font-size:13px;color:#64748b}.home-editor-row:disabled{opacity:.6}@media(max-width:600px){.home-editor-card{flex-basis:100%}.home-row-toolbar{gap:8px}.home-alignments :deep(button){font-size:11px;padding-inline:7px}.home-editor-row{padding-inline:10px}.home-customize-trigger :deep(.truncate){max-width:0;overflow:hidden}.home-customize-trigger{gap:0}}
</style>
