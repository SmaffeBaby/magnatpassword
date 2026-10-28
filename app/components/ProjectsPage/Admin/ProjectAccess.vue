<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import UserPicker from '../../UserPicker.vue'
import PersonAvatar from '../../PersonAvatar.vue'
import type { TeamPerson } from '~~/shared/types/team'
import type { ProjectAccessUser } from '~~/shared/types/projects'
const auth = useAuthStore(), client = useQueryClient(), person = ref<TeamPerson | null>(null), busy = ref(false), error = ref('')
const users = useQuery({ queryKey: computed(() => ['account', auth.user?.id, 'admin-projects-access']), queryFn: ({ signal }) => sharedRequest<ProjectAccessUser[]>('/api/admin/projects/access', { signal }), retry: false })
async function setAccess(userId: string, enabled: boolean) {
  if (busy.value) return
  const actor = auth.user?.id
  busy.value = true; error.value = ''
  try {
    await sharedRequest('/api/admin/projects/access', { method: 'PUT', body: { userId, enabled } })
    if (auth.user?.id !== actor) return
    await Promise.all(['admin-projects-access', 'projects-access', 'projects-people', 'projects'].map(resource => client.invalidateQueries({ queryKey: ['account', actor, resource] })))
    person.value = null
  } catch (failure: any) { if (auth.user?.id === actor) error.value = failure?.data?.message || 'Не удалось изменить доступ' }
  finally { busy.value = false }
}
</script>
<template>
  <div class="project-access-admin"><div class="admin-intro"><span class="eyebrow">ПРОЕКТЫ / ДОСТУП</span><h1>Кто может работать с проектами</h1><p>Раздел на главной видят только пользователи из этого списка. Права внутри проекта назначает его создатель.</p></div>
    <UCard><h2 class="font-semibold mb-4">Выдать доступ</h2><form class="space-y-4" @submit.prevent="person && setAccess(person.id, true)"><UserPicker v-model="person" admin :disabled="busy" /><UButton type="submit" label="Выдать доступ к проектам" icon="i-lucide-user-plus" :loading="busy" :disabled="!person || users.data.value?.some(user => user.id === person?.id)" /></form><UAlert v-if="error" class="mt-4" color="error" :description="error" /></UCard>
    <UCard class="mt-6"><div class="flex justify-between items-center gap-4 mb-4"><h2 class="font-semibold">Доступ к разделу</h2><UButton label="Обновить" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="users.isFetching.value" @click="users.refetch()" /></div><UAlert v-if="users.error.value" color="error" title="Не удалось загрузить доступы" /><p v-else-if="users.isPending.value" class="text-sm text-slate-500">Загружаем…</p><p v-else-if="!users.data.value?.length" class="text-sm text-slate-500">Доступ пока никому не выдан.</p><div v-for="user in users.data.value" :key="user.id" class="project-member"><PersonAvatar :name="user.fullName || user.email" /><div class="project-member-person"><strong>{{ user.fullName || user.email }}</strong><small>{{ user.email }}</small></div><UButton label="Отозвать доступ" color="neutral" variant="outline" size="sm" :disabled="busy" @click="setAccess(user.id, false)" /></div><p class="mt-5 text-xs text-slate-400">Отзыв закрывает раздел и доступ ко всем проектам. Проекты и назначенные права сохраняются: после повторной выдачи доступа пользователь снова увидит доступные ему проекты.</p></UCard>
  </div>
</template>
