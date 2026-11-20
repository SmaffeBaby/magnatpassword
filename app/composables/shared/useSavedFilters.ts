import type { MaybeRefOrGetter } from 'vue'

type FilterValue = string | number | boolean | FilterValue[] | { [key: string]: FilterValue }

function isFilterObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function restoreFilters(target: Record<string, unknown>, defaults: Record<string, unknown>, saved: unknown) {
  const source = isFilterObject(saved) ? saved : {}
  for (const [key, fallback] of Object.entries(defaults)) {
    const value = Object.hasOwn(source, key) ? source[key] : undefined
    if (isFilterObject(fallback) && isFilterObject(target[key])) {
      restoreFilters(target[key], fallback, value)
    } else if (Array.isArray(fallback)) {
      target[key] = Array.isArray(value) && value.every(item => typeof item === 'string') ? [...value] : [...fallback]
    } else {
      target[key] = typeof value === typeof fallback ? value : fallback
    }
  }
}

export function bindSavedFilters<T extends Record<string, FilterValue>>(
  scope: MaybeRefOrGetter<string | undefined>,
  state: T,
  enabled: MaybeRefOrGetter<boolean> = true,
  initialState: T = state
) {
  if (import.meta.server) return state
  const auth = useAuthStore()
  const defaults = JSON.parse(JSON.stringify(initialState)) as T
  const key = computed(() => {
    const id = auth.user?.id
    const section = toValue(scope)
    return id && section && toValue(enabled) ? `magnat-filters:${id}:${section}` : undefined
  })
  let restoring = false

  function restore(raw: string | null) {
    restoring = true
    try {
      let parsed: unknown
      try { parsed = JSON.parse(raw ?? 'null') } catch { parsed = null }
      restoreFilters(state, defaults, parsed)
    } finally { restoring = false }
  }

  watch(key, value => {
    let saved: string | null = null
    try { if (value) saved = localStorage.getItem(value) } catch {}
    restore(saved)
  }, { immediate: true, flush: 'sync' })

  watch(() => JSON.stringify(state), value => {
    if (!key.value || restoring) return
    try { localStorage.setItem(key.value, value) } catch {}
  }, { flush: 'sync' })

  const sync = (event: StorageEvent) => {
    if (key.value && event.key === key.value && event.storageArea === localStorage) restore(event.newValue)
  }
  window.addEventListener('storage', sync)
  onScopeDispose(() => window.removeEventListener('storage', sync))
  return state
}

export function useSavedFilters<T extends Record<string, FilterValue>>(
  scope: MaybeRefOrGetter<string | undefined>,
  defaults: T
) {
  return bindSavedFilters(scope, reactive(defaults) as T)
}
