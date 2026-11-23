<script setup lang="ts">
import BrandLogo from '~/components/Brand/BrandLogo.vue'
import { meetingRoomView, meetingRoomViews } from './home-service-links'

const emit = defineEmits<{ navigate: [] }>()
const route = useRoute()
const view = computed(() => meetingRoomView(route.query.view))
</script>

<template>
  <div class="flex min-h-full flex-col gap-6 px-4 py-7">
    <BrandLogo />
    <nav class="grid gap-1" aria-label="Расписание переговорной">
      <NuxtLink v-for="item in meetingRoomViews" :key="item.view" :to="item.to"
        :aria-current="view === item.view ? 'page' : undefined"
        class="meeting-room-link" @click="emit('navigate')">
        <UIcon :name="item.icon" class="size-[19px] shrink-0" />
        {{ item.label }}
      </NuxtLink>
    </nav>
    <div class="mt-auto border-t border-default pt-4">
      <NuxtLink to="/" class="meeting-room-link" @click="emit('navigate')">
        <UIcon name="i-lucide-arrow-left" class="size-[19px] shrink-0" />
        К приложениям
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.meeting-room-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  color: var(--ui-text-muted);
  font-size: 13px;
}

.meeting-room-link:hover,
.meeting-room-link[aria-current='page'] {
  background: #f1f3f8;
  color: var(--ui-primary);
}
</style>
