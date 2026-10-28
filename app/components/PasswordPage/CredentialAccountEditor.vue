<script setup lang="ts">
import { useAccountEditor } from '../../composables/useAccountEditor'

import type {CredentialAccount} from '~~/shared/types/vault'
const props=defineProps<{account:CredentialAccount}>()
const emit=defineEmits<{remove:[]}>()
const {revealed,generate}=useAccountEditor(props)
</script>
<template><section class="account-editor"><div class="flex gap-2 items-center"><UInput v-model="account.label" placeholder="Продакшен, Дев-сервер…" :maxlength="80" required aria-label="Название блока доступа" class="flex-1"/><UButton type="button" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="`Удалить доступ: ${account.label}`" @click="emit('remove')"/></div><div class="account-editor-fields"><UFormField label="Логин или email"><UInput v-model="account.username" autocomplete="off" class="w-full" :maxlength="300"/></UFormField><UFormField label="Пароль"><div class="flex gap-2"><UInput v-model="account.password" :type="revealed?'text':'password'" autocomplete="off" class="flex-1 min-w-0" :maxlength="1024"/><UButton type="button" color="neutral" variant="outline" :icon="revealed?'i-lucide-eye-off':'i-lucide-eye'" :aria-label="`Показать или скрыть пароль: ${account.label}`" @click="revealed=!revealed"/><UButton type="button" color="neutral" variant="outline" icon="i-lucide-refresh-cw" aria-label="Сгенерировать пароль" @click="generate"/></div></UFormField></div></section></template>
