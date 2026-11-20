<script setup lang="ts">
import EditorCard from '~/components/Editors/EditorCard.vue'
import { useSpacesDirectory } from '~/composables/projects/useSpacesDirectory'
import type { HomeAppId } from '~~/shared/types/home-layout'
import { homeApps } from '~~/shared/utils/home-layout'
import { documentEditors } from '~~/shared/utils/project-documents'
import { homeServiceLinks, type HomeServiceLink } from './home-service-links'

const props = defineProps<{ service: HomeAppId }>()
const route = useRoute()
const open = ref(false)
const app = computed(() => homeApps[props.service])
const boxedIcon = computed(() => ['spaces', 'projects', 'contracts'].includes(props.service))
const titleId = useId()
const spaces = props.service === 'spaces' ? useSpacesDirectory(open) : undefined

const links = computed<HomeServiceLink[]>(() => {
  if (props.service === 'applications') return []
  const sections = homeServiceLinks[props.service]
  const projects = spaces?.data.value
  if (!projects) return sections

  const recent = projects
    .flatMap(project => project.spaces.map(space => ({ project, space })))
    .sort((a, b) => Date.parse(b.space.updated_at) - Date.parse(a.space.updated_at))
    .slice(0, 5)
    .map(({ project, space }) => ({
      to: `/projects/${project.id}/spaces?space=${space.id}`,
      label: space.name,
      description: project.name,
      icon: 'i-lucide-orbit'
    }))
  return [...sections, ...recent]
})

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
        <div class="home-service-menu-grid">
          <template v-if="service === 'applications'">
            <EditorCard v-for="editor in documentEditors" :key="editor.key" :editor="editor.key" @click="open = false" />
          </template>
          <template v-else>
            <NuxtLink
              v-for="link in links"
              :key="link.to"
              :to="link.to"
              class="password-glass home-service-link"
              @click="open = false"
            >
              <UIcon :name="link.icon" class="home-service-link-icon" />
              <span class="home-service-link-text">
                {{ link.label }}
                <small v-if="link.description">{{ link.description }}</small>
              </span>
            </NuxtLink>
          </template>
        </div>
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

.home-service-menu-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.home-service-menu-grid :deep(a) {
  gap: 12px;
  min-width: 0;
  min-height: 72px;
  padding: 16px;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  color: #475569;
  font-size: 16px;
}

.home-service-menu-grid :deep(img) {
  width: 40px;
  height: 40px;
}

.home-service-link-icon {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  color: var(--ui-primary);
}

.home-service-link-text {
  min-width: 0;
  overflow-wrap: anywhere;
}

.home-service-link-text small {
  display: block;
  color: #64748b;
  font-size: 12px;
  font-weight: 400;
}

@media (max-width: 420px) {
  .home-service-menu-grid {
    grid-template-columns: 1fr;
  }
}
</style>
