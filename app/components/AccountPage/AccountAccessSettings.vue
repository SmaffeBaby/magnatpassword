<script setup lang="ts">
import { logoutOptions } from '~/utils/account-access'

const auth = useAuthStore(), team = useTeamStore()
const rememberPassword = ref(false), logoutMinutes = ref(5), saved = ref(false)
watch(() => [auth.user?.id, auth.accessSettings.rememberPassword, auth.accessSettings.logoutMinutes], () => {
  rememberPassword.value = auth.accessSettings.rememberPassword
  logoutMinutes.value = auth.accessSettings.logoutMinutes
}, { immediate: true })
watch([rememberPassword, logoutMinutes], () => { saved.value = false })
async function save() {
  saved.value = false
  if (!await auth.saveAccessSettings(rememberPassword.value, logoutMinutes.value)) return
  const person = team.me?.person
  if (person && person.id === auth.user?.id) await auth.updateSavedProfile(person.id, person.fullName, person.avatarUrl)
  saved.value = true
}
</script>

<template>
  <UCard class="my-6">
    <template #header><h2 class="font-semibold">Вход и выход из аккаунта</h2><p class="mt-1 text-sm text-slate-500">Общие настройки аккаунта на всех устройствах.</p></template>
    <form class="max-w-xl space-y-5" @submit.prevent="save">
      <USwitch v-model="rememberPassword" label="Сохранить пароль" description="Входите по клику на свою плашку. Сохраняется сессия аккаунта; вводить пароль повторно не потребуется, пока она действует." :disabled="auth.pending" />
      <p v-if="rememberPassword" class="text-xs text-slate-500">После выхода плашка позволит войти снова без пароля. Отключите эту настройку, чтобы снова требовать пароль при входе.</p>
      <UFormField label="Автоматически выходить из аккаунта" description="Через выбранное время бездействия на каждом устройстве. «Никогда» отключает автоматический выход на всех устройствах.">
        <USelect v-model="logoutMinutes" :items="logoutOptions" class="w-full" :disabled="auth.pending" aria-label="Время автоматического выхода" />
      </UFormField>
      <UAlert v-if="auth.error || auth.storageError" color="error" :description="auth.error || auth.storageError" />
      <p v-if="saved" role="status" class="text-sm text-emerald-600">Настройки входа сохранены.</p>
      <UButton type="submit" label="Сохранить настройки входа" icon="i-lucide-check" :loading="auth.pending" />
    </form>
  </UCard>
</template>
