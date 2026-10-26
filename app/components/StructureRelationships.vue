<script setup lang="ts">
import { useStructureRelationships } from '../composables/useStructureRelationships'
import type { VaultSource } from '~~/shared/types/sharing'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
import type { StructureView } from '~~/shared/utils/structure-relationships'
const props = defineProps<{ sources: VaultSource[]; mode: StructureView }>()
const emit = defineEmits<{ open: [entry: ScopedCredential]; category: [key: string]; vault: [id: string] }>()
const { query, linkedOnly, full, diagram, selected, selectedRow, selectedEntry, connections, labels, focused, zoomPercent, clear, fit, changeZoom, chooseFromList } = useStructureRelationships(props)
const openCategory = computed(() => selectedRow.value?.categoryKey ?? selected.value?.categoryKey)
</script>
<template>
  <section class="structure-diagram" :aria-label="mode==='categories'?'Взаимосвязи категорий':'Взаимосвязи хранилищ'">
    <div class="relationship-heading"><div><h2>{{ mode==='categories'?'Схема категорий':'Схема хранилищ' }}</h2><p>{{ mode==='categories'?'Папки, состав категорий и связи между их карточками.':'Категории, папки и карточки внутри каждого хранилища.' }}</p></div><span class="relationship-total">{{ diagram.tables.length }} блоков · {{ diagram.links.length }} линий</span></div>
    <div class="relationship-toolbar"><UInput v-model="query" icon="i-lucide-search" placeholder="Найти блок или карточку" aria-label="Поиск по схеме"/><UCheckbox v-model="linkedOnly" label="Только блоки со связями"/><UButton color="neutral" variant="outline" icon="i-lucide-scan" label="Вписать схему" @click="fit"/></div>
    <div class="relationship-legend structure-legend"><span><i class="structure-key shared"/>Общая карточка</span><span><i class="structure-key manual"/>Подписка или ручная связь</span><span><i class="structure-key folder"/>Категория в папке</span><span class="relationship-legend-note">Линии соединяют конкретные строки блоков</span></div>
    <div v-if="focused && selected" class="relationship-focus-bar"><UIcon name="i-lucide-focus"/><span>Связи блока: <strong>{{ selected.label }}</strong></span><UButton size="xs" color="neutral" variant="outline" label="Вся схема" @click="clear"/></div>
    <div v-if="mode==='vaults' && full.tables.length===1" class="structure-notice">Для просмотра связей между хранилищами выберите «Все хранилища» в боковом меню.</div>
    <div class="structure-layout">
      <div ref="structure-container" class="structure-canvas">
        <svg ref="structure-canvas" role="group" aria-label="Схема связей. Нажмите на заголовок блока или строку. Заголовок можно перетаскивать."/>
        <div v-if="!diagram.tables.length" class="relationship-no-results"><UIcon name="i-lucide-panels-top-left"/><strong>Нет блоков для отображения</strong><p>Измените поиск или отключите фильтр «Только блоки со связями».</p><UButton size="sm" color="neutral" variant="outline" label="Сбросить фильтры" @click="query='';linkedOnly=false;clear()"/></div>
        <div class="relationship-map-controls"><UButton color="neutral" variant="outline" icon="i-lucide-minus" aria-label="Уменьшить схему" @click="changeZoom(1/1.25)"/><span>{{ zoomPercent }}%</span><UButton color="neutral" variant="outline" icon="i-lucide-plus" aria-label="Увеличить схему" @click="changeZoom(1.25)"/><UButton color="neutral" variant="outline" icon="i-lucide-scan" aria-label="Вписать схему" @click="fit"/></div><p class="relationship-hint">Перетаскивайте блок за заголовок · Ctrl / ⌘ + колесо — масштаб</p>
      </div>
      <aside class="relationship-detail structure-detail" aria-label="Пояснения к схеме">
        <template v-if="selected"><div class="relationship-detail-top"><span class="relationship-kind">{{ labels[selected.kind] }}</span><UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-x" aria-label="Снять выделение" @click="clear"/></div><h2>{{ selected.label }}</h2><p>{{ selected.subtitle }}</p><div v-if="selectedRow" class="structure-selected-row"><strong>{{ selectedRow.label }}</strong><small>{{ selectedRow.meta }}</small></div>
          <div class="relationship-detail-actions"><UButton v-if="selectedEntry" color="neutral" variant="outline" icon="i-lucide-arrow-up-right" label="Открыть карточку" @click="emit('open',selectedEntry)"/><UButton v-else-if="openCategory" color="neutral" variant="outline" icon="i-lucide-folder-open" label="Открыть категорию" @click="emit('category',openCategory)"/><UButton v-else-if="selected.kind==='vault'" color="neutral" variant="outline" icon="i-lucide-vault" label="Открыть хранилище" @click="emit('vault',selected.vaultId)"/><UButton :variant="focused?'soft':'solid'" icon="i-lucide-focus" :label="focused?'Показать всю схему':'Только связи блока'" @click="focused=!focused"/></div>
          <h3>{{ selectedRow?'Связи строки':'Связи блока' }} <span>{{ connections.length }}</span></h3><button v-for="connection in connections" :key="connection.id" class="relation-detail-item" @click="chooseFromList(connection.other.id)"><span class="relationship-kind">{{ labels[connection.other.kind] }}</span><strong>{{ connection.other.label }}</strong><small>{{ connection.other.subtitle }}</small><span class="relation-reasons"><span v-for="reason in connection.reasons" :key="reason">{{ reason }}</span></span></button><p v-if="!connections.length" class="relationship-detail-empty">Связей с другими блоками нет. Одинаковые названия сами по себе не создают связь.</p>
        </template>
        <template v-else><div class="relationship-detail-intro"><span class="relationship-intro-icon"><UIcon name="i-lucide-table-2"/></span><h2>Как читать схему</h2><p>Каждый блок — {{ mode==='categories'?'категория или папка':'хранилище' }}. Внутри показаны доступные элементы, а линии выходят из связанных строк.</p><p>Нажмите на строку для пояснений. Заголовок выделяет все связи блока и позволяет перемещать его по схеме.</p><p>Связи внутри одного блока не рисуются. Доступы участников сохраняются.</p></div><h3>Блоки на схеме</h3><button v-for="table in diagram.tables" :key="table.id" class="relation-card-option" @click="chooseFromList(table.id)"><span><strong>{{ table.label }}</strong><small>{{ table.subtitle }} · {{ labels[table.kind] }}</small></span><span class="relation-degree">{{ table.rows.length }}</span></button></template>
      </aside>
    </div>
  </section>
</template>
