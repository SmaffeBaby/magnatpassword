import type { ExecutionDocument, ExecutionTemplate, ProjectExecution } from './project-execution'
export type ClosingKind = 'act' | 'upd'
export type ClosingCheck = 'contractSigned' | 'appendicesSigned' | 'advancePaid' | 'fulfilled' | 'actSigned' | 'updSigned'
export interface ClosingKit { contractId: string; act: ExecutionDocument; upd: {enabled:boolean;document:ExecutionDocument}; confirmations:Record<ClosingCheck,boolean>; deadlines?:Partial<Record<ClosingCheck,string>> }
export interface ClosingState { templates:Record<ClosingKind,ExecutionTemplate>;kits:ClosingKit[] }
export interface ClosingAudit { at:string;by:string }
export interface ProjectClosing { revision:number;estimateRevision:number;executionRevision:number;state:ClosingState;execution:ProjectExecution;needsReview:string[];audit:Record<string,Partial<Record<ClosingCheck,ClosingAudit>>> }
