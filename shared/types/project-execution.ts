import type { ProjectEstimate } from './estimate'
import type { ProjectContract } from './project-contracts'
export type ExecutionKind = 'contract' | 'appendix' | 'invoice'
export interface ExecutionTemplate { title: string; body: string }
export interface ExecutionDocument { number: string; date: string; title: string | null; body: string | null }
export interface ExecutionAppendix extends ExecutionDocument { id: string }
export interface ExecutionKit { contractId: string; contract: ExecutionDocument; appendices: ExecutionAppendix[]; prepayment: { enabled: boolean; percent: number; document: ExecutionDocument } }
export interface ExecutionState { templates: Record<ExecutionKind, ExecutionTemplate>; kits: ExecutionKit[] }
export interface ProjectExecution { revision: number; estimateRevision: number; state: ExecutionState; contracts: ProjectContract[]; estimate: ProjectEstimate & {projectName: string} }
export interface ExecutionRendered { title: string; blocks: ({type: 'text'; text: string} | {type: 'table'; headers: string[]; rows: string[][]})[]; amount: number; vat: number }
