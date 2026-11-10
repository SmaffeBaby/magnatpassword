<script setup lang="ts">
import QRCode from 'qrcode'

const props = defineProps<{ remember: boolean }>()
const auth = useAuthStore()
const image = ref(''), code = ref(''), error = ref(''), state = ref('loading')
const expiresAt = ref(0), now = ref(Date.now())
const remaining = computed(() => Math.max(0, Math.ceil((expiresAt.value - now.value) / 1000)))
const timeLabel = computed(() => `${Math.floor(remaining.value / 60)}:${String(remaining.value % 60).padStart(2, '0')}`)
let timer: ReturnType<typeof setTimeout> | undefined, clock: ReturnType<typeof setInterval> | undefined
let controller: AbortController | undefined, generation = 0

async function refresh() {
  const current = ++generation
  controller?.abort(); clearTimeout(timer)
  controller = new AbortController()
  const signal = controller.signal
  error.value = ''; image.value = ''; code.value = ''; state.value = 'loading'
  try {
    const request = await backendFetch<{ id: string; token: string; secret: string; code: string; expiresAt: string; origin?: string }>('/api/auth/qr/create', { method: 'POST', retry: 0, signal })
    const url = new URL('/auth/qr', request.origin || new URL(backendUrl('/api/health'), window.location.origin))
    url.hash = new URLSearchParams({ token: request.token }).toString()
    const dataUrl = await QRCode.toDataURL(url.href, { width: 240, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#172332', light: '#ffffff' } })
    if (current !== generation || signal.aborted) return
    image.value = dataUrl; code.value = request.code; expiresAt.value = Date.parse(request.expiresAt); now.value = Date.now(); state.value = 'pending'
    const body = { id: request.id, secret: request.secret }
    async function poll() {
      if (current !== generation || signal.aborted || auth.user) return
      if (Date.now() >= expiresAt.value) { state.value = 'expired'; return }
      try {
        const result = await backendFetch<{ state: string }>('/api/auth/qr/poll', { method: 'POST', body, retry: 0, signal })
        if (current !== generation || signal.aborted) return
        if (result.state === 'approved') {
          if (auth.pending) { timer = setTimeout(poll, 1500); return }
          state.value = 'signing-in'
          const tokens = await backendFetch<{ access_token: string; refresh_token: string }>('/api/auth/qr/claim', { method: 'POST', body, retry: 0, signal })
          if (current !== generation || signal.aborted || auth.user) return
          if (!await auth.authenticateQr(tokens, props.remember)) throw new Error(auth.error)
          return
        }
        if (result.state !== 'pending') { state.value = result.state === 'rejected' ? 'rejected' : 'expired'; return }
        error.value = ''
      } catch (failure: any) {
        if (signal.aborted || current !== generation) return
        if (failure?.statusCode === 410) { state.value = 'expired'; return }
        if (state.value === 'signing-in') { state.value = 'error'; error.value = failure?.message || 'Не удалось войти. Обновите QR-код.'; return }
        error.value = 'Нет связи с сервером. Проверяем повторно…'
      }
      timer = setTimeout(poll, error.value ? 5000 : 2000)
    }
    timer = setTimeout(poll, 2000)
  } catch {
    if (signal.aborted || current !== generation) return
    state.value = 'error'; error.value = 'Не удалось загрузить QR-код. Проверьте соединение.'
  }
}
onMounted(() => { void refresh(); clock = setInterval(() => { now.value = Date.now(); if (state.value === 'pending' && now.value >= expiresAt.value) { state.value = 'expired'; clearTimeout(timer) } }, 1000) })
onBeforeUnmount(() => { generation++; controller?.abort(); clearTimeout(timer); clearInterval(clock) })
</script>

<template>
  <aside class="qr-login" aria-label="Вход по QR-коду">
    <h2>Войти по QR-коду</h2>
    <p>Наведите камеру телефона и подтвердите вход в Magnat или браузере.</p>
    <div class="qr-login-code">
      <img v-if="image && state === 'pending'" :src="image" alt="QR-код для подтверждения входа на телефоне" width="240" height="240" />
      <div v-else class="qr-login-status" role="status"><UIcon :name="state === 'loading' || state === 'signing-in' ? 'i-lucide-loader-circle' : 'i-lucide-qr-code'" :class="{ 'animate-spin': state === 'loading' || state === 'signing-in' }"/><span>{{ state === 'loading' ? 'Готовим QR-код…' : state === 'signing-in' ? 'Входим в аккаунт…' : state === 'rejected' ? 'Вход отклонён' : state === 'expired' ? 'Срок действия истёк' : 'QR-код недоступен' }}</span></div>
    </div>
    <template v-if="state === 'pending'"><div class="qr-verification">Код для сверки <strong>{{ code }}</strong></div><p class="qr-login-expiry">Действует ещё {{ timeLabel }}</p></template>
    <p v-if="error" class="qr-login-error" role="status">{{ error }}</p>
    <UButton v-if="!['loading', 'signing-in'].includes(state)" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :disabled="auth.pending" @click="refresh">Обновить QR-код</UButton>
  </aside>
</template>

<style scoped>
.qr-login{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:0;padding-left:32px;border-left:1px solid #e2e8f0;text-align:center}.qr-login h2{font-size:20px;font-weight:600;letter-spacing:-.4px;color:#172332}.qr-login p{font-size:13px;line-height:1.7;color:#64748b;margin:10px 0 0;max-width:260px}.qr-login-code{width:240px;height:240px;margin:18px 0 10px;background:white;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden}.qr-login-code img{display:block;width:100%;height:100%}.qr-login-status{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;color:#64748b;font-size:13px;padding:20px}.qr-login-status>.iconify{width:32px;height:32px}.qr-verification{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#64748b}.qr-verification strong{font-size:23px;color:#334155;letter-spacing:5px;font-variant-numeric:tabular-nums}.qr-login .qr-login-expiry{font-size:12px;margin:8px 0}.qr-login .qr-login-error{color:#b45309;font-size:12px;margin-bottom:8px}
</style>
