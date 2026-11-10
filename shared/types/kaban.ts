import type { TeamPerson, TeamUnit } from './team'
export interface KabanStage { id: string; name: string; color: string; done: boolean }
export interface KabanTodo { id: string; text: string; done: boolean }
export interface KabanTaskData { title: string; description: string; dueOn: string; todos: KabanTodo[] }
export interface KabanTask extends KabanTaskData { id: string; boardId: string; stageId: string; creatorId: string; participantIds: string[]; closerIds: string[]; locations: {boardId:string;vaultId:string|null}[]; canEdit:boolean; categoryIds: string[]; revision: number; createdAt: string; updatedAt: string; fileCount: number; archived: boolean }
export interface KabanCategory { id: string; name: string; parentId: string | null; color: string; archived: boolean; revision: number; archiveRoot?: string | null; legacyId?: string | null; boardId?: string }
export interface KabanEvent { id: string; changeId?: string; createdAt: string; actor: TeamPerson | null; label: string; details: string[] }
export interface KabanBoard { id: string; vaultId: string | null; revision: number; stages: KabanStage[] }
export interface KabanFile { id: string; name: string; type: string; size: number; createdAt: string }
export interface KabanWorkspace { board: KabanBoard; tasks: KabanTask[]; categories: KabanCategory[]; people: TeamPerson[]; units: TeamUnit[]; eligibleIds: string[]; canEdit: boolean; canManage: boolean; categoryIds: string[] | null }
