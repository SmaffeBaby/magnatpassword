<script setup lang="ts">
import { isNativeShell } from '~/utils/native-shell'
import BrandLogo from './BrandLogo.vue'
import PersonAvatar from './PersonAvatar.vue'
import QrLogin from './QrLogin.vue'
import { useAuthGate } from '../composables/useAuthGate'

const native = ref(false)
onMounted(() => { native.value = isNativeShell() })
const props = defineProps<{ admin?: boolean }>()
const route = useRoute()
const desktop = ref(false)
let desktopMedia: MediaQueryList | undefined
const updateDesktop = () => { desktop.value = desktopMedia?.matches ?? false }
onMounted(() => { desktopMedia = window.matchMedia('(min-width: 768px)'); updateDesktop(); desktopMedia.addEventListener('change', updateDesktop) })
onBeforeUnmount(() => desktopMedia?.removeEventListener('change', updateDesktop))
const { auth, vault, email, password, register, master, localError, authenticate, openVault, previewBrand, brandOptions, toggleRegistration,
  remember, selectedAccount, showAccounts, chooseAccount, otherAccount, backToAccounts } = useAuthGate(props)
const formId = useId()
const passwordVisible = ref(false)
const masterVisible = ref(false)
const qrEnabled = computed(() => desktop.value && !auth.user && !register.value && !props.admin && route.path !== '/auth/qr')
watch([password, register], () => { if (!password.value) passwordVisible.value = false })
watch(register, () => { passwordVisible.value = false })
watch(master, () => { if (!master.value) masterVisible.value = false })
</script>
<template>
  <div v-if="auth.checking || (!admin && auth.user && vault.checking)" class="gate"><UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" /><p>Проверяем сессию…</p></div>
  <div v-else-if="!auth.user || (!admin && !vault.unlocked)" class="gate">
    <BrandLogo class="gate-brand" />
    <UCard class="w-full" :class="qrEnabled ? 'max-w-[860px]' : 'max-w-md'">
      <template v-if="!auth.user">
        <div :class="{ 'gate-auth-layout': qrEnabled }"><div class="min-w-0">
        <span class="eyebrow">{{ admin ? 'ПАНЕЛЬ УПРАВЛЕНИЯ' : 'ВАШЕ ЛИЧНОЕ ПРОСТРАНСТВО' }}</span>
        <h1 class="mt-3 text-2xl font-semibold tracking-tight">{{ showAccounts ? 'Выберите аккаунт' : register ? 'Создать аккаунт' : admin ? 'Вход в панель управления' : 'Добро пожаловать' }}</h1>
        <p class="mt-2 mb-7 text-sm text-slate-500">{{ showAccounts ? 'Продолжите с сохранённым аккаунтом или войдите в другой.' : register ? 'Все ваши доступы. Под одним надёжным замком.' : admin ? 'Войдите под аккаунтом администратора.' : 'Войдите, чтобы открыть своё хранилище.' }}</p>
        <template v-if="showAccounts">
          <ul class="space-y-3" aria-label="Сохранённые аккаунты">
            <li v-for="account in auth.savedAccounts" :key="account.id" class="flex items-center gap-1 rounded-xl border border-slate-200 bg-white">
              <button type="button" class="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-3 text-left hover:bg-slate-50 disabled:opacity-50" :disabled="auth.pending" :aria-label="`Войти как ${account.email}`" @click="chooseAccount(account)">
                <PersonAvatar :name="account.name || account.email" :src="account.avatar" />
                <span class="min-w-0"><span class="block truncate text-sm font-semibold">{{ account.name || account.email }}</span><span v-if="account.name" class="block truncate text-xs text-slate-500">{{ account.email }}</span><span v-if="auth.hasQuickLogin(account.id)" class="block text-xs text-primary-600">Войти без пароля</span></span>
              </button>
              <UButton class="mr-2 shrink-0" icon="i-lucide-x" color="neutral" variant="ghost" :disabled="auth.pending" :aria-label="`Удалить ${account.email} с этого устройства`" :title="`Удалить ${account.email} из списка`" @click="auth.forgetAccount(account.id)" />
            </li>
          </ul>
          <UButton class="mt-5" color="neutral" variant="outline" block icon="i-lucide-user-plus" :disabled="auth.pending" @click="otherAccount">Войти в другой аккаунт</UButton>
          <p class="mt-4 text-xs text-slate-400">Удаление из списка не удаляет сам аккаунт.</p>
          <UAlert v-if="auth.error" class="mt-4" color="error" variant="soft" :description="auth.error" />
        </template>
        <template v-else>
        <div v-if="selectedAccount && !register" class="mb-5 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
          <PersonAvatar :name="selectedAccount.name || selectedAccount.email" :src="selectedAccount.avatar" />
          <span class="min-w-0"><span class="block truncate text-sm font-semibold">{{ selectedAccount.name || selectedAccount.email }}</span><span class="block text-xs text-slate-500">Введите пароль для входа</span></span>
        </div>
        <form :id="`${formId}-login`" class="space-y-5" autocomplete="on" @submit.prevent="authenticate">
          <UFormField v-if="register" label="Бренд аккаунта" required><USelect v-model="previewBrand" :items="brandOptions" class="w-full" size="lg" aria-label="Бренд аккаунта" /><p class="mt-2 text-xs text-slate-500">Оформление и логотип будут сохранены для вашего аккаунта.</p></UFormField>
          <UFormField label="Email" :for="`${formId}-email`" required><UInput :id="`${formId}-email`" v-model="email" name="username" type="email" inputmode="email" autocomplete="username" autocapitalize="none" :spellcheck="false" :disabled="auth.pending" class="w-full" size="lg" required placeholder="you@example.com" /></UFormField>
          <UFormField label="Пароль аккаунта" :for="`${formId}-password`" required><UInput :id="`${formId}-password`" v-model="password" name="password" :type="passwordVisible ? 'text' : 'password'" :autocomplete="register ? 'new-password' : 'current-password'" :minlength="register ? 12 : undefined" :disabled="auth.pending" class="w-full" size="lg" required placeholder="Введите пароль" :ui="{ trailing: 'pe-1' }"><template #trailing><UButton type="button" color="neutral" variant="ghost" size="sm" :icon="passwordVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'" :aria-label="passwordVisible ? 'Скрыть пароль' : 'Показать пароль'" :aria-pressed="passwordVisible" @click="passwordVisible = !passwordVisible" /></template></UInput></UFormField>
          <UCheckbox v-model="remember" label="Сохранить аккаунт на этом устройстве" description="Email и имя появятся на экране выбора. Пароль потребуется при следующем входе." :disabled="auth.pending" />
          <UAlert v-if="auth.error" color="error" variant="soft" :description="auth.error" />
          <UButton type="submit" block size="lg" :loading="auth.pending">{{ register ? 'Создать аккаунт' : 'Войти' }}<UIcon name="i-lucide-arrow-right" /></UButton>
        </form>
        <UButton v-if="auth.savedAccounts.length" class="mt-4" color="neutral" variant="ghost" block icon="i-lucide-arrow-left" :disabled="auth.pending" @click="backToAccounts">К выбору аккаунта</UButton>
        <button v-if="!admin" type="button" :disabled="auth.pending" class="mt-6 w-full text-center text-sm text-slate-500 hover:text-primary-600" @click="toggleRegistration">{{ register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться' }}</button>
        </template>
        <UAlert v-if="auth.storageError" class="mt-4" color="warning" variant="soft" :description="auth.storageError" />
        </div><QrLogin v-if="qrEnabled" :remember="remember"/></div>
      </template>
      <template v-else>
        <span class="eyebrow">ЛИЧНОЕ ХРАНИЛИЩЕ</span>
        <h1 class="mt-3 text-2xl font-semibold tracking-tight">{{ vault.migrationRequired ? 'Перенесите прежние пароли' : 'Откройте хранилище' }}</h1>
        <p class="mt-2 mb-6 text-sm text-slate-500">{{ vault.migrationRequired ? 'Введите прежний мастер-пароль один раз, чтобы перенести записи. После переноса для входа достаточно пароля аккаунта.' : 'Хранилище открывается после входа в аккаунт.' }}</p>
        <p class="mb-5 truncate text-xs text-slate-400">{{ auth.user.email }}</p>
        <form class="space-y-5" @submit.prevent="openVault">
          <UFormField v-if="vault.migrationRequired" label="Прежний мастер-пароль" required><UInput v-model="master" :type="masterVisible ? 'text' : 'password'" autocomplete="off" class="w-full" size="lg" required :disabled="vault.checking" :ui="{ trailing: 'pe-1' }"><template #trailing><UButton type="button" color="neutral" variant="ghost" size="sm" :icon="masterVisible ? 'i-lucide-eye-off' : 'i-lucide-eye'" :aria-label="masterVisible ? 'Скрыть мастер-пароль' : 'Показать мастер-пароль'" :aria-pressed="masterVisible" :disabled="vault.checking" @click="masterVisible = !masterVisible" /></template></UInput></UFormField>

          <UAlert v-if="vault.error || localError" color="error" variant="soft" :description="vault.error || localError" />
          <UButton v-if="vault.error" color="neutral" variant="ghost" block label="Проверить соединение" @click="vault.check()" />
          <UButton type="submit" block size="lg" :loading="vault.busy || vault.checking" :disabled="vault.checking">{{ vault.migrationRequired ? 'Перенести пароли' : 'Открыть хранилище' }}<UIcon name="i-lucide-unlock-keyhole" /></UButton>
        </form>
        <UButton class="mt-4" color="neutral" variant="ghost" block @click="auth.logout()">Выйти из аккаунта</UButton>
      </template>
    </UCard>
    <NuxtLink v-if="!admin && !native" to="/downloads" class="text-sm text-primary-600">Скачать приложение для вашего устройства</NuxtLink>
    <p class="gate-note"><UIcon name="i-lucide-shield-check" /> AES-256-GCM · Ваши секреты остаются вашими</p>
    <NuxtLink v-if="!admin" to="/admin/password" class="text-xs text-slate-400 hover:text-primary-600">Панель управления <span aria-hidden="true">↗</span></NuxtLink>
  </div>
  <slot v-else />
</template>
<style scoped>
.gate-auth-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(272px,.85fr);gap:32px}
</style>
