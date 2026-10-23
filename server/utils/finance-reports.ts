import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import type { H3Event } from 'h3'
import { z } from 'zod'
import type { FinanceReportRequest, FinanceReportSummary } from '../../shared/types/finance-reports'
import type { VaultSource } from '../../shared/types/sharing'
import { projectSharedCards } from '../../shared/utils/shared-card-sources'
import { currencyTotals, sourcePayments } from '../../shared/utils/subscription-finances'
import { dayDifference, todayDate } from '../../shared/utils/subscriptions'
import { openSharedVault } from './shared-crypto'

const vaultIdSchema = z.union([z.literal('personal'), z.uuid()])
export const financeReportRequestSchema = z.object({
  title: z.string().trim().min(1).max(120), from: subscriptionDateSchema, to: subscriptionDateSchema,
  vaultIds: z.array(vaultIdSchema).min(1).max(100), currency: z.enum(['all','RUB','USD','EUR','CNY']), search: z.string().trim().max(300)
}).strict().refine(value => value.from <= value.to && dayDifference(value.from,value.to) <= 3660, 'Invalid report period')

export async function reportSources(event:H3Event, context:Awaited<ReturnType<typeof requireSharedUser>>, ids:string[]):Promise<VaultSource[]> {
  const selected=[...new Set(ids)], sources:VaultSource[]=[]
  const groupIds=selected.filter(id=>id!=='personal')
  if(groupIds.length){
    const {data:memberships,error}=await context.client.from('shared_vault_members').select('vault_id').eq('user_id',context.user.id).in('vault_id',groupIds)
    if(error)throw createError({statusCode:503,message:'Не удалось проверить доступ к хранилищам'})
    if(memberships.length!==groupIds.length)throw createError({statusCode:403,message:'Одно из выбранных хранилищ больше недоступно'})
    const {data:groups,error:failure}=await context.client.from('shared_vaults').select('*').in('id',groupIds).order('name')
    if(failure)throw createError({statusCode:503,message:'Не удалось загрузить хранилища для отчёта'})
    for(const group of groups)sources.push({id:group.id,name:group.name,data:decodeShared(event,group)})
  }
  if(selected.includes('personal')){
    const row=await personalRow(context)
    if(row?.encryption_mode==='client')throw createError({statusCode:409,message:'Сначала откройте личное хранилище'})
    const data=row?openPersonal(event,row):{version:1 as const,entries:[],categories:[]}
    sources.unshift({id:'personal',name:data.name||'Личное',data})
  }
  return projectSharedCards(sources,await visibleSharedCards(event,context))
}
export function reportSnapshot(request:FinanceReportRequest,sources:VaultSource[],id:string,createdAt:string){
  const search=request.search.toLowerCase()
  const payments=sourcePayments(sources).filter(payment=>(request.currency==='all'||payment.currency===request.currency)&&todayDate(new Date(payment.paidAt))>=request.from&&todayDate(new Date(payment.paidAt))<=request.to&&`${payment.service} ${payment.label} ${payment.vaultName}`.toLowerCase().includes(search)).sort((a,b)=>a.paidAt.localeCompare(b.paidAt)||a.service.localeCompare(b.service,'ru'))
  if(payments.length>20000)throw createError({statusCode:422,message:'Слишком много оплат для одного PDF. Выберите меньший период или отдельное хранилище.'})
  const serviceKey=(payment:typeof payments[number])=>`${payment.sharedCardId?'shared:'+payment.sharedCardId:payment.vaultId+'/'+payment.entryId}/${payment.fieldId}`
  const summary:FinanceReportSummary={id,title:request.title,from:request.from,to:request.to,createdAt,vaultNames:sources.map(source=>source.name),currency:request.currency,search:request.search,paymentCount:payments.length,serviceCount:new Set(payments.map(serviceKey)).size,totals:currencyTotals(payments),filename:`finance-report_${request.from}_${request.to}_${id.slice(0,8)}.pdf`}
  // Only payment data enters the report; credentials and notes remain in their vaults.
  return {summary,payments:payments.map(payment=>({id:payment.id,serviceKey:serviceKey(payment),service:payment.service,label:payment.label,amount:payment.amount,amountCents:Math.round(payment.amount*100),currency:payment.currency,paidOn:todayDate(new Date(payment.paidAt)),periodFrom:payment.periodFrom,periodUntil:payment.periodUntil,vaultNames:payment.vaultNames}))}
}
export async function renderFinanceReport(snapshot:ReturnType<typeof reportSnapshot>):Promise<Buffer>{
  return new Promise((resolvePdf,reject)=>{
    const renderer=spawn(process.env.FINANCE_REPORT_PYTHON||'python3',[resolve('scripts/finance-report.py')],{stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}})
    const chunks:Buffer[]=[];let size=0,failed=false
    const fail=()=>{if(failed)return;failed=true;clearTimeout(timer);renderer.kill();reject(createError({statusCode:503,message:'Не удалось сформировать PDF. Повторите попытку.'}))}
    const timer=setTimeout(fail,60000)
    renderer.on('error',fail)
    renderer.stdin.on('error',fail)
    renderer.stderr.resume()
    renderer.stdout.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>20*1024*1024){fail();return}chunks.push(chunk)})
    renderer.on('close',code=>{clearTimeout(timer);if(failed)return;if(code!==0||!size){fail();return}const pdf=Buffer.concat(chunks);if(!pdf.subarray(0,5).equals(Buffer.from('%PDF-'))){fail();return}resolvePdf(pdf)})
    renderer.stdin.end(JSON.stringify(snapshot))
  })
}
export function reportContext(userId:string,id:string,part:'summary'|'pdf'){return `finance-report:${userId}:${id}:${part}`}
export function decodeReportSummary(event:H3Event,userId:string,row:{id:string;encrypted_summary:any}):FinanceReportSummary{
  return openSharedVault<FinanceReportSummary>(row.encrypted_summary,sharedSecret(event),reportContext(userId,row.id,'summary'),1)
}
