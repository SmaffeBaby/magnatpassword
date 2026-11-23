<script setup lang="ts">
import PersonAvatar from '~/components/Shared/PersonAvatar.vue'
import type { MeetingRoomPerson } from '~~/shared/types/meeting-room'

defineProps<{ person: MeetingRoomPerson | null }>()
</script>

<template>
  <span class="organizer">
    <PersonAvatar v-if="person" :name="person.name" :src="person.avatarUrl" />
    <span>{{ person?.name || 'Организатор недоступен' }}</span>
  </span>
</template>

<style scoped>
.organizer{display:inline-flex;align-items:center;gap:6px;min-width:0;color:var(--ui-text-muted);font-size:12px;line-height:1.35;overflow-wrap:anywhere;white-space:normal}
.organizer :deep(.person-avatar){width:22px;height:22px;font-size:9px;border-radius:50%}
</style>
