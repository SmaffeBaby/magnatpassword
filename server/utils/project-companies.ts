import { createHmac, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { ProjectCounterparty } from '../../shared/types/estimate'
import type { DirectoryCompany } from '../../shared/types/project-companies'
import { counterpartySchema } from '../../shared/utils/estimate'
import { sealSharedVault, openSharedVault } from './shared-crypto'
type Context = Awaited<ReturnType<typeof requireProjectsUser>>
export function companyFailure(error: { message: string; code?: string }) {
  if (error.code === '23505') throw createError({ statusCode:409, message:'Компания с таким ИНН или названием уже есть в общей базе.' })
  if (error.message.includes('COMPANY_NOT_FOUND')) throw createError({ statusCode:404, message:'Компания не найдена или недоступна.' })
  if (error.message.includes('COMPANY_IN_USE')) throw createError({ statusCode:409, message:'Компания используется в проектах. Сначала уберите её из проектов.' })
  projectFailure(error)
}
export function companyIdentity(event: H3Event, value: Pick<ProjectCounterparty,'inn'|'company'>) {
  return createHmac('sha256',Buffer.from(sharedSecret(event),'base64')).update(value.inn ? `inn:${value.inn}` : `company:${value.company.normalize('NFKC').trim().toLocaleLowerCase('ru').replace(/\s+/g,' ')}`).digest('hex')
}
function decodeCompany(event: H3Event, row: any): ProjectCounterparty {
  const value = openSharedVault(row.encryptedData,sharedSecret(event),`project-company:${row.id}`,1)
  return { ...counterpartySchema.parse(value), id:row.id, isOwnLegalEntity:row.isOwnLegalEntity }
}
export function companyId(event: H3Event) {
  const result = z.uuid().safeParse(getRouterParam(event,'companyId'))
  if (!result.success) throw createError({statusCode:400,message:'Некорректная компания'})
  return result.data
}
export async function projectCompanies(event: H3Event, context: Context, id: string, legacy: ProjectCounterparty[]) {
  let result = await context.client.rpc('project_company_migrate',{ p_actor:context.user.id,p_project:id,p_records:null })
  if (result.error) companyFailure(result.error)
  if (!result.data.migrated) {
    const records = legacy.map(party => {
      const candidateId = randomUUID()
      return { id:candidateId,localId:party.id,identityHash:companyIdentity(event,party),encryptedData:sealSharedVault({...party,id:candidateId},sharedSecret(event),`project-company:${candidateId}`,1) }
    })
    result = await context.client.rpc('project_company_migrate',{p_actor:context.user.id,p_project:id,p_records:records})
    if (result.error) companyFailure(result.error)
  }
  return (result.data.records as any[]).map(row => ({ ...decodeCompany(event,row), id:row.localId, catalogId:row.id })).sort((a,b) => a.company.localeCompare(b.company,'ru'))
}
export async function listProjectCompanies(event: H3Event, context: Context, project?: string): Promise<DirectoryCompany[]> {
  const {data,error} = await context.client.rpc('project_company_list',{p_actor:context.user.id,p_project:project ?? null})
  if (error) companyFailure(error)
  return (data as any[]).map(row => ({...decodeCompany(event,row),ownerId:row.ownerId,revision:row.revision,canEdit:row.canEdit,projectCount:row.projectCount,isOwnLegalEntity:row.isOwnLegalEntity})).sort((a,b)=>a.company.localeCompare(b.company,'ru'))
}
export async function saveProjectCompany(event: H3Event, context: Context, id: string, revision: number, value: Omit<ProjectCounterparty,'id'>, remove = false) {
  const {error} = await context.client.rpc('project_company_mutate',{p_actor:context.user.id,p_id:id,p_revision:revision,p_data:sealSharedVault({...value,id},sharedSecret(event),`project-company:${id}`,1),p_hash:companyIdentity(event,value),p_own:value.isOwnLegalEntity ?? false,p_delete:remove})
  if (error) companyFailure(error)
}
