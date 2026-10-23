<script setup lang="ts">
import BrandLogo from './BrandLogo.vue'
import { useAuthGate } from '../composables/useAuthGate'

const props = defineProps<{ admin?: boolean }>()
const { auth, vault, email, password, register, master, localError, authenticate, openVault, previewBrand, brandOptions, toggleRegistration } = useAuthGate(props)
</script>
<template>
  <div v-if="auth.checking || (!admin && auth.user && vault.checking)" class="gate"><UIcon name="i-lucide-loader-circle" class="size-6 animate-spin" /><p>Проверяем сессию…</p></div>
  <div v-else-if="!auth.user || (!admin && !vault.unlocked)" class="gate">
    <BrandLogo class="gate-brand" />
    <UCard class="w-full max-w-md">
      <template v-if="!auth.user">
        <span class="eyebrow">{{ admin ? 'ПАНЕЛЬ УПРАВЛЕНИЯ' : 'ВАШЕ ЛИЧНОЕ ПРОСТРАНСТВО' }}</span>
        <h1 class="mt-3 text-2xl font-semibold tracking-tight">{{ register ? 'Создать аккаунт' : admin ? 'Вход в панель управления' : 'Добро пожаловать' }}</h1>
        <p class="mt-2 mb-7 text-sm text-slate-500">{{ register ? 'Все ваши доступы. Под одним надёжным замком.' : admin ? 'Войдите под аккаунтом администратора.' : 'Войдите, чтобы открыть своё хранилище.' }}</p>
        <form class="space-y-5" @submit.prevent="authenticate">
          <UFormField v-if="register" label="Бренд аккаунта" required><USelect v-model="previewBrand" :items="brandOptions" class="w-full" size="lg" aria-label="Бренд аккаунта" /><p class="mt-2 text-xs text-slate-500">Оформление и логотип будут сохранены для вашего аккаунта.</p></UFormField>
          <UFormField label="Email" required><UInput v-model="email" type="email" autocomplete="username" class="w-full" size="lg" required placeholder="you@example.com" /></UFormField>
          <UFormField label="Пароль аккаунта" required><UInput v-model="password" type="password" :autocomplete="register ? 'new-password' : 'current-password'" :minlength="register ? 12 : undefined" class="w-full" size="lg" required placeholder="Введите пароль" /></UFormField>
          <UAlert v-if="auth.error" color="error" variant="soft" :description="auth.error" />
          <UButton type="submit" block size="lg" :loading="auth.pending">{{ register ? 'Создать аккаунт' : 'Войти' }}<UIcon name="i-lucide-arrow-right" /></UButton>
        </form>
        <button v-if="!admin" class="mt-6 w-full text-center text-sm text-slate-500 hover:text-primary-600" @click="toggleRegistration">{{ register ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться' }}</button>
      </template>
      <template v-else>
        <span class="eyebrow">ЛИЧНОЕ ХРАНИЛИЩЕ</span>
        <h1 class="mt-3 text-2xl font-semibold tracking-tight">{{ vault.migrationRequired ? 'Перенесите прежние пароли' : 'Откройте хранилище' }}</h1>
        <p class="mt-2 mb-6 text-sm text-slate-500">{{ vault.migrationRequired ? 'Введите прежний мастер-пароль один раз, чтобы перенести записи. После переноса для входа достаточно пароля аккаунта.' : 'Хранилище открывается после входа в аккаунт.' }}</p>
        <p class="mb-5 truncate text-xs text-slate-400">{{ auth.user.email }}</p>
        <form class="space-y-5" @submit.prevent="openVault">
          <UFormField v-if="vault.migrationRequired" label="Прежний мастер-пароль" required><UInput v-model="master" type="password" autocomplete="off" class="w-full" size="lg" required :disabled="vault.checking" /></UFormField>

          <UAlert v-if="vault.error || localError" color="error" variant="soft" :description="vault.error || localError" />
          <UButton v-if="vault.error" color="neutral" variant="ghost" block label="Проверить соединение" @click="vault.check()" />
          <UButton type="submit" block size="lg" :loading="vault.busy || vault.checking" :disabled="vault.checking">{{ vault.migrationRequired ? 'Перенести пароли' : 'Открыть хранилище' }}<UIcon name="i-lucide-unlock-keyhole" /></UButton>
        </form>
        <UButton class="mt-4" color="neutral" variant="ghost" block @click="auth.logout()">Выйти из аккаунта</UButton>
      </template>
    </UCard>
    <p class="gate-note"><UIcon name="i-lucide-shield-check" /> AES-256-GCM · Ваши секреты остаются вашими</p>
    <NuxtLink v-if="!admin" to="/admin" class="text-xs text-slate-400 hover:text-primary-600">Панель управления <span aria-hidden="true">↗</span></NuxtLink>
  </div>
  <slot v-else />
</template>
