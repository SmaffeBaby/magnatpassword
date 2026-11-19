<script setup lang="ts">
import type { ProjectRole } from '~~/shared/types/projects'
import { builtInProjectRoleIdSchema, projectPermissionOptions, projectSections, type ProjectSection } from '~~/shared/utils/project-permissions'

const props = defineProps<{ roles: ProjectRole[]; busy: boolean }>()
const emit = defineEmits<{ save: [role: Omit<ProjectRole, 'id'> & { id?: string }, done: () => void] }>()
const active = ref('')
const draft = ref<(Omit<ProjectRole, 'id'> & { id?: string }) | null>(null)
const options = computed(() => props.roles.map(role => ({ label: role.name, value: role.id })))
const activeRole = computed(() => props.roles.find(role => role.id === active.value))
const sectionOptions = [{ label: 'Как в проекте', value: 'inherit' }, ...projectPermissionOptions]
const permissionLabel = (value: ProjectRole['permission']) => projectPermissionOptions.find(item => item.value === value)?.label
function edit(role?: ProjectRole) {
  draft.value = role
    ? { ...role, sections: { ...role.sections } }
    : { name: '', permission: 'viewer', sections: {} }
}
function setSection(key: ProjectSection, value: string) {
  if (!draft.value) return
  if (value === 'inherit') delete draft.value.sections[key]
  else draft.value.sections[key] = value as ProjectRole['permission']
}
function save() {
  if (draft.value?.name.trim()) emit('save', draft.value, () => { draft.value = null })
}
watch(active, () => { draft.value = null })
</script>

<template>
  <section class="mt-6 space-y-3 border-t border-default pt-6" aria-label="Роли проекта">
    <h3 class="text-sm font-semibold">Роли проекта</h3>
    <p class="text-xs text-muted">Права роли применяются ко всем участникам, которым она назначена.</p>
    <div class="flex flex-wrap items-center gap-2">
      <USelect v-model="active" :items="options" placeholder="Выберите роль" aria-label="Роли проекта" :disabled="busy" />
      <UButton v-if="activeRole && !builtInProjectRoleIdSchema.safeParse(activeRole.id).success" label="Редактировать роль" color="neutral" variant="outline" :disabled="busy" @click="edit(activeRole)" />
      <UButton label="Создать роль" icon="i-lucide-plus" color="neutral" variant="outline" :disabled="busy" @click="edit()" />
    </div>
    <div v-if="activeRole && !draft" class="grid gap-2 rounded-lg border border-default p-3 text-xs sm:grid-cols-2">
      <p>Проект — {{ permissionLabel(activeRole.permission) }}</p>
      <p v-for="section in projectSections" :key="section.key">{{ section.label }} — {{ permissionLabel(activeRole.permission === 'hidden' ? 'hidden' : activeRole.sections[section.key] ?? activeRole.permission) }}</p>
      <p v-if="activeRole.id === 'administrator'" class="text-muted sm:col-span-2">Может добавлять участников и настраивать свои роли проекта.</p>
    </div>
    <form v-if="draft" class="space-y-3 rounded-lg border border-default p-3" @submit.prevent="save">
      <UFormField label="Название роли" required><UInput v-model="draft.name" class="w-full" required :maxlength="80" :disabled="busy" /></UFormField>
      <div class="grid gap-3 sm:grid-cols-2">
        <UFormField label="Доступ к проекту"><USelect v-model="draft.permission" :items="projectPermissionOptions" class="w-full" :disabled="busy" /></UFormField>
        <UFormField v-for="section in projectSections" :key="section.key" :label="section.label">
          <USelect :model-value="draft.sections[section.key] ?? 'inherit'" :items="sectionOptions" class="w-full" :disabled="busy || draft.permission === 'hidden'" @update:model-value="value => setSection(section.key, value)" />
        </UFormField>
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton type="submit" label="Сохранить роль" :loading="busy" :disabled="!draft.name.trim()" />
        <UButton type="button" label="Отмена" color="neutral" variant="ghost" :disabled="busy" @click="draft = null" />
      </div>
    </form>
  </section>
</template>
