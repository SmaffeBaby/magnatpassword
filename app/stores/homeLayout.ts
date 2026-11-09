import { defineStore } from 'pinia'
import type { HomeAppId, HomeLayoutResponse } from '~~/shared/types/home-layout'
import { copyHomeLayout, defaultHomeLayout, hideHomeCard, moveHomeCard } from '~~/shared/utils/home-layout'

export const useHomeLayoutStore = defineStore('home-layout', () => {
  const auth = useAuthStore(), vault = useVaultStore(), toast = useToast()
  const layout = ref(defaultHomeLayout()), draft = ref(defaultHomeLayout()), revision = ref(0)
  const editing = ref(false), loading = ref(false), saving = ref(false), ready = ref(false), error = ref(''), conflict = ref(false)
  let generation = 0
  const display = computed(() => editing.value ? draft.value : layout.value)
  const message = (failure: any) => failure?.data?.message || failure?.message || 'Настройки главной страницы недоступны.'
  async function load() {
    if (!auth.user || !vault.unlocked || loading.value || saving.value) return
    const attempt = generation
    loading.value = true; error.value = ''; conflict.value = false
    try {
      const result = await sharedRequest<HomeLayoutResponse>('/api/profile/home-layout')
      if (attempt !== generation) return
      layout.value = result.layout; draft.value = copyHomeLayout(result.layout); revision.value = result.revision; ready.value = true
    } catch (failure) { if (attempt === generation) error.value = message(failure) }
    finally { if (attempt === generation) loading.value = false }
  }
  function open() { if (ready.value && !loading.value) { draft.value = copyHomeLayout(layout.value); error.value = ''; conflict.value = false; editing.value = true } }
  function cancel() { if (!saving.value) { editing.value = false; draft.value = copyHomeLayout(layout.value); error.value = ''; conflict.value = false } }
  async function save() {
    if (!ready.value || loading.value || saving.value || !auth.user || !vault.unlocked) return
    const attempt = generation
    saving.value = true; error.value = ''; conflict.value = false
    try {
      const result = await sharedRequest<HomeLayoutResponse>('/api/profile/home-layout', { method: 'PUT', body: { layout: copyHomeLayout(draft.value), revision: revision.value } })
      if (attempt !== generation) return
      layout.value = result.layout; revision.value = result.revision; editing.value = false
      toast.add({ title: 'Главная страница настроена', color: 'success' })
    } catch (failure: any) {
      if (attempt === generation) { error.value = message(failure); conflict.value = (failure?.statusCode ?? failure?.status) === 409 }
    } finally { if (attempt === generation) saving.value = false }
  }
  const move = (id: HomeAppId, row: number | 'new', position?: number) => { draft.value = moveHomeCard(draft.value, id, row, position) }
  const hide = (id: HomeAppId) => { draft.value = hideHomeCard(draft.value, id) }
  const show = (id: HomeAppId) => move(id, draft.value.rows.length ? draft.value.rows.length - 1 : 'new')
  function reorderRow(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= draft.value.rows.length) return
    const [row] = draft.value.rows.splice(index, 1); draft.value.rows.splice(target, 0, row!)
  }
  const reset = () => { draft.value = defaultHomeLayout() }
  watch([() => auth.user?.id, () => vault.unlocked], () => {
    generation++; layout.value = defaultHomeLayout(); draft.value = defaultHomeLayout(); revision.value = 0
    editing.value = false; loading.value = false; saving.value = false; ready.value = false; error.value = ''; conflict.value = false
    void load()
  }, { immediate: true })
  return { layout, draft, display, revision, editing, loading, saving, ready, error, conflict, load, open, cancel, save, move, hide, show, reorderRow, reset }
})
