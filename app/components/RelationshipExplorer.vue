<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import RelationshipGraph from './RelationshipGraph.vue'
import type { VaultSource } from '~~/shared/types/sharing'
import type { ScopedCredential } from '~~/shared/utils/vault-sources'
const StructureRelationships = defineAsyncComponent(() => import('./StructureRelationships.vue'))
defineProps<{ entries: ScopedCredential[]; sources: VaultSource[] }>()
const emit = defineEmits<{ open: [entry: ScopedCredential]; category: [key: string]; vault: [id: string] }>()
const filters = useFiltersStore()
const tabs = [{ value: 'cards', label: 'Карточки', icon: 'i-lucide-network' }, { value: 'categories', label: 'Категории', icon: 'i-lucide-folders' }, { value: 'vaults', label: 'Хранилища', icon: 'i-lucide-vault' }] as const
function onTabKey(event: KeyboardEvent, index: number) {
  let next = index
  if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
  else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
  else if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = tabs.length - 1
  else return
  event.preventDefault()
  filters.relationships.view = tabs[next]!.value
  nextTick(() => document.getElementById(`relationship-tab-${tabs[next]!.value}`)?.focus())
}
</script>
<template>
  <div class="relationship-explorer"><div class="relationship-view-tabs" role="tablist" aria-label="Виды взаимосвязей"><button v-for="(tab,index) in tabs" :id="`relationship-tab-${tab.value}`" :key="tab.value" type="button" role="tab" :tabindex="filters.relationships.view===tab.value?0:-1" @keydown="onTabKey($event,index)" :aria-selected="filters.relationships.view===tab.value" aria-controls="relationship-view-panel" :class="{selected:filters.relationships.view===tab.value}" @click="filters.relationships.view=tab.value"><UIcon :name="tab.icon"/>{{ tab.label }}</button></div><div id="relationship-view-panel" role="tabpanel" :aria-labelledby="`relationship-tab-${filters.relationships.view}`"><RelationshipGraph v-if="filters.relationships.view==='cards'" :entries="entries" @edit="emit('open',$event)"/><StructureRelationships v-else :key="filters.relationships.view" :sources="sources" :mode="filters.relationships.view" @open="emit('open',$event)" @category="emit('category',$event)" @vault="emit('vault',$event)"/></div></div>
</template>
