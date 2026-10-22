import type { Ref } from 'vue'
export function useVaultSwitcher(selection: Ref<string>) {
  const vault = useVaultStore(), shared = useSharedVaultsStore(), auth = useAuthStore()
  const open = ref(false), managedId = ref<string | null>(null), name = ref(''), email = ref(''), removing = ref<string | null>(null)
  const renameName = ref(''), personalOpen = ref(false), personalName = ref('')
  const personalLabel = computed(() => vault.data.name || 'Личное хранилище')
  function managePersonal() { personalName.value = personalLabel.value; personalOpen.value = true; vault.error = '' }
  async function renamePersonal() { if (personalName.value.trim() && await vault.save({ ...vault.data, name: personalName.value.trim() })) personalOpen.value = false }
  async function rename() { if (managed.value) await shared.rename(managed.value.id, renameName.value) }
  const managed = computed(() => shared.groups.find(g => g.id === managedId.value))
  const isOwner = computed(() => managed.value?.ownerId === auth.user?.id)
  const label = computed(() => selection.value === 'all' ? 'Все хранилища' : selection.value === 'personal' ? personalLabel.value : shared.groups.find(g => g.id === selection.value)?.name ?? 'Все хранилища')
  function select(id: string) { selection.value = id; open.value = false }
  function manage(id: string) { managedId.value = id; renameName.value = shared.groups.find(g => g.id === id)?.name || ''; email.value = ''; removing.value = null; shared.error = '' }
  async function create() { const id = await shared.create(name.value); if (id) { name.value = ''; select(id); manage(id) } }
  async function invite() { if (managed.value && await shared.invite(managed.value.id, email.value)) email.value = '' }
  async function revoke() { if (managed.value && removing.value && await shared.revoke(managed.value.id, removing.value)) removing.value = null }
  watch(() => shared.groups.map(g => g.id), () => {
    if (!['all', 'personal'].includes(selection.value) && !shared.groups.some(g => g.id === selection.value)) selection.value = 'all'
    if (managedId.value && !managed.value) managedId.value = null
  })
  return { vault, personalOpen, personalName, personalLabel, managePersonal, renamePersonal, renameName, rename, shared, auth, open, managedId, managed, isOwner, label, name, email, removing, select, manage, create, invite, revoke }
}
