<script setup lang="ts">
import AuthGate from '~/components/AuthGate.vue'
import { isNativeShell } from '~/utils/native-shell'
import { qrSecretPattern } from '~~/shared/utils/qr-login'

definePageMeta({ layout: false })
useHead({ title: 'Подтверждение входа · Magnat', meta: [{ name: 'referrer', content: 'no-referrer' }] })
const auth = useAuthStore(), route = useRoute(), router = useRouter()
const token = ref(''), error = ref(''), busy = ref(false), result = ref(''), matched = ref(false), native = ref(false)
const request = ref<{ code: string; device: string; expiresAt: string } | null>(null)
const now = ref(Date.now())
const expired = computed(() => request.value && now.value >= Date.parse(request.value.expiresAt))
const appLink = computed(() => `magnat://auth/qr#${new URLSearchParams({ token: token.value })}`)
let timer: ReturnType<typeof setInterval> | undefined
async function inspect() {
  request.value = null; error.value = ''; result.value = ''; matched.value = false
  try { request.value = await backendFetch('/api/auth/qr/inspect', { method: 'POST', body: { token: token.value }, retry: 0 }) }
  catch (failure: any) { error.value = failure?.data?.message || 'QR-код истёк или недоступен. Обновите его на компьютере.' }
}
async function readToken() {
  const incoming = new URLSearchParams(window.location.hash.slice(1)).get('token')
  let saved = ''
  try { saved = sessionStorage.getItem('magnat-qr-confirmation') || '' } catch {}
  const value = incoming || saved
  if (!qrSecretPattern.test(value)) { error.value = 'Некорректная ссылка. Отсканируйте QR-код на компьютере.'; return }
  token.value = value
  try { sessionStorage.setItem('magnat-qr-confirmation', value) } catch {}
  // Fragments never go to the server; remove them from the visible/history URL too.
  if (incoming) await router.replace({ path: '/auth/qr', hash: '' })
  await inspect()
}
async function confirm(approve: boolean) {
  if (busy.value || !request.value || expired.value || (approve && !matched.value)) return
  busy.value = true; error.value = ''
  try {
    await sharedRequest('/api/auth/qr/approve', { method: 'POST', body: { token: token.value, approve } })
    result.value = approve ? 'approved' : 'rejected'
    try { sessionStorage.removeItem('magnat-qr-confirmation') } catch {}
  } catch (failure: any) { error.value = failure?.data?.message || failure?.message || 'Не удалось подтвердить вход.' }
  finally { busy.value = false }
}
onMounted(async () => {
  native.value = isNativeShell()
  timer = setInterval(() => { now.value = Date.now() }, 1000)
  await readToken()
  // Camera opens an ordinary HTTPS link. Keep this page as the browser fallback.
  if (!native.value && token.value && request.value && /android|iphone|ipad|ipod/i.test(navigator.userAgent)) window.location.assign(appLink.value)
})
watch(() => route.hash, hash => { if (hash) void readToken() })
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <AuthGate>
    <main class="gate">
      <UCard class="w-full max-w-md">
        <span class="eyebrow">ВХОД ПО QR-КОДУ</span>
        <template v-if="result">
          <UIcon :name="result === 'approved' ? 'i-lucide-circle-check' : 'i-lucide-shield-x'" class="mt-5 size-10 text-primary-600"/>
          <h1 class="mt-4 text-2xl font-semibold">{{ result === 'approved' ? 'Вход подтверждён' : 'Вход отклонён' }}</h1>
          <p class="mt-3 text-sm leading-6 text-slate-500">{{ result === 'approved' ? 'Вернитесь к компьютеру — Magnat откроется автоматически.' : 'На компьютере можно получить новый QR-код.' }}</p>
          <UButton to="/" class="mt-6" color="neutral" variant="outline">На главную</UButton>
        </template>
        <template v-else>
          <h1 class="mt-3 text-2xl font-semibold tracking-tight">Войти на компьютере?</h1>
          <p class="mt-3 text-sm leading-6 text-slate-500">Вы подтверждаете вход под аккаунтом <strong class="break-all text-slate-700">{{ auth.user?.email }}</strong>.</p>
          <div v-if="request" class="my-6 rounded-xl border border-slate-200 p-5 text-center">
            <p class="text-sm text-slate-600">{{ request.device }}</p>
            <strong class="mt-3 block text-3xl tracking-[.25em] text-slate-700">{{ request.code }}</strong>
            <p class="mt-3 text-xs leading-5 text-slate-500">Сверьте этот код с кодом на экране компьютера.</p>
          </div>
          <UAlert v-if="expired" class="my-4" color="warning" title="Срок действия QR-кода истёк" description="Обновите QR-код на компьютере и отсканируйте его снова."/>
          <UAlert v-if="error" class="my-4" color="error" :description="error"/>
          <UButton v-if="error && !expired && token" class="mb-4" color="neutral" variant="outline" icon="i-lucide-refresh-cw" @click="inspect">Проверить снова</UButton>
          <template v-if="request && !expired">
            <UCheckbox v-model="matched" label="Я запрашиваю этот вход, коды совпадают" :disabled="busy"/>
            <UButton block size="lg" class="mt-6" :loading="busy" :disabled="!matched" @click="confirm(true)">Подтвердить вход</UButton>
            <UButton block class="mt-3" color="neutral" variant="outline" :disabled="busy" @click="confirm(false)">Отклонить</UButton>
          </template>
          <UButton to="/" block class="mt-4" color="neutral" variant="ghost" :disabled="busy">На главную</UButton>
        </template>
      </UCard>
    </main>
  </AuthGate>
  <div v-if="!native && token && !result" class="qr-open-app"><a :href="appLink">Открыть в приложении Magnat</a><span>Если приложения нет, продолжите вход в браузере.</span></div>
</template>
<style scoped>
.qr-open-app{position:fixed;bottom:0;inset-inline:0;z-index:40;display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 16px max(14px,env(safe-area-inset-bottom));background:#ffffffed;border-top:1px solid #e2e8f0;text-align:center;backdrop-filter:blur(12px)}.qr-open-app a{font-size:14px;color:var(--ui-primary);font-weight:600}.qr-open-app span{font-size:11px;color:#64748b}.gate{padding-bottom:110px}
</style>
