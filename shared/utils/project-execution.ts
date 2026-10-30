import { z } from 'zod'
import type { ExecutionDocument, ExecutionKit, ExecutionKind, ExecutionTemplate, ExecutionRendered, ExecutionState, ProjectExecution } from '../types/project-execution'
import { estimateAmounts, roundMoney } from './estimate'
export const executionVariables = ['project','contractNumber','contractDate','deadline','number','date','seller','buyer','sellerInn','buyerInn','sellerDirector','buyerDirector','contractAmount','amount','vat','net','percent','balancePercent','paymentTerms','positions','requisites'] as const
const tokenPattern = /\{\{\s*([\w]+)\s*\}\}/g
export function executionTextIssue(value: string) {
  const invalid = [...value.matchAll(tokenPattern)].find(match => !executionVariables.includes(match[1] as typeof executionVariables[number]))
  if (invalid) return `Неизвестная переменная {{${invalid[1]}}}`
  if (value.replace(tokenPattern,'').includes('{{') || value.replace(tokenPattern,'').includes('}}')) return 'Проверьте запись переменных в двойных фигурных скобках'
  return ''
}
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !executionTextIssue(value), 'Проверьте переменные шаблона')
export const executionTemplateSchema = z.object({title:text(200).refine(value => !/\{\{\s*(positions|requisites)\s*\}\}/.test(value),'Таблица и реквизиты доступны только в тексте'),body:text(20000)}).strict()
export const executionDocumentSchema = z.object({number:z.string().trim().max(100),date:z.union([z.literal(''),z.iso.date()]),title:executionTemplateSchema.shape.title.nullable(),body:executionTemplateSchema.shape.body.nullable()}).strict()
export const executionKitSchema = z.object({contractId:z.uuid(),contract:executionDocumentSchema,appendices:z.array(executionDocumentSchema.extend({id:z.uuid()})).max(100).refine(rows=>new Set(rows.map(row=>row.id)).size===rows.length,'Приложения не должны повторяться'),prepayment:z.object({enabled:z.boolean(),percent:z.number().finite().positive().max(100),document:executionDocumentSchema}).strict()}).strict().superRefine((kit,ctx)=>{
 if(kit.appendices.some(doc=>!doc.number))ctx.addIssue({code:'custom',message:'Укажите номер каждого приложения'})
 if(kit.prepayment.enabled&&!kit.prepayment.document.number)ctx.addIssue({code:'custom',message:'Укажите номер счёта'})
 if(new Set(kit.appendices.map(doc=>doc.number)).size!==kit.appendices.length)ctx.addIssue({code:'custom',message:'Номера приложений должны различаться'})
})
export const executionStateSchema = z.object({templates:z.object({contract:executionTemplateSchema,appendix:executionTemplateSchema,invoice:executionTemplateSchema}).strict(),kits:z.array(executionKitSchema).max(200).refine(kits=>new Set(kits.map(kit=>kit.contractId)).size===kits.length,'Повторяющиеся комплекты')}).strict()
export const executionWriteSchema = z.object({revision:z.number().int().min(0),estimateRevision:z.number().int().min(0),state:executionStateSchema}).strict()
export const executionExportSchema = z.object({contractId:z.uuid(),kind:z.enum(['contract','appendix','invoice']),appendixId:z.uuid().optional(),format:z.enum(['docx','pdf'])}).strict()
export function defaultExecutionState(): ExecutionState {
 return {templates:{
  contract:{title:'Договор № {{contractNumber}}',body:'Дата договора: {{contractDate}}\n\n{{seller}}, в лице {{sellerDirector}}, и {{buyer}}, в лице {{buyerDirector}}, согласовали следующие товары и услуги по проекту «{{project}}».\n\nПредмет договора\n{{positions}}\n\nСтоимость по договору: {{contractAmount}}. В том числе НДС: {{vat}}. Стоимость без НДС: {{net}}.\nСрок исполнения: {{deadline}}.\n\nПорядок оплаты\n{{paymentTerms}}\n\nРеквизиты и подписи сторон\n{{requisites}}\n\nИсполнитель ____________________\nЗаказчик ____________________'},
  appendix:{title:'Приложение № {{number}}',body:'К договору № {{contractNumber}} от {{contractDate}}\nДата приложения: {{date}}\n\nИсполнитель: {{seller}}\nЗаказчик: {{buyer}}\n\nСпецификация\n{{positions}}\n\nСтоимость: {{amount}}. В том числе НДС: {{vat}}.\nСрок исполнения: {{deadline}}.\n\n{{requisites}}\n\nИсполнитель ____________________\nЗаказчик ____________________'},
  invoice:{title:'Счёт на предоплату № {{number}}',body:'Дата: {{date}}\nДоговор № {{contractNumber}} от {{contractDate}}\n\nПоставщик: {{seller}}\nПокупатель: {{buyer}}\n\n{{positions}}\n\nПредоплата: {{percent}}% от {{contractAmount}}.\nИтого к оплате: {{amount}}. В том числе НДС: {{vat}}.\n\nРеквизиты сторон\n{{requisites}}\n\nРуководитель ____________________'}
 },kits:[]}
}
export function defaultExecutionKit(contractId: string): ExecutionKit {
 const doc = (): ExecutionDocument => ({number:'',date:'',title:null,body:null})
 return {contractId,contract:doc(),appendices:[],prepayment:{enabled:false,percent:50,document:doc()}}
}
export const executionMoney = (value: number) => value.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' ₽'
export const executionDate = (value: string) => value ? value.split('-').reverse().join('.') : 'Не указан'
export function renderExecutionDocument(data: ProjectExecution, contractId: string, kind: ExecutionKind, appendixId?: string): ExecutionRendered {
 const contract = data.contracts.find(row=>row.id===contractId)
 if(!contract||contract.issue||contract.amount===null||contract.vatAmount===null)throw Error(contract?.issue||'Договор недоступен. Проверьте смету и реестр договоров.')
 const kit = data.state.kits.find(row=>row.contractId===contractId)??defaultExecutionKit(contractId)
 const doc = kind==='contract'?kit.contract:kind==='invoice'?kit.prepayment.document:kit.appendices.find(row=>row.id===appendixId)
 if(!doc)throw Error('Приложение не найдено')
 if(kind==='invoice'&&!kit.prepayment.enabled)throw Error('Счёт на предоплату не включён')
 return renderProjectDocument(data,contractId,kind,doc,data.state.templates[kind])
}
export function renderProjectDocument(data:ProjectExecution,contractId:string,kind:ExecutionKind|'act'|'upd',doc:ExecutionDocument,source:ExecutionTemplate):ExecutionRendered {
 const contract=data.contracts.find(row=>row.id===contractId)
 if(!contract||contract.issue||contract.amount===null||contract.vatAmount===null)throw Error(contract?.issue||'Договор недоступен. Проверьте смету и реестр договоров.')
 const kit=data.state.kits.find(row=>row.contractId===contractId)??defaultExecutionKit(contractId)
 const seller=data.estimate.counterparties.find(row=>row.id===contract.sellerId)!,buyer=data.estimate.counterparties.find(row=>row.id===contract.buyerId)!
 const amount=kind==='invoice'?roundMoney(contract.amount*kit.prepayment.percent/100):contract.amount
 const vat=kind==='invoice'?roundMoney(contract.vatAmount*kit.prepayment.percent/100):contract.vatAmount
 const values: Record<string,string> = {project:data.estimate.projectName,contractNumber:contract.number,contractDate:executionDate(contract.date),deadline:executionDate(contract.deadline),number:kind==='contract'?contract.number:doc.number,date:executionDate(kind==='contract'?contract.date:doc.date),seller:seller.company,buyer:buyer.company,sellerInn:seller.inn,buyerInn:buyer.inn,sellerDirector:seller.director||'________________',buyerDirector:buyer.director||'________________',contractAmount:executionMoney(contract.amount),amount:executionMoney(amount),vat:executionMoney(vat),net:executionMoney(roundMoney(amount-vat)),percent:String(kit.prepayment.enabled?kit.prepayment.percent:0),balancePercent:String(kit.prepayment.enabled?roundMoney(100-kit.prepayment.percent):100),paymentTerms:kit.prepayment.enabled?`Предоплата ${kit.prepayment.percent}% от суммы договора (${executionMoney(roundMoney(contract.amount*kit.prepayment.percent/100))}). Оставшаяся часть — ${roundMoney(100-kit.prepayment.percent)}%. Расчёты производятся безналично по реквизитам продавца / исполнителя.`:'Предоплата не предусмотрена. Порядок и сроки окончательного расчёта согласовываются сторонами.'}
 const replace=(value:string)=>value.replace(tokenPattern,(_,key)=>values[key]??'')
 const body=doc.body??source.body,title=doc.title??source.title
 const issue=executionTextIssue(body)||executionTextIssue(title);if(issue)throw Error(issue)
 const amounts=estimateAmounts(data.estimate.items)
 const chosen=data.estimate.items.filter(item=>contract.source==='revenue'?!item.internalCost:contract.itemIds.includes(item.id))
 let table: ExecutionRendered['blocks'][number] = kind==='invoice'?{type:'table',headers:['Основание','Сумма, ₽'],rows:[[ `Предоплата ${kit.prepayment.percent}% по договору № ${contract.number}`,executionMoney(amount)]]}:contract.source==='revenue'?{type:'table',headers:['Наименование','Количество','Ед.'],rows:chosen.map(item=>[item.name,String(item.quantity),item.unit])}:{type:'table',headers:['Наименование','Кол-во','Ед.','Цена, ₽','Сумма, ₽'],rows:chosen.map(item=>[item.name,String(item.quantity),item.unit,executionMoney(item.price),executionMoney(amounts[data.estimate.items.findIndex(row=>row.id===item.id)]!.total)])}
 if((kind==='act'||kind==='upd')&&contract.source==='revenue'){
  const quantityField=data.estimate.details.fields.find(field=>field.type==='number'&&/^(тираж|количество)(?:[ ,]|$)/i.test(field.label.trim())&&Number(field.value)>0)
  const quantity=quantityField?Number(quantityField.value):0,name=data.estimate.details.description||`Исполнение по договору № ${contract.number}`
  const unit=quantityField?.label.split(',').slice(1).join(',').trim()||'—'
  const price=quantity>0?roundMoney(amount/quantity):0
  table=quantity>0&&roundMoney(price*quantity)===amount?{type:'table',headers:['Наименование','Кол-во','Ед.','Цена, ₽','Сумма, ₽'],rows:[[name,String(quantity),unit,executionMoney(price),executionMoney(amount)]]}:quantity>0?{type:'table',headers:['Наименование','Количество','Сумма, ₽'],rows:[[name,String(quantity),executionMoney(amount)]]}:{type:'table',headers:['Наименование','Сумма, ₽'],rows:[[name,executionMoney(amount)]]}
 }
 const requisites=[seller,buyer].map((p,i)=>`${i?'Покупатель / заказчик':'Продавец / исполнитель'}: ${p.company}\nИНН: ${p.inn||'Не указан'}; КПП: ${p.kpp||'Не указан'}\nРуководитель: ${p.director||'Не указан'}\nАдрес: ${p.address||'Не указан'}\nРасчётный счёт: ${p.bankAccount||'Не указан'}`).join('\n\n')
 const blocks:ExecutionRendered['blocks']=[]
 for(const part of body.split(/(\{\{\s*(?:positions|requisites)\s*\}\})/g)){
  if(/^\{\{\s*positions\s*\}\}$/.test(part)) { if(table.rows.length)blocks.push(table) }
  else if(/^\{\{\s*requisites\s*\}\}$/.test(part))blocks.push({type:'text',text:requisites})
  else if(part.trim())blocks.push({type:'text',text:replace(part).trim()})
 }
 return {title:replace(title),blocks,amount,vat}
}
