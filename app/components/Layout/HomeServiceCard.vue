<script setup lang="ts">
import ServiceShortcutCards from './ServiceShortcutCards.vue'
import type { HomeAppId } from '~~/shared/types/home-layout'
import { homeApps } from '~~/shared/utils/home-layout'

const props = defineProps<{ service: HomeAppId }>()
const route = useRoute()
const open = ref(false)
const app = computed(() => homeApps[props.service])
const boxedIcon = computed(() => ['spaces', 'projects', 'contracts'].includes(props.service))
const titleId = useId()

watch(() => route.fullPath, () => { open.value = false })
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ side: 'bottom', align: 'center', sideOffset: 14, collisionPadding: 16 }"
    :ui="{ content: 'home-service-popover z-[80] rounded-2xl p-5 bg-white shadow-xl' }"
  >
    <button type="button" class="password-glass password-launch-card">
      <img v-if="service === 'passwords'" src="/password.svg" alt="" width="44" height="44" />
      <span v-else-if="boxedIcon" class="projects-app-icon projects-launch-icon">
        <UIcon :name="app.icon" />
      </span>
      <UIcon v-else-if="service === 'applications'" :name="app.icon" class="size-11 shrink-0" />
      <UIcon v-else :name="app.icon" class="finance-app-icon" />
      <span>{{ app.label }}</span>
    </button>

    <template #content>
      <section class="home-service-menu" :aria-labelledby="titleId">
        <h2 :id="titleId">{{ app.label }}</h2>
        <ServiceShortcutCards v-if="open" :service="service" @choose="open = false"/>
      </section>
    </template>
  </UPopover>
</template>

<style scoped>
:global(.home-service-popover) {
  max-height: var(--reka-popover-content-available-height, calc(100vh - 32px));
  overflow-y: auto;
}

.home-service-menu {
  width: min(560px, calc(100vw - 72px));
}

.home-service-menu h2 {
  margin-bottom: 16px;
  color: #334155;
  font-size: 18px;
  font-weight: 600;
}

</style>
