import { contractFieldsSchema } from './contract-fields'
import { z } from 'zod'
import type { RegisterContract } from '../types/contract-register'
export const standaloneContractSchema = z.object({ noDeadline:z.boolean().optional(), autoRenew:z.boolean().optional(), sellerCatalogId:z.uuid().optional(), buyerCatalogId:z.uuid().optional(), fields:contractFieldsSchema.default([]), code: z.string().trim().max(30).default(''), number: z.string().trim().min(1).max(100), seller: z.string().trim().min(1).max(300), buyer: z.string().trim().min(1).max(300), date: z.union([z.literal(''),z.iso.date()]), deadline: z.union([z.literal(''),z.iso.date()]), amount: z.number().finite().min(0).max(1e12).refine(value=>Math.abs(value*100-Math.round(value*100))<0.0001,'Укажите сумму с точностью до копеек').nullable(), vatAmount: z.number().finite().min(0).max(1e12).refine(value=>Math.abs(value*100-Math.round(value*100))<0.0001,'Укажите сумму с точностью до копеек').nullable(), notes: z.string().max(10000).default('') }).strict().superRefine((v,c) => {
  if(v.noDeadline&&(v.autoRenew||v.deadline))c.addIssue({code:'custom',message:'Для договора без срока уберите дату окончания и автопродление'})
  if (v.date && v.deadline && v.deadline < v.date) c.addIssue({code:'custom',message:'Срок не может быть раньше даты договора'})
  if (v.vatAmount !== null && (v.amount === null || v.vatAmount > v.amount)) c.addIssue({code:'custom',message:'НДС не может превышать сумму договора'})
})
export const registerFilterSchema = z.object({ legalEntityId:z.union([z.literal('all'),z.uuid()]).default('all'),counterpartyId:z.union([z.literal('all'),z.uuid()]).default('all'), q:z.string().trim().max(300).default(''), origin:z.enum(['all','project','standalone']).default('all'), projectId:z.union([z.literal('all'),z.uuid()]).default('all'), source:z.enum(['all','revenue','expenses','manual']).default('all'), status:z.enum(['all','overdue','upcoming','no-deadline','auto-renew']).default('all'), from:z.union([z.literal(''),z.iso.date()]).default(''), until:z.union([z.literal(''),z.iso.date()]).default(''), files:z.enum(['all','yes','no']).default('all'), sort:z.enum(['date-desc','date-asc','deadline','amount-desc','number','number-asc','number-desc','project-asc','project-desc','seller-asc','seller-desc','buyer-asc','buyer-desc','deadline-asc','deadline-desc','amount-asc','vat-asc','vat-desc','files-asc','files-desc']).default('date-desc'), pageSize:z.coerce.number().refine(v=>[10,25,50,100].includes(v),'Некорректный размер страницы').default(25), page:z.coerce.number().int().min(1).max(100000).default(1) }).strict().refine(v => !v.from || !v.until || v.from <= v.until,'Проверьте диапазон дат')
export type RegisterFilters = z.infer<typeof registerFilterSchema>
export function filterRegisterContracts(rows: RegisterContract[], filters: RegisterFilters, today: string) {
  const words=filters.q.toLocaleLowerCase('ru').replace(/ё/g,'е').split(/\s+/).filter(Boolean)
  const partyMatches=(r:RegisterContract,id:string)=>id==='all'||r.sellerCatalogId===id||r.buyerCatalogId===id
  const result=rows.filter(r => partyMatches(r,filters.legalEntityId)&&partyMatches(r,filters.counterpartyId)&& (filters.origin==='all'||r.origin===filters.origin) && (filters.projectId==='all'||r.projectId===filters.projectId) && (filters.source==='all'||r.source===filters.source) && (!filters.from||!!r.date&&r.date>=filters.from) && (!filters.until||!!r.date&&r.date<=filters.until) && (filters.files==='all'||(filters.files==='yes'?r.fileCount>0:!r.fileCount)) && (filters.status==='all'||(filters.status==='auto-renew'?!!r.autoRenew:filters.status==='no-deadline'?!!r.noDeadline||!r.deadline:filters.status==='overdue'?!r.autoRenew&&!!r.deadline&&r.deadline<today:!!r.deadline&&r.deadline>=today)) && words.every(w => [r.number,r.seller,r.buyer,r.projectName,...(r.fields||[]).flatMap(f=>[f.label,f.value])].join(' ').toLocaleLowerCase('ru').replace(/ё/g,'е').includes(w)))
  const compare=(a:string,b:string)=>a.localeCompare(b,'ru',{numeric:true})
  const sort=filters.sort==='number'?'number-asc':filters.sort==='deadline'?'deadline-asc':filters.sort
  const key=sort.slice(0,sort.lastIndexOf('-')),direction=sort.endsWith('-desc')?-1:1
  const value=(r:RegisterContract):string|number|null=>key==='project'?r.projectName:key==='seller'?r.seller:key==='buyer'?r.buyer:key==='deadline'?(r.noDeadline?'':r.deadline):key==='date'?r.date:key==='amount'?r.amount:key==='vat'?r.vatAmount:key==='files'?r.fileCount:r.number
  result.sort((a,b)=>{
    const av=value(a),bv=value(b),emptyA=av===null||av==='',emptyB=bv===null||bv===''
    if(emptyA!==emptyB)return emptyA?1:-1
    const order=typeof av==='number'&&typeof bv==='number'?av-bv:compare(String(av??''),String(bv??''))
    return order*direction||compare(a.projectName,b.projectName)||compare(a.id,b.id)
  })
  return result
}
