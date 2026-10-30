import { z } from 'zod'
import { executionTemplateSchema } from './project-execution'
import type { DocumentTemplateKind,DocumentTemplateStage } from '../types/document-templates'
export const documentTemplateKinds={execution:[{label:'Договор',value:'contract'},{label:'Приложение',value:'appendix'},{label:'Счёт на предоплату',value:'invoice'}],closing:[{label:'Акт приёмки',value:'act'},{label:'УПД',value:'upd'}]} as const
export const documentTemplateKindLabel=(kind:DocumentTemplateKind)=>[...documentTemplateKinds.execution,...documentTemplateKinds.closing].find(k=>k.value===kind)!.label
export const documentTemplateStageSchema=z.enum(['execution','closing'])
const kind=z.enum(['contract','appendix','invoice','act','upd'])
export const documentTemplateInputSchema=z.object({stage:documentTemplateStageSchema,kind,name:z.string().trim().min(1,'Укажите название шаблона').max(120),description:z.string().trim().max(500),template:executionTemplateSchema}).strict().refine(value=>documentTemplateKinds[value.stage].some(k=>k.value===value.kind),'Тип документа не относится к выбранному этапу')
export const documentTemplateUpdateSchema=documentTemplateInputSchema.safeExtend({revision:z.number().int().positive()})
export const documentTemplateQuerySchema=z.object({stage:documentTemplateStageSchema,q:z.string().trim().max(200).default(''),kind:kind.optional(),owner:z.enum(['all','mine']).default('all'),page:z.coerce.number().int().min(1).max(100000).default(1)}).strict().refine(value=>!value.kind||documentTemplateKinds[value.stage].some(k=>k.value===value.kind),'Тип документа не относится к этапу')
export function templateSearchMatches(text:string,query:string){const normalized=text.normalize('NFKC').toLocaleLowerCase('ru');return query.normalize('NFKC').toLocaleLowerCase('ru').split(/\s+/).filter(Boolean).every(token=>normalized.includes(token))}
export const stageTitle=(stage:DocumentTemplateStage)=>stage==='execution'?'Исполнение':'Подтверждение и закрывающие акты'
