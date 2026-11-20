<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

const props = defineProps<{ to: RouteLocationRaw; tabLabel?: string }>()
const tabs = useServiceTabsStore()
function follow(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  void tabs.open(props.to, props.tabLabel)
}
</script>

<template>
  <NuxtLink :to="to" custom v-slot="{ href }"><a :href="href ?? undefined" @click="follow"><slot/></a></NuxtLink>
</template>
