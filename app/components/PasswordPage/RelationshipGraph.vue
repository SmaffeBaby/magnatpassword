<script setup lang="ts">
import { useRelationshipGraph } from '../../composables/useRelationshipGraph'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'

const props = defineProps<{ entries: ScopedCredential[] }>()
const emit = defineEmits<{ edit: [entry: ScopedCredential] }>()
const { mode, query, linkedOnly, modes, graph, selected, selectedEntry, connected, cards, allCards, cardList, isolated, degrees, focusOnly, zoomPercent, bundles, kindLabels, limited, openSelected, clearSelection, focusSelected, selectFromList, reset, changeZoom } = useRelationshipGraph(props, entry => emit('edit', entry))
</script>
<template>
  <section class="relationships" aria-label="Взаимосвязь карточек">
    <div class="relationship-heading"><div><h2>Карта связей</h2><p>Выберите карточку — её связи подсветятся, а пояснения появятся справа.</p></div><span class="relationship-total">{{ allCards.length }} карточек · {{ bundles.length }} линий</span></div>
    <div class="relationship-toolbar">
      <USelect v-model="mode" :items="modes" aria-label="Тип связей" />
      <UInput v-model="query" icon="i-lucide-search" placeholder="Найти карточку, сайт или значение поля" aria-label="Поиск на графе" />
      <UButton color="neutral" variant="outline" icon="i-lucide-scan" label="Вписать карту" @click="reset" />
    </div>
    <div class="relationship-options"><UCheckbox v-model="linkedOnly" label="Только карточки со связями"/><span>{{ cards.length }} карточек на карте · {{ graph.edges.length }} связей<template v-if="isolated"> · {{ isolated }} без связей</template></span></div>
    <div class="relationship-legend"><span><i class="legend-manual"/>Подписки и ручные связи</span><span><i class="legend-title"/>Общее название</span><span><i class="legend-site"/>Общий сайт</span><span><i class="legend-field"/>Общее поле</span><span class="relationship-legend-note">Число на линии — несколько связей между карточками</span></div>
    <UAlert v-if="limited" class="m-4" color="warning" description="На карте отображается до 300 карточек. Уточните поиск или выберите отдельное хранилище." />
    <div v-if="focusOnly && selected" class="relationship-focus-bar"><UIcon name="i-lucide-focus"/><span>Окружение: <strong>{{ selected.label }}</strong></span><UButton size="xs" color="neutral" variant="outline" label="Вернуться ко всей карте" icon="i-lucide-arrow-left" @click="clearSelection"/></div>
    <div v-else-if="query.trim()" class="relationship-search-note"><UIcon name="i-lucide-search"/><span>Показаны совпадения и их связи — соседние карточки остаются на карте.</span><UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Сбросить поиск" @click="query=''"/></div>
    <div class="relationship-layout">
      <div ref="relationship-container" class="relationship-canvas">
        <svg ref="relationship-canvas" role="group" aria-label="Карта связей карточек. Выберите карточку мышью или клавишей Tab и Enter. Для масштаба используйте кнопки." />
        <div v-if="!graph.nodes.length" class="relationship-no-results"><UIcon name="i-lucide-network"/><strong>{{ query.trim() ? 'Совпадений не найдено' : 'Связей пока нет' }}</strong><p>{{ query.trim() ? 'Измените запрос или сбросьте поиск.' : 'Свяжите карточки в их настройках или покажите карточки без связей.' }}</p><UButton v-if="query.trim()" size="sm" color="neutral" variant="outline" label="Сбросить поиск" @click="query=''"/><UButton v-else-if="linkedOnly && allCards.length" size="sm" color="neutral" variant="outline" label="Показать все карточки" @click="linkedOnly=false"/></div>
        <div class="relationship-map-controls"><UButton color="neutral" variant="outline" icon="i-lucide-minus" aria-label="Уменьшить карту" @click="changeZoom(1 / 1.25)"/><span aria-live="polite">{{ zoomPercent }}%</span><UButton color="neutral" variant="outline" icon="i-lucide-plus" aria-label="Увеличить карту" @click="changeZoom(1.25)"/><UButton color="neutral" variant="outline" icon="i-lucide-scan" aria-label="Вписать всю карту" @click="reset"/></div>
        <p class="relationship-hint">Перетаскивайте карточки и фон · Ctrl / ⌘ + колесо — масштаб</p>
      </div>
      <aside class="relationship-detail" aria-label="Информация о связях">
        <template v-if="selected">
          <div class="relationship-detail-top"><span :class="['relationship-kind',selected.kind]">{{ kindLabels[selected.kind] }}</span><UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Снять выделение карточки" @click="clearSelection"/></div>
          <h2>{{ selected.label }}</h2><p v-if="selected.vaultName">{{ selected.vaultName }}</p>
          <div class="relationship-detail-actions"><UButton v-if="selectedEntry" block color="neutral" variant="outline" icon="i-lucide-arrow-up-right" label="Открыть карточку" @click="openSelected"/><UButton block :variant="focusOnly ? 'soft' : 'solid'" icon="i-lucide-focus" :label="focusOnly ? 'Показать всю карту' : 'Только эти связи'" @click="focusSelected"/></div>
          <h3>Связанные узлы <span>{{ connected.length }}</span></h3>
          <button v-for="edge in connected" :key="edge.id" class="relation-detail-item" @click="selectFromList(edge.other.id)"><span :class="['relationship-kind',edge.other.kind]">{{ kindLabels[edge.other.kind] }}</span><strong>{{ edge.other.label }}</strong><small v-if="edge.other.vaultName">{{ edge.other.vaultName }}</small><span class="relation-reasons"><span v-for="label in edge.labels" :key="label">{{ label }}</span></span></button>
          <p v-if="!connected.length" class="relationship-detail-empty">У этой карточки пока нет связей. Добавьте связь или привяжите подписку в её настройках.</p>
        </template>
        <template v-else>
          <div class="relationship-detail-intro"><span class="relationship-intro-icon"><UIcon name="i-lucide-mouse-pointer-2"/></span><h2>Что с чем связано?</h2><p>Нажмите на карточку, чтобы увидеть её подписки, ручные связи и общие значения.</p><p>Кнопка «Только эти связи» оставит на карте выбранную карточку и её окружение.</p></div>
          <h3>{{ query.trim() ? 'Результаты поиска' : 'Больше всего связей' }}</h3>
          <button v-for="card in cardList.slice(0,8)" :key="card.id" class="relation-card-option" @click="selectFromList(card.id)"><span><strong>{{ card.label }}</strong><small>{{ card.vaultName }}</small></span><span class="relation-degree">{{ degrees.get(card.id) ?? 0 }}</span></button>
          <p v-if="!cardList.length" class="relationship-detail-empty">Карточки не найдены.</p>
        </template>
        <details v-if="cardList.length" class="relationship-card-directory"><summary>Все карточки ({{ cardList.length }})</summary><button v-for="card in cardList" :key="card.id" class="relation-card-option" @click="selectFromList(card.id)"><span><strong>{{ card.label }}</strong><small>{{ card.vaultName }}</small></span><span class="relation-degree">{{ degrees.get(card.id) ?? 0 }}</span></button></details>
      </aside>
    </div>
  </section>
</template>
