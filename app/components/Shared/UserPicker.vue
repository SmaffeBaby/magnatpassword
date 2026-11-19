<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import PersonAvatar from '~/components/Shared/PersonAvatar.vue'
import { normalizePeopleQuery } from '~~/shared/utils/team'
import type { TeamPerson } from '~~/shared/types/team'

const person = defineModel<TeamPerson | null>({ default: null })
const props = defineProps<{ disabled?: boolean; admin?: boolean; projects?: boolean; projectId?: string }>()
const auth = useAuthStore()
const query = ref(''), debounced = ref(''), expanded = ref(true), page = ref(1)
const listId = useId()
let timer: ReturnType<typeof setTimeout> | undefined
watch(query, value => {
  clearTimeout(timer)
  expanded.value = true
  timer = setTimeout(() => {
    page.value = 1
    debounced.value = normalizePeopleQuery(value)
  }, 300)
})
const scope = computed(() => props.admin ? 'admin-team-search' : props.projects ? 'projects-people' : 'team-search')
const showResults = computed(() => !!props.projectId || debounced.value.length >= 2)
const search = useQuery({
  queryKey: computed(() => props.projectId
    ? ['account', auth.user?.id, 'projects', 'member-candidates', props.projectId, debounced.value, page.value]
    : ['account', auth.user?.id, scope.value, debounced.value]),
  queryFn: async ({ signal }) => {
    const q = encodeURIComponent(debounced.value)
    if (props.projectId) {
      return sharedRequest<{ people: TeamPerson[]; hasMore: boolean }>(`/api/projects/${props.projectId}/member-candidates?q=${q}&page=${page.value}`, { signal })
    }
    const path = props.admin ? '/api/admin/team/search' : props.projects ? '/api/projects/people' : '/api/team/search'
    return { people: await sharedRequest<TeamPerson[]>(`${path}?q=${q}`, { signal }), hasMore: false }
  },
  enabled: computed(() => !!auth.user && !person.value && showResults.value),
  staleTime: 30000
})
const results = computed(() => search.data.value?.people ?? [])
function choose(value: TeamPerson) { person.value = value; expanded.value = false }
function clear() {
  person.value = null
  clearTimeout(timer)
  query.value = ''
  debounced.value = ''
  page.value = 1
  expanded.value = true
}
watch(person, (value, previous) => { if (!value && previous) clear() })
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <div class="user-picker">
    <div v-if="person" class="user-picker-selected">
      <PersonAvatar :name="person.fullName || person.email" :src="person.avatarUrl" />
      <span><strong>{{ person.fullName || person.email }}<span v-if="person.isHidden" class="team-hidden-badge">Скрыт</span></strong><small>{{ person.workEmail || person.email }}<template v-if="person.telegram"> · @{{ person.telegram }}</template></small></span>
      <UButton type="button" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Убрать выбранного участника" :disabled="disabled" @click="clear" />
    </div>
    <template v-else>
      <UInput v-model="query" class="w-full" icon="i-lucide-search" placeholder="ФИО, email или @telegram" aria-label="Поиск участников" :maxlength="120" :disabled="disabled" :loading="search.isFetching.value" role="combobox" :aria-expanded="expanded && showResults" :aria-controls="expanded && showResults ? listId : undefined" aria-autocomplete="list" @focus="expanded = true" @keydown.esc.stop="expanded = false" @keydown.down.prevent="($event.currentTarget as HTMLElement).closest('.user-picker')?.querySelector<HTMLButtonElement>('.user-picker-option:not(:disabled)')?.focus()" />
      <template v-if="expanded && showResults">
        <div :id="listId" class="user-picker-results" role="listbox" aria-label="Доступные пользователи" :aria-busy="search.isFetching.value">
          <button v-for="result in results" :key="result.id" type="button" role="option" :aria-selected="false" class="user-picker-option" :disabled="disabled" @click="choose(result)">
            <PersonAvatar :name="result.fullName || result.email" :src="result.avatarUrl" />
            <span><strong>{{ result.fullName || result.email }}<span v-if="result.isHidden" class="team-hidden-badge">Скрыт</span></strong><small>{{ result.workEmail || result.email }}<template v-if="result.telegram"> · @{{ result.telegram }}</template></small></span>
          </button>
          <p v-if="search.error.value">Не удалось загрузить пользователей. <button type="button" class="underline" @click="search.refetch()">Повторить</button></p>
          <p v-else-if="search.isFetching.value && !results.length">Загружаем пользователей…</p>
          <p v-else-if="!results.length">{{ projectId ? 'Нет пользователей, которых можно добавить.' : projects ? 'Участники с доступом к проектам не найдены.' : 'Зарегистрированные участники не найдены.' }}</p>
        </div>
        <div v-if="projectId && (page > 1 || search.data.value?.hasMore)" class="mt-2 flex items-center justify-between gap-2">
          <UButton type="button" label="Назад" color="neutral" variant="ghost" :disabled="disabled || page === 1 || search.isFetching.value" @click="page--" />
          <span class="text-xs text-muted">Страница {{ page }}</span>
          <UButton type="button" label="Далее" color="neutral" variant="ghost" :disabled="disabled || !search.data.value?.hasMore || search.isFetching.value" @click="page++" />
        </div>
      </template>
    </template>
  </div>
</template>
