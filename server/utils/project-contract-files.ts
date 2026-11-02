import type { H3Event } from 'h3'
import type { ContractFile } from '../../shared/types/project-contract-files'
import { openSharedVault } from './shared-crypto'

export const contractFileBucket = 'project-contracts'
export async function readContractFiles(event: H3Event, write = false) {
  const context = await requireProjectsUser(event), project = projectId(event), contract = contractId(event)
  const { data, error } = await context.client.rpc('project_contract_files_access', { p_actor: context.user.id, p_project: project, p_contract: contract, p_write: write })
  if (error) contractFileFailure(error)
  const files = (data as any[]).map(row => ({ ...openSharedVault<ContractFile>(row.encryptedData, sharedSecret(event), `contract-file:${project}:${contract}:${row.id}`, 1), id: row.id }))
  return { context, project, contract, files }
}
export function contractFileFailure(error: { message: string; code?: string }) {
  if (error.message.includes('FILE_LIMIT')) throw createError({ statusCode: 400, message: 'К договору можно прикрепить до 20 файлов' })
  if (error.message.includes('FILE_NOT_FOUND')) throw createError({ statusCode: 404, message: 'Файл не найден' })
  return contractFailure(error)
}
export function contractFilePath(project: string, contract: string, file: string) { return `${project}/${contract}/${file}` }
