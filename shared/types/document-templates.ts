import type { ExecutionTemplate,ExecutionKind } from './project-execution'
import type { ClosingKind } from './project-closing'
export type DocumentTemplateStage='execution'|'closing'
export type DocumentTemplateKind=ExecutionKind|ClosingKind
export interface DocumentTemplateInput {stage:DocumentTemplateStage;kind:DocumentTemplateKind;name:string;description:string;template:ExecutionTemplate}
export interface DocumentTemplateSummary {id:string;stage:DocumentTemplateStage;kind:DocumentTemplateKind;name:string;description:string;title:string;excerpt:string;ownerId:string;author:string;canEdit:boolean;revision:number;updatedAt:string}
export interface DocumentTemplate extends DocumentTemplateSummary {template:ExecutionTemplate}
export interface DocumentTemplateList {items:DocumentTemplateSummary[];total:number;page:number;pageSize:number}
export interface DocumentTemplateApplication {kind:DocumentTemplateKind;template:ExecutionTemplate;target:'project'|'document'}
