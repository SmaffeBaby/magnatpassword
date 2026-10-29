import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import type { H3Event } from 'h3'
import type { EstimateContent } from '../../shared/types/estimate'
import { normalizeEstimate, estimateContentSchema } from '../../shared/utils/estimate'
import { openSharedVault, sealSharedVault } from './shared-crypto'

export async function projectEstimate(event: H3Event, write?: { revision: number } & Partial<EstimateContent>) {
  const context = await requireProjectsUser(event), id = projectId(event)
  const args = { p_actor: context.user.id, p_id: id, p_revision: null as number | null, p_data: null as unknown }
  let { data, error } = await context.client.rpc('project_estimate', args)
  if (error) projectFailure(error)
  let content = normalizeEstimate(data.encryptedData ? openSharedVault(data.encryptedData, sharedSecret(event), `project-estimate:${id}`, 1) : {})
  content.counterparties = await projectCompanies(event, context, id, content.counterparties)
  if (write) {
    const { revision, ...patch } = write
    const partySignature = (rows: typeof content.counterparties) => JSON.stringify(rows.map(row => [row.id,row.catalogId,row.company,row.inn,row.kpp,row.director,row.address,row.bankAccount,row.isOwnLegalEntity]).sort((a,b) => String(a[0]).localeCompare(String(b[0]))))
    if (patch.counterparties && partySignature(patch.counterparties) !== partySignature(content.counterparties)) throw createError({statusCode:400,message:'Выбирайте компании из общей базы. Реквизиты редактируются на странице «Проекты».'})
    const parsed = estimateContentSchema.safeParse({ ...content, ...patch })
    if (!parsed.success) throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message || 'Проверьте данные сметы' })
    content = parsed.data
    await checkProjectContractReferences(event,context,id,content)
    if (JSON.stringify(content).length > 12_000_000) throw createError({ statusCode: 413, message: 'Смета слишком большая. Уменьшите изображения.' })
    const result = await context.client.rpc('project_estimate', { ...args, p_revision: revision, p_data: sealSharedVault(content, sharedSecret(event), `project-estimate:${id}`, 1) })
    if (result.error) projectFailure(result.error)
    data = result.data
  }
  return { revision: data.revision as number, updatedAt: data.updatedAt as string | null, projectName: data.projectName as string,
    ...content }
}
export async function renderEstimate(snapshot: unknown, format: 'xlsx' | 'pdf'): Promise<Buffer> {
  return new Promise((done, reject) => {
    const renderer = spawn(process.env.FINANCE_REPORT_PYTHON || 'python3', [resolve('scripts/project-estimate.py'), format], { stdio: ['pipe','pipe','pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' } })
    const chunks: Buffer[] = []; let size = 0, failed = false
    const fail = () => { if (failed) return; failed = true; clearTimeout(timer); renderer.kill(); reject(createError({ statusCode: 503, message: 'Не удалось сформировать файл сметы. Повторите попытку.' })) }
    const timer = setTimeout(fail, 60000)
    renderer.on('error', fail); renderer.stdin.on('error', fail); renderer.stderr.resume()
    renderer.stdout.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 30 * 1024 * 1024) fail(); else chunks.push(chunk) })
    renderer.on('close', code => { clearTimeout(timer); if (failed) return; if (code || !size) { fail(); return }; done(Buffer.concat(chunks)) })
    renderer.stdin.end(JSON.stringify(snapshot))
  })
}
