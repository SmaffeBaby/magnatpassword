import type { H3Event } from 'h3'
import { z } from 'zod'
import type { ProjectPasswordCandidate } from '../../shared/types/project-passwords'
import { categoryScopedData } from './category-access'

export const projectPasswordSourceSchema = z.object({
  kind: z.enum(['personal', 'vault', 'card']), sourceId: z.uuid(), entryId: z.uuid()
}).strict()

// Only offer source records the caller can currently read; project copies have their own access.
export async function projectPasswordCandidates(event: H3Event, context: Awaited<ReturnType<typeof requireSharedUser>>, includeSubscriptions = false): Promise<ProjectPasswordCandidate[]> {
  const result: ProjectPasswordCandidate[] = []
  const personal = await personalRow(context)
  if (personal?.encryption_mode === 'server') {
    for (const entry of openPersonal(event, personal).entries) {
      if (!entry.kind || includeSubscriptions && entry.kind==='subscription') result.push({ source: { kind: 'personal', sourceId: context.user.id, entryId: entry.id }, sourceName: 'Личное хранилище', entry })
    }
  }
  const { data: memberships, error } = await context.client.from('shared_vault_members').select('vault_id,category_ids').eq('user_id', context.user.id)
  if (error) throw createError({ statusCode: 503, message: 'Не удалось проверить доступ к паролям' })
  if (memberships.length) {
    const { data: groups, error } = await context.client.from('shared_vaults').select('*').in('id', memberships.map(member => member.vault_id))
    if (error) throw createError({ statusCode: 503, message: 'Не удалось загрузить пароли' })
    for (const group of groups) {
      const member = memberships.find(member => member.vault_id === group.id)!
      for (const entry of categoryScopedData(decodeShared(event, group), member.category_ids).entries) {
        if (!entry.kind || includeSubscriptions && entry.kind==='subscription') result.push({ source: { kind: 'vault', sourceId: group.id, entryId: entry.id }, sourceName: group.name, entry })
      }
    }
  }
  for (const card of await visibleSharedCards(event, context)) {
    if (!card.archived && (!card.entry.kind || includeSubscriptions && card.entry.kind==='subscription')) result.push({ source: { kind: 'card', sourceId: card.id, entryId: card.entry.id }, sourceName: card.vaultIds.length ? 'Общая карточка' : 'Личная карточка', entry: card.entry })
  }
  return result
}

export const projectPasswordFieldsSchema = z.object({
  title: z.string().trim().min(1).max(120), url: z.string().max(2000),
  username: z.string().max(300), password: z.string().max(1024), notes: z.string().max(10000),
  accounts: credentialSchema.shape.accounts
}).strict()
export async function readProjectPasswords(context: Awaited<ReturnType<typeof requireSharedUser>>, id: string) {
  const { data, error } = await context.client.rpc('project_passwords_read', { p_actor: context.user.id, p_project: id })
  if (error) projectPasswordFailure(error)
  return data as { id: string; revision: number; createdBy: string | null; createdAt: string; updatedAt: string; canEdit: boolean; encryptedData: import('../../shared/types/vault').EncryptedData }[]
}
export function projectPasswordFailure(error: { message: string }): never {
  if (error.message.includes('PASSWORD_NOT_FOUND')) throw createError({ statusCode: 404, message: 'Пароль больше не доступен в проекте' })
  if (error.message.includes('PASSWORD_LIMIT')) throw createError({ statusCode: 400, message: 'В проекте может быть до 500 паролей' })
  projectFailure(error)
}
export async function mutateProjectPassword(context: Awaited<ReturnType<typeof requireSharedUser>>, project: string, id: string, revision: number, action: string, data: unknown = {}) {
  const { error } = await context.client.rpc('project_password_mutate', { p_actor: context.user.id, p_project: project, p_id: id, p_revision: revision, p_action: action, p_data: data })
  if (error) projectPasswordFailure(error)
  return { id }
}
export function projectPasswordId(event: H3Event) {
  const parsed = z.uuid().safeParse(getRouterParam(event, 'passwordId'))
  if (!parsed.success) throw createError({ statusCode: 400, message: 'Некорректный пароль проекта' })
  return parsed.data
}
export function decodeProjectPassword(event: H3Event, project: string, id: string, data: import('../../shared/types/vault').EncryptedData) {
  try { return credentialSchema.parse(openSharedVault(data, sharedSecret(event), `project-password:${project}:${id}`, 1)) }
  catch { throw createError({ statusCode: 503, message: 'Не удалось открыть пароль проекта' }) }
}
