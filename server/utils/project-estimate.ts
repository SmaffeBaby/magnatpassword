import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import type { H3Event } from 'h3'
import type { EstimateItem } from '../../shared/types/estimate'
import { openSharedVault, sealSharedVault } from './shared-crypto'

export async function projectEstimate(event: H3Event, write?: { revision: number; items: EstimateItem[] }) {
  const context = await requireProjectsUser(event), id = projectId(event)
  const { data, error } = await context.client.rpc('project_estimate', {
    p_actor: context.user.id, p_id: id, p_revision: write?.revision ?? null,
    p_data: write ? sealSharedVault(write.items, sharedSecret(event), `project-estimate:${id}`, 1) : null
  })
  if (error) projectFailure(error)
  return { revision: data.revision as number, updatedAt: data.updatedAt as string | null, projectName: data.projectName as string,
    items: data.encryptedData ? openSharedVault<EstimateItem[]>(data.encryptedData, sharedSecret(event), `project-estimate:${id}`, 1) : [] }
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
