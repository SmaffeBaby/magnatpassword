import { z } from 'zod'
import type { ProjectContract } from '../types/project-contracts'
import type { ClosingKit,ClosingState,ClosingKind,ProjectClosing,ClosingCheck } from '../types/project-closing'
import { executionDocumentSchema,executionTemplateSchema,defaultExecutionKit,renderProjectDocument } from './project-execution'
export const closingChecks=[
 {key:'contractSigned',label:'Договор подписан'},
 {key:'appendicesSigned',label:'Приложения подписаны'},
 {key:'advancePaid',label:'Предоплата получена / перечислена'},
 {key:'fulfilled',label:'Товары / работы переданы и приняты'},
 {key:'actSigned',label:'Акт приёмки подписан'},
 {key:'updSigned',label:'УПД подписан'}
] as const
export const closingKitSchema=z.object({contractId:z.uuid(),act:executionDocumentSchema,upd:z.object({enabled:z.boolean(),document:executionDocumentSchema}).strict(),deadlines:z.object({contractSigned:z.union([z.literal(''),z.iso.date()]).optional(),appendicesSigned:z.union([z.literal(''),z.iso.date()]).optional(),advancePaid:z.union([z.literal(''),z.iso.date()]).optional(),fulfilled:z.union([z.literal(''),z.iso.date()]).optional(),actSigned:z.union([z.literal(''),z.iso.date()]).optional(),updSigned:z.union([z.literal(''),z.iso.date()]).optional()}).strict().default({}),confirmations:z.object({contractSigned:z.boolean(),appendicesSigned:z.boolean(),advancePaid:z.boolean(),fulfilled:z.boolean(),actSigned:z.boolean(),updSigned:z.boolean()}).strict()}).strict().superRefine((kit,ctx)=>{
 if(!kit.act.number||kit.upd.enabled&&!kit.upd.document.number)ctx.addIssue({code:'custom',message:'Укажите номера закрывающих документов'})
 if(!kit.act.date||kit.upd.enabled&&!kit.upd.document.date)ctx.addIssue({code:'custom',message:'Укажите даты закрывающих документов'})
 if(!kit.upd.enabled&&kit.confirmations.updSigned)ctx.addIssue({code:'custom',message:'Сначала включите УПД'})
})
export const closingStateSchema=z.object({templates:z.object({act:executionTemplateSchema,upd:executionTemplateSchema}).strict(),kits:z.array(closingKitSchema).max(200).refine(rows=>new Set(rows.map(row=>row.contractId)).size===rows.length,'Повторяющиеся договоры')}).strict()
export const closingWriteSchema=z.object({revision:z.number().int().min(0),estimateRevision:z.number().int().min(0),executionRevision:z.number().int().min(0),state:closingStateSchema}).strict()
export const closingExportSchema=z.object({contractId:z.uuid(),kind:z.enum(['act','upd']),format:z.enum(['docx','pdf'])}).strict()
export const emptyClosingChecks=():Record<ClosingCheck,boolean>=>({contractSigned:false,appendicesSigned:false,advancePaid:false,fulfilled:false,actSigned:false,updSigned:false})
export function defaultClosingState():ClosingState{return {templates:{
 act:{title:'Акт приёмки исполнения № {{number}}',body:'Дата: {{date}}\nК договору № {{contractNumber}} от {{contractDate}}\n\n{{seller}} (передающая сторона) и {{buyer}} (принимающая сторона) составили настоящий акт о нижеследующем.\n\n1. Состав исполнения\n{{positions}}\n\n2. Общая стоимость исполнения: {{amount}}, в том числе НДС {{vat}}.\n\n3. Настоящий акт фиксирует приёмку и не образует дополнительной поставки или обязанности по оплате.\n\n4. Претензий по количеству и видимому качеству на дату подписания нет. Гарантийные обязательства по скрытым дефектам сохраняются согласно договору.\n\n5. Акт составлен в двух экземплярах, по одному для каждой стороны.\n\nРеквизиты и подписи сторон\n{{requisites}}\n\nПередал ____________________\nПринял ____________________'},
 upd:{title:'Универсальный передаточный документ № {{number}}',body:'Статус 2 · первичный учётный документ (демонстрационная форма)\nДата: {{date}}\nОснование: договор № {{contractNumber}} от {{contractDate}}\n\nПродавец / исполнитель: {{seller}}; ИНН {{sellerInn}}\nПокупатель / заказчик: {{buyer}}; ИНН {{buyerInn}}\nГрузоотправитель: {{seller}}. Грузополучатель: {{buyer}}. Валюта: рубль РФ, 643.\n\n{{positions}}\n\nВсего по документу: {{amount}}, в том числе НДС {{vat}}.\nДата отгрузки / выполнения работ: {{date}}.\n\nРеквизиты и подписи сторон\n{{requisites}}\n\nПередал ____________________\nПринял ____________________'}
 },kits:[]}}
export function defaultClosingKit(contract:ProjectContract):ClosingKit{
 const document=(prefix:string)=>({number:(prefix+(contract.code||contract.number)).slice(0,100),date:contract.deadline||'',title:null,body:null})
 return {contractId:contract.id,act:document('АП-'),upd:{enabled:true,document:document('УПД-')},confirmations:emptyClosingChecks(),deadlines:{}}
}
export function requiredClosingChecks(data:Pick<ProjectClosing,'execution'>,kit:ClosingKit){
 const execution=data.execution.state.kits.find(k=>k.contractId===kit.contractId)??defaultExecutionKit(kit.contractId)
 return closingChecks.filter(check=>check.key==='appendicesSigned'?execution.appendices.length>0:check.key==='advancePaid'?execution.prepayment.enabled:check.key==='updSigned'?kit.upd.enabled:true)
}
export function closingProgress(data:Pick<ProjectClosing,'execution'>,kit:ClosingKit){const required=requiredClosingChecks(data,kit),done=required.filter(check=>kit.confirmations[check.key]).length;return {done,total:required.length,complete:done===required.length}}
export function renderClosingDocument(data:ProjectClosing,contractId:string,kind:ClosingKind){
 const contract=data.execution.contracts.find(c=>c.id===contractId);if(!contract)throw Error('Договор недоступен')
 const kit=data.state.kits.find(k=>k.contractId===contractId)??defaultClosingKit(contract)
 if(kind==='upd'&&!kit.upd.enabled)throw Error('УПД не включён в комплект')
 const document=kind==='act'?kit.act:kit.upd.document
 if(!document.number||!document.date)throw Error('Заполните номер и дату документа')
 return renderProjectDocument(data.execution,contractId,kind,document,data.state.templates[kind])
}
