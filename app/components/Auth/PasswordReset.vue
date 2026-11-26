<script setup lang="ts">
const props = defineProps<{ initialEmail: string }>()
const emit = defineEmits<{ back: []; completed: [email: string] }>()
const email = ref(props.initialEmail)
const code = ref('')
const password = ref('')
const confirmation = ref('')
const step = ref<'email' | 'code' | 'password'>('email')
const pending = ref(false)
const error = ref('')
const formId = useId()
const form = ref<HTMLFormElement>()

watch(step, async () => {
  await nextTick()
  form.value?.querySelector('input')?.focus()
}, { immediate: true })

async function submit() {
  if (pending.value) return
  error.value = ''
  if (step.value === 'password') {
    if ([...password.value].length < 12 || new TextEncoder().encode(password.value).length > 72) {
      error.value = 'Введите пароль от 12 символов, не длиннее 72 байт.'
      return
    }
    if (password.value !== confirmation.value) {
      error.value = 'Пароли не совпадают.'
      return
    }
  }
  pending.value = true
  const address = email.value.trim()
  const proof = { email: address, code: code.value.trim() }
  try {
    if (step.value === 'email') {
      await backendFetch('/api/auth/password-reset/request', { method: 'POST', body: { email: address } })
      step.value = 'code'
    } else if (step.value === 'code') {
      await backendFetch('/api/auth/password-reset/verify', { method: 'POST', body: proof })
      step.value = 'password'
    } else {
      await backendFetch('/api/auth/password-reset/complete', { method: 'POST', body: { ...proof, password: password.value } })
      emit('completed', address)
    }
  } catch (failure: any) {
    error.value = failure?.data?.message || 'Не удалось продолжить. Повторите попытку.'
    if (step.value === 'password' && failure?.status === 410) {
      code.value = ''
      password.value = ''
      confirmation.value = ''
      step.value = 'code'
    }
  } finally {
    pending.value = false
  }
}

function editEmail() {
  code.value = ''
  error.value = ''
  step.value = 'email'
}
</script>

<template>
  <h1 class="text-2xl font-semibold tracking-tight">Сброс пароля</h1>
  <p class="mt-2 mb-6 text-sm text-slate-500">
    <template v-if="step === 'email'">Укажите email аккаунта, чтобы отправить запрос администратору.</template>
    <template v-else-if="step === 'code'">Если для {{ email.trim() }} доступен сброс, администратор получит код. Обратитесь к нему, чтобы получить код.</template>
    <template v-else>Придумайте новый пароль для аккаунта.</template>
  </p>
  <form ref="form" class="space-y-5" @submit.prevent="submit">
    <UFormField v-if="step === 'email'" label="Email" :for="`${formId}-email`" required>
      <UInput :id="`${formId}-email`" v-model="email" type="email" autocomplete="username" autocapitalize="none" :spellcheck="false" :maxlength="254" :disabled="pending" class="w-full" size="lg" required />
    </UFormField>
    <UFormField v-else-if="step === 'code'" label="Код сброса" :for="`${formId}-code`" required>
      <UInput :id="`${formId}-code`" v-model="code" autocomplete="one-time-code" autocapitalize="none" :spellcheck="false" :maxlength="64" :disabled="pending" class="w-full" size="lg" required />
    </UFormField>
    <template v-else>
      <UFormField label="Новый пароль" :for="`${formId}-password`" hint="От 12 символов" required>
        <UInput :id="`${formId}-password`" v-model="password" type="password" name="new-password" autocomplete="new-password" :minlength="12" :maxlength="72" :disabled="pending" class="w-full" size="lg" required />
      </UFormField>
      <UFormField label="Подтверждение пароля" :for="`${formId}-confirmation`" required>
        <UInput :id="`${formId}-confirmation`" v-model="confirmation" type="password" name="confirm-password" autocomplete="new-password" :minlength="12" :maxlength="72" :disabled="pending" class="w-full" size="lg" required />
      </UFormField>
    </template>
    <UAlert v-if="error" color="error" variant="soft" :description="error" role="alert" />
    <UButton type="submit" :loading="pending" block size="lg">
      {{ step === 'email' ? 'Запросить код' : step === 'code' ? 'Проверить код' : 'Сохранить новый пароль' }}
    </UButton>
  </form>
  <UButton v-if="step === 'code'" class="mt-3" color="neutral" variant="ghost" block :disabled="pending" @click="editEmail">
    Изменить email или запросить код ещё раз
  </UButton>
  <UButton class="mt-3" color="neutral" variant="ghost" block icon="i-lucide-arrow-left" :disabled="pending" @click="emit('back')">
    Вернуться ко входу
  </UButton>
</template>
