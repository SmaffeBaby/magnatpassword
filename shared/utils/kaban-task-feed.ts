import type { Project } from '../types/projects'
import type { KabanWorkspace } from '../types/kaban'
export interface KabanTaskFeed { boards: {project: Project; workspace: KabanWorkspace}[]; failed: number }
// Reuse the authenticated board snapshot when returning from a project to the task list.
export function updateKabanTaskFeed(feed: KabanTaskFeed | undefined, workspace: KabanWorkspace) {
 if(!feed||!workspace.board.projectId||!feed.boards.some(item=>item.project.id===workspace.board.projectId))return feed
 return {...feed,boards:feed.boards.map(item=>item.project.id===workspace.board.projectId?{...item,workspace}:item)}
}
