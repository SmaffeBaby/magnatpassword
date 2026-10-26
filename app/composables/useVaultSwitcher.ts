import type {TeamPerson,VaultRole} from '~~/shared/types/team'
import {vaultRoles,vaultRoleLabel} from '~~/shared/utils/team'
import type {SharedMember} from '~~/shared/types/sharing'
import type { Ref } from 'vue'
export function useVaultSwitcher(selection: Ref<string>) {
  const vault = useVaultStore(), shared = useSharedVaultsStore(), auth = useAuthStore()
  const media=useMediaUploads()
  const selectedSvg=computed(()=>selection.value==='personal'?vault.data.svg:shared.groups.find(group=>group.id===selection.value)?.data.svg)
  async function uploadGroupSvg(event:Event){const id=managedId.value,value=await media.readSvg(event);if(id&&value&&id===managedId.value){const group=shared.groups.find(group=>group.id===id);if(group)await shared.save(id,{...group.data,svg:value})}}
  async function removeGroupSvg(){if(managed.value){const data={...managed.value.data};delete data.svg;await shared.save(managed.value.id,data)}}
  async function uploadPersonalSvg(event:Event){const value=await media.readSvg(event);if(value)await vault.save({...vault.data,svg:value})}
  async function removePersonalSvg(){const data={...vault.data};delete data.svg;await vault.save(data)}
  const open = ref(false), managedId = ref<string | null>(null), name = ref(''), email = ref(''), removing = ref<string | null>(null)
  const inviteMode=ref('all'),inviteCategories=ref<string[]>([]),permissionMember=ref<SharedMember|null>(null),permissionMode=ref('all'),permissionCategories=ref<string[]>([])
  const selectedPerson=ref<TeamPerson|null>(null),inviteRole=ref<VaultRole>('member'),permissionRole=ref<VaultRole>('member')
  const roleOptions=computed(()=>vaultRoles.filter(role=>isOwner.value||role.value!=='manager'))
  const permissionOptions=[{label:'Все категории',value:'all'},{label:'Выбранные категории',value:'selected'}]
  const categoryOptions=computed(()=>(managed.value?.data.categories??[]).map(category=>({label:category.name,value:category.id})))
  function editPermissions(member:SharedMember){permissionMember.value=member;permissionRole.value=member.role??'member';permissionMode.value=member.categoryIds==null?'all':'selected';permissionCategories.value=(member.categoryIds??[]).filter(id=>categoryOptions.value.some(option=>option.value===id))}
  async function savePermissions(){if(managed.value&&permissionMember.value&&await shared.permissions(managed.value.id,permissionMember.value.userId,permissionRole.value==='manager'||permissionMode.value==='all'?null:permissionCategories.value,permissionRole.value))permissionMember.value=null}
  function permissionLabel(member:SharedMember){return member.categoryIds==null?'Все категории':member.categoryIds.length?`${member.categoryIds.length} категорий`:'Нет доступных категорий'}
  const renameName = ref(''), personalOpen = ref(false), personalName = ref('')
  const personalLabel = computed(() => vault.data.name || 'Личное хранилище')
  function managePersonal() { personalName.value = personalLabel.value; personalOpen.value = true; vault.error = '' }
  async function renamePersonal() { if (personalName.value.trim() && await vault.save({ ...vault.data, name: personalName.value.trim() })) personalOpen.value = false }
  async function rename() { if (managed.value) await shared.rename(managed.value.id, renameName.value) }
  const managed = computed(() => shared.groups.find(g => g.id === managedId.value))
  const isOwner = computed(() => managed.value?.ownerId === auth.user?.id)
  const canManage=computed(()=>!!managed.value?.canManageMembers||isOwner.value)
  const canEditMember=(member:SharedMember)=>member.userId!==managed.value?.ownerId&&(isOwner.value||canManage.value&&member.role!=='manager'&&member.userId!==auth.user?.id)
  const label = computed(() => selection.value === 'all' ? 'Все хранилища' : selection.value === 'personal' ? personalLabel.value : shared.groups.find(g => g.id === selection.value)?.name ?? 'Все хранилища')
  function select(id: string) { selection.value = id; open.value = false }
  function manage(id: string) { managedId.value = id; renameName.value = shared.groups.find(g => g.id === id)?.name || ''; email.value = ''; selectedPerson.value=null;inviteRole.value='member'; inviteMode.value='all';inviteCategories.value=[];permissionMember.value=null;removing.value = null; shared.error = '' }
  async function create() { const id = await shared.create(name.value); if (id) { name.value = ''; select(id); manage(id) } }
  async function invite() { if(managed.value&&selectedPerson.value&&await shared.invite(managed.value.id,selectedPerson.value.email,inviteRole.value==='manager'||inviteMode.value==='all'?null:inviteCategories.value,inviteRole.value,selectedPerson.value.id))selectedPerson.value=null }
  async function revoke() { if (managed.value && removing.value && await shared.revoke(managed.value.id, removing.value)) removing.value = null }
  watch(() => shared.groups.map(g => g.id), () => {
    if (!['all', 'personal'].includes(selection.value) && !shared.groups.some(g => g.id === selection.value)) selection.value = 'all'
    if (managedId.value && !managed.value) {managedId.value = null;permissionMember.value=null}
  })
  return { selectedPerson,inviteRole,permissionRole,roleOptions,vaultRoleLabel,canManage,canEditMember,inviteMode, inviteCategories, permissionMember, permissionMode, permissionCategories, permissionOptions, categoryOptions, editPermissions, savePermissions, permissionLabel, ...media, selectedSvg, uploadGroupSvg, removeGroupSvg, uploadPersonalSvg, removePersonalSvg, vault, personalOpen, personalName, personalLabel, managePersonal, renamePersonal, renameName, rename, shared, auth, open, managedId, managed, isOwner, label, name, email, removing, select, manage, create, invite, revoke }
}
