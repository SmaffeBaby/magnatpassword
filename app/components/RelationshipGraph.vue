<script setup lang="ts">
import { useRelationshipGraph } from '../composables/useRelationshipGraph'

import type { ScopedCredential } from '~~/shared/utils/vault-sources'
const props = defineProps<{ entries: ScopedCredential[] }>()
const emit = defineEmits<{ edit: [entry: ScopedCredential] }>()
const { mode, query, modes, graph, matching, selectedId, selected, selectedEntry, connected, cards, openSelected, reset } = useRelationshipGraph(props, entry => emit('edit', entry))
</script>
<template>
  <section class="relationships" aria-label="Взаимосвязь карточек">
    <div class="relationship-toolbar"><USelect v-model="mode" :items="modes" aria-label="Тип связей" /><UInput v-model="query" icon="i-lucide-search" placeholder="Название, сайт, поле или значение" aria-label="Поиск на графе" /><UButton color="neutral" variant="outline" icon="i-lucide-scan" label="Сбросить вид" @click="reset" /></div>
    <div class="relationship-legend"><span><i class="legend-card" />Карточка</span><span><i class="legend-title" />Общее название</span><span><i class="legend-site" />Общий сайт</span><span><i class="legend-field" />Общее поле</span><span><i class="legend-manual" />Ручная связь</span><span>{{ cards.length }} карточек · {{ graph.edges.length }} связей</span></div>
    <UAlert v-if="matching.length > 300" class="mb-4" color="warning" description="Показаны первые 300 карточек. Уточните поиск или выберите отдельное хранилище." />
    <div class="relationship-layout">
      <div ref="relationship-container" class="relationship-canvas"><svg ref="relationship-canvas" role="img" aria-label="Граф связей. Масштабируйте колесом или жестом, перемещайте узлы мышью." /><div v-if="!cards.length" class="relationship-no-results">Карточки не найдены. Добавьте пароль или измените поиск.</div><p class="relationship-hint">Перетаскивайте узлы · Колесо и жесты — масштаб · Нажмите на узел</p></div>
      <aside class="relationship-detail">
        <template v-if="selected"><span class="eyebrow">{{ selected.kind === 'card' ? 'КАРТОЧКА' : selected.kind === 'title' ? 'ОБЩЕЕ НАЗВАНИЕ' : selected.kind === 'field' ? 'ОБЩЕЕ ПОЛЕ' : 'ОБЩИЙ САЙТ' }}</span><h2>{{ selected.label }}</h2><p v-if="selected.vaultName">{{ selected.vaultName }}</p><UButton v-if="selectedEntry" class="my-4" block icon="i-lucide-pencil" label="Изменить и связать" @click="openSelected" /><h3>Связанные узлы</h3><button v-for="edge in connected" :key="edge.id" class="relation-detail-item" @click="selectedId = edge.other.id"><strong>{{ edge.other.label }}</strong><small>{{ edge.label }}</small></button><p v-if="!connected.length">Связей пока нет. Добавьте ручную связь в карточке.</p></template>
        <template v-else><h2>Взаимосвязь</h2><p>Карточки объединяются по названиям, сайтам и одинаковым дополнительным полям, например «Хостинг: TimeWeb». Выберите узел на графе. Ручные связи и дополнительные поля настраиваются в редакторе карточки.</p></template>
        <details class="mt-5"><summary>Карточки на графе ({{ cards.length }})</summary><button v-for="card in cards" :key="card.id" class="relation-detail-item" @click="selectedId = card.id"><strong>{{ card.label }}</strong><small>{{ card.vaultName }}</small></button></details>
      </aside>
    </div>
  </section>
</template>
