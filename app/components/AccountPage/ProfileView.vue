<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { svgImageUrl } from '~~/shared/utils/media'
import PersonAvatar from '~/components/Shared/PersonAvatar.vue'
import ProfileActivity from './ProfileActivity.vue'
import ProfileScore from './ProfileScore.vue'
import type { ProfileWorkState, TeamProfile, TeamProfileOverview } from '~~/shared/types/team'
import { MAX_AVATAR_BYTES,unitLabel,vaultRoleLabel } from '~~/shared/utils/team'
const props=defineProps<{userId?:string}>()
const auth=useAuthStore(),team=useTeamStore(),profile=ref<TeamProfile|null>(null),loading=ref(false),error=ref('')
const mine=computed(()=>!props.userId||props.userId===auth.user?.id)
const draft=reactive({fullName:'',workEmail:'',telegram:''})
const scores = reactive<Pick<ProfileWorkState, 'workload' | 'mood'>>({ workload: null, mood: null })
const statusOpen = ref(false), customStatus = ref('')
const statuses = [
  { label: 'На удалёнке', icon: 'i-lucide-house' },
  { label: 'Занят', icon: 'i-lucide-circle-minus' },
  { label: 'На больничном', icon: 'i-lucide-heart-pulse' },
  { label: 'В отпуске', icon: 'i-lucide-palmtree' },
  { label: 'В офисе', icon: 'i-lucide-building-2' },
  { label: 'На встрече', icon: 'i-lucide-users' }
]
const workloadEmojis = ['🪶', '🌱', '☕', '📝', '💼', '📋', '📚', '⏳', '🔥', '🚨']
const moodEmojis = ['😭', '😢', '😞', '🙁', '😐', '🙂', '😊', '😄', '😁', '🤩']
const status = computed(() => profile.value?.workState.status)
const statusIcon = computed(() => statuses.find(item => item.label === status.value)?.icon ?? 'i-lucide-message-circle')
const scoreChanges = computed(() => ({
  ...(scores.workload !== profile.value?.workState.workload ? { workload: scores.workload } : {}),
  ...(scores.mood !== profile.value?.workState.mood ? { mood: scores.mood } : {})
}))
let sequence=0
async function load(){const current=++sequence;loading.value=true;error.value='';try{const result=await team.profile(props.userId,true);if(current!==sequence)return;if(profile.value?.person.id!==result.person.id){scores.workload=result.workState.workload;scores.mood=result.workState.mood}profile.value=result;Object.assign(draft,{fullName:result.person.fullName,workEmail:result.person.workEmail,telegram:result.person.telegram})}catch(failure:any){if(current===sequence)error.value=failure?.data?.message||'Профиль недоступен'}finally{if(current===sequence)loading.value=false}}
watch(() => props.userId, () => { profile.value = null; statusOpen.value = false; void load() }, { immediate: true })
const profileId = computed(() => profile.value?.person.id)
const overview = useQuery({
  queryKey: computed(() => ['account', auth.user?.id, 'profile-overview', profileId.value] as const),
  queryFn: ({ signal, queryKey }) => sharedRequest<TeamProfileOverview>(`/api/team/${queryKey[3]}/overview`, { signal }),
  enabled: computed(() => !!auth.user && !!profileId.value),
  refetchInterval: 30_000,
  retry: false
})
const overviewData = computed(() => overview.data.value)
const seenDate = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' })
async function save(){if(await team.save({...draft,workEmail:draft.workEmail.trim(),telegram:draft.telegram.trim()}))await load()}
async function saveWorkState(changes: Partial<ProfileWorkState>) {
  const id = profileId.value
  if (!id || !mine.value || team.busy) return false
  if (!await team.saveWorkState(changes) || profileId.value !== id || team.me?.person.id !== id) return false
  profile.value = team.me
  return true
}

async function saveStatus(value: string | null) {
  if (await saveWorkState({ status: value })) statusOpen.value = false
}

function openStatus(open: boolean) {
  if (open) customStatus.value = status.value ?? ''
  statusOpen.value = open
}

async function upload(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;error.value='';if(file.size>MAX_AVATAR_BYTES){error.value='Максимальный размер аватара — 2 МБ';return}if(!['image/png','image/jpeg','image/webp'].includes(file.type)){error.value='Выберите PNG, JPEG или WebP';return}if(await team.avatar(file))await load()}
async function removeAvatar(){if(await team.removeAvatar())await load()}
onBeforeUnmount(()=>{sequence++})
</script>
<template><div class="profile-page"><div class="team-page-heading"><div><h1>{{ mine?'Мой профиль':'Профиль участника' }}</h1><p>{{ mine?'Контакты и ваше место в команде.':'Контакты, должности и общие с вами рабочие пространства.' }}</p></div><div class="flex flex-wrap gap-2"><UButton v-if="mine" to="/settings/account" color="neutral" variant="outline" icon="i-lucide-settings" label="Настройки аккаунта"/><UButton to="/team" color="neutral" variant="outline" icon="i-lucide-users" label="Команда"/></div></div><UAlert v-if="error||team.error" color="error" :description="error||team.error" class="mb-5"/><p v-if="loading&&!profile" class="team-empty">Загружаем профиль…</p><template v-if="profile"><div class="profile-grid"><section class="profile-identity"><PersonAvatar :name="profile!.person.fullName||profile!.person.email" :src="profile!.person.avatarUrl" large/><h2>{{ profile!.person.fullName||profile!.person.email }}</h2><UPopover v-if="mine" :open="statusOpen" @update:open="openStatus">
  <UButton type="button" class="max-w-full" color="neutral" variant="subtle" :icon="status ? statusIcon : 'i-lucide-plus'" :label="status || 'Установить статус'" :aria-label="status ? `Изменить статус: ${status}` : 'Установить статус'" :disabled="team.busy" :ui="{ label: 'truncate' }"/>
  <template #content>
    <div class="w-72 max-w-[calc(100vw-2rem)] space-y-3 p-3" aria-label="Рабочий статус">
      <div class="grid grid-cols-2 gap-1">
        <UButton v-for="item in statuses" :key="item.label" type="button" color="neutral" :variant="status === item.label ? 'soft' : 'ghost'" size="sm" :icon="item.icon" :label="item.label" :disabled="team.busy" @click="saveStatus(item.label)"/>
      </div>
      <form class="flex gap-2" @submit.prevent="saveStatus(customStatus.trim())">
        <UInput v-model="customStatus" class="min-w-0 flex-1" aria-label="Свой статус" placeholder="Свой статус" :maxlength="60" :disabled="team.busy"/>
        <UButton type="submit" icon="i-lucide-check" aria-label="Сохранить статус" :loading="team.busy" :disabled="!customStatus.trim()"/>
      </form>
      <UButton v-if="status" type="button" color="neutral" variant="ghost" size="sm" icon="i-lucide-x" label="Удалить статус" :disabled="team.busy" @click="saveStatus(null)"/>
      <p v-if="team.error" class="text-sm text-error" role="alert">{{ team.error }}</p>
    </div>
  </template>
</UPopover>
<span v-else-if="status" class="inline-flex max-w-full items-center gap-2 break-all rounded-lg bg-elevated px-3 py-1 text-sm text-default"><UIcon :name="statusIcon" class="shrink-0"/>{{ status }}</span>
<p v-if="overviewData?.online" class="profile-presence is-online">В сети</p><p v-else-if="overviewData?.lastSeenAt" class="profile-presence">Последний раз в сети <time :datetime="overviewData.lastSeenAt">{{ seenDate.format(new Date(overviewData.lastSeenAt)) }}</time></p><p v-else-if="overview.isSuccess.value" class="profile-presence">Время последней активности неизвестно</p><p>Бренд аккаунта: {{ profile!.person.brand==='light'?'Light':'Magnat' }}</p><template v-if="mine"><SharedFileUpload :label=" team.busy?'Загрузка…':'Загрузить аватар' " accept="image/png,image/jpeg,image/webp" :disabled="team.busy" @change="upload"/><small>PNG, JPEG, WebP · до 2 МБ</small><UButton v-if="profile!.person.avatarUrl" color="neutral" variant="ghost" size="xs" label="Удалить аватар" :loading="team.busy" @click="removeAvatar"/></template><div class="profile-positions"><span v-for="id in profile!.person.roleIds" :key="id">{{ unitLabel(id,profile!.units) }}</span><span v-if="!profile!.person.roleIds.length">Отдел и должность пока не назначены</span></div></section><section class="profile-information"><form v-if="mine" class="space-y-5" @submit.prevent="save"><UFormField label="ФИО" required><UInput v-model="draft.fullName" class="w-full" :maxlength="120" required placeholder="Имя Фамилия"/></UFormField><UFormField label="Рабочая почта"><UInput v-model="draft.workEmail" type="email" class="w-full" :maxlength="254" placeholder="name@company.ru"/></UFormField><UFormField label="Telegram"><UInput v-model="draft.telegram" class="w-full" :maxlength="120" placeholder="@username или https://t.me/username"/></UFormField><UFormField label="Компания, отдел и должность"><div class="profile-assigned-roles"><span v-for="id in profile!.person.roleIds" :key="id">{{ unitLabel(id,profile!.units) }}</span><p v-if="!profile!.person.roleIds.length">Должность пока не назначена.</p></div></UFormField><UFormField label="Почта для входа"><UInput :model-value="profile!.person.email" disabled class="w-full"/></UFormField><UButton type="submit" label="Сохранить профиль" icon="i-lucide-check" :loading="team.busy"/></form><template v-else><h2>Контакты</h2><a v-if="profile!.person.workEmail" :href="`mailto:${profile!.person.workEmail}`" class="profile-contact"><UIcon name="i-lucide-mail"/>{{ profile!.person.workEmail }}</a><a v-if="profile!.person.telegram" :href="`https://t.me/${profile!.person.telegram}`" target="_blank" rel="noopener noreferrer" class="profile-contact"><UIcon name="i-lucide-send"/>@{{ profile!.person.telegram }}</a><p v-if="!profile!.person.workEmail&&!profile!.person.telegram">Рабочие контакты ещё не указаны.</p><UButton v-if="mine" to="/profile" label="Редактировать профиль"/></template></section></div><section v-if="mine || scores.workload !== null || scores.mood !== null" class="profile-common" aria-labelledby="profile-work-state-title">
  <h2 id="profile-work-state-title">Рабочее состояние</h2>
  <form class="space-y-4" @submit.prevent="saveWorkState(scoreChanges)">
    <div class="grid gap-4 sm:grid-cols-2">
      <ProfileScore v-model="scores.workload" label="Уровень загруженности" :emojis="workloadEmojis" :editable="mine" :busy="team.busy"/>
      <ProfileScore v-model="scores.mood" label="Настроение" :emojis="moodEmojis" :editable="mine" :busy="team.busy"/>
    </div>
    <UButton v-if="mine" type="submit" icon="i-lucide-check" label="Сохранить оценки" :loading="team.busy" :disabled="!Object.keys(scoreChanges).length"/>
  </form>
</section>
<section class="profile-common profile-projects" aria-labelledby="profile-projects-title">
  <h2 id="profile-projects-title">Проекты</h2>
  <UAlert v-if="overview.error.value" color="error" title="Не удалось загрузить сведения профиля" :actions="[{ label: 'Повторить', onClick: () => overview.refetch() }]"/>
  <p v-else-if="overview.isPending.value">Загружаем проекты…</p>
  <ul v-else-if="overviewData?.projects.length" class="profile-vaults">
    <li v-for="(project, index) in overviewData.projects" :key="project.id ?? `${index}:${project.name}`">
      <NuxtLink v-if="project.id" :to="`/projects/${project.id}`" class="profile-vault profile-project">
        <UIcon name="i-lucide-folder-kanban"/><strong>{{ project.name }}</strong><UIcon name="i-lucide-arrow-up-right"/>
      </NuxtLink>
      <div v-else class="profile-vault profile-project is-unavailable">
        <UIcon name="i-lucide-folder-kanban"/><span><strong>{{ project.name }}</strong><small>Нет доступа</small></span><UIcon name="i-lucide-lock"/>
      </div>
    </li>
  </ul>
  <p v-else>Проектов пока нет.</p>
</section>
<ProfileActivity :user-id="profile!.person.id" :brand="profile!.person.brand"/><section class="profile-common"><h2>{{ mine?'Мои хранилища':'Общие с вами хранилища' }}</h2><div class="profile-vaults"><NuxtLink v-for="item in profile!.commonVaults" :key="item.id" to="/password" class="profile-vault" @click="useFiltersStore().workspaceId=item.id"><img v-if="item.svg" :src="svgImageUrl(item.svg)" class="vault-display-image" alt=""/><UIcon v-else name="i-lucide-vault"/><span><strong>{{ item.name }}</strong><small>{{ item.owner?'Владелец':vaultRoleLabel(item.role) }}</small></span><UIcon name="i-lucide-arrow-up-right"/></NuxtLink></div><p v-if="!profile!.commonVaults.length">Общих хранилищ пока нет.</p><h2 class="mt-6">{{ mine?'Мои группы':'Общие группы' }}</h2><div class="profile-common-units"><span v-for="id in profile!.commonUnits" :key="id">{{ unitLabel(id,profile!.units) }}</span></div><p v-if="!profile!.commonUnits.length">Совпадающих компаний, отделов и должностей пока нет.</p></section></template></div></template>

<style scoped>
.profile-identity .profile-presence { color: #566980; margin-top: 6px; }
.profile-identity .profile-presence.is-online { color: #147354; font-weight: 600; }
.profile-project { height: 100%; }
.profile-project > strong { flex: 1; overflow-wrap: anywhere; }
.profile-project.is-unavailable { background: #f7f9fc; color: #64748b; }
.profile-project.is-unavailable strong { color: #566980; }
</style>
