<script setup lang="ts">
import type { Project, ProjectMember, ProjectPermission } from '~~/shared/types/projects'
import { projectSections, type ProjectSection, type ProjectSectionPermissions } from '~~/shared/utils/project-permissions'

const props = defineProps<{ project: Project; busy: boolean }>()
const emit = defineEmits<{ change: [member: ProjectMember, sections: ProjectSectionPermissions] }>()
const members = computed(() => props.project.members.filter(member => member.permission !== 'owner' && !member.projectRoleId))
const labels = { viewer: 'Просмотр', editor: 'Редактирование', hidden: 'Не показывать', owner: 'Владелец' }
function options(member: ProjectMember) {
  return [
    { label: `Как в проекте · ${labels[member.permission]}`, value: 'inherit' },
    { label: 'Не показывать', value: 'hidden' },
    { label: 'Просмотр', value: 'viewer' },
    { label: 'Редактирование', value: 'editor' }
  ]
}
function change(member: ProjectMember, key: ProjectSection, permission: string) {
  const sections = { ...member.sections }
  if (permission === 'inherit') delete sections[key]
  else sections[key] = permission as ProjectPermission
  emit('change', member, sections)
}
</script>

<template>
  <section v-if="project.permission === 'owner' && members.length" class="member-sections" aria-label="Индивидуальный доступ к разделам">
    <h3>Индивидуальный доступ к разделам</h3>
    <p>Эти права действуют до назначения роли участнику.</p>
    <div v-for="member in members" :key="member.userId" class="member-section-row">
      <strong>{{ member.fullName || member.email }}</strong>
      <p v-if="member.permission === 'hidden'">Проект скрыт от участника. Чтобы открыть отдельные разделы, сначала разрешите доступ к проекту.</p>
      <div v-else class="member-section-fields">
        <UFormField v-for="section in projectSections" :key="section.key" :label="section.label">
          <USelect :model-value="member.sections?.[section.key] ?? 'inherit'" :items="options(member)" :disabled="busy" :aria-label="`${section.label}: ${member.fullName || member.email}`" class="w-full" @update:model-value="value => change(member, section.key, String(value))" />
        </UFormField>
      </div>
    </div>
  </section>
</template>

<style scoped>
.member-sections{border-top:1px solid #e2e8f0;padding-top:24px;margin-top:24px}.member-sections h3{font-size:14px;font-weight:600}.member-sections p{font-size:12px;line-height:1.7;color:#8292a8;margin-top:10px}.member-section-row{margin-top:20px}.member-section-row>strong{font-size:13px}.member-section-fields{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}@media(max-width:500px){.member-section-fields{grid-template-columns:1fr}}
</style>
