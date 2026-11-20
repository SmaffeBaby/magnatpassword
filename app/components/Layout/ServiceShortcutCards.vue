<script setup lang="ts">
import { NuxtLink } from '#components'
import EditorCard from '~/components/Editors/EditorCard.vue'
import { useSpacesDirectory } from '~/composables/projects/useSpacesDirectory'
import type { HomeAppId } from '~~/shared/types/home-layout'
import { documentEditors } from '~~/shared/utils/project-documents'
import { homeServiceLinks, type HomeServiceLink } from './home-service-links'

const props = defineProps<{ service: HomeAppId; inTabs?: boolean }>()
const emit = defineEmits<{ choose: [path: string] }>()
const spaces = useSpacesDirectory(() => props.service === 'spaces')

const links = computed<HomeServiceLink[]>(() => {
  if (props.service === 'applications') return []
  const sections = homeServiceLinks[props.service]
  const projects = spaces?.data.value
  if (props.service !== 'spaces' || !projects) return sections

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

</script>

<template>
  <div class="home-service-menu-grid">
    <template v-if="service === 'applications'">
      <template v-for="editor in documentEditors" :key="editor.key">
        <button v-if="inTabs" type="button" class="password-glass" @click="emit('choose', `/office/${editor.key}`)">
          <img :src="`/editor-icons/${editor.key}.ico`" alt=""/><span>{{editor.label}}</span>
        </button>
        <EditorCard v-else :editor="editor.key" @click="emit('choose', `/office/${editor.key}`)" />
      </template>
    </template>
    <component
      :is="inTabs ? 'button' : NuxtLink"
      v-for="link in links"
      :key="link.to"
      v-bind="inTabs ? { type: 'button' } : { to: link.to }"
      class="password-glass home-service-link"
      @click="emit('choose', link.to)"
    >
      <UIcon :name="link.icon" class="home-service-link-icon" />
      <span class="home-service-link-text">
        {{link.label}}
        <small v-if="link.description">{{link.description}}</small>
      </span>
    </component>
  </div>
</template>

<style scoped>
.home-service-menu-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.home-service-menu-grid :deep(a),
.home-service-menu-grid > button {
  justify-content: center;
  text-align: left;
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
