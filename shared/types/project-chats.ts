import type { Credential } from './vault'
import type { ProjectDocumentMetadata } from './project-documents'
export interface ProjectChatMember { userId: string; lastReadSeq: number }
export interface ProjectChat {
  id: string; name: string; createdBy: string | null; revision: number; muted: boolean
  createdAt: string; updatedAt: string; lastSeq: number; unreadCount: number
  members: ProjectChatMember[]
}
export interface ProjectChatHeader {
  avatar: string
  peer: { name: string; avatarUrl: string; lastSeenAt: string | null; online: boolean } | null
}
export interface ProjectChatParticipant {
  userId: string
  name: string
  avatarUrl: string
  lastSeenAt: string | null
  online: boolean
}
export type ChatMaterialTab = 'media' | 'files' | 'links' | 'gifs'
export type ChatMaterial = { seq: number } & ({ file: ProjectChatFile; url?: never } | { url: string; file?: never })
export interface ChatMaterialPage { items: ChatMaterial[]; nextBefore: number | null }
export interface ProjectChatFile extends ProjectDocumentMetadata { id: string; documentId: string | null; revision: number; canEdit: boolean }
export interface ProjectChatPoll { question: string; options: { id: string; label: string }[] }
export interface ProjectChatTodo { title: string; items: { id: string; label: string }[] }
export interface ChatTaskReference { taskId: string; boardId: string; title: string; projectId?: string | null; vaultId?: string | null; available?: boolean; completed?: boolean }
export interface ChatMessageDraft {
  text: string
  files: ProjectChatFile[]
  passwordIds: string[]
  nonce: string
  retry: boolean
  sending: boolean
  tasks: Pick<ChatTaskReference, 'taskId' | 'boardId' | 'title'>[]
  poll?: ProjectChatPoll
  todo?: ProjectChatTodo
}
export interface ChatDirectoryItem extends ProjectChat { lastMessagePreview?: string; projectId: string | null; projectName?: string; people: { userId: string; fullName: string; avatarUrl: string }[] }
export interface ProjectChatMessage {
  id: string; seq: number; authorId: string | null; authorName?: string; authorAvatarUrl?: string; createdAt: string
  revision: number; editedAt: string | null; deletedAt: string | null; pinned: boolean
  text: string; passwordIds: string[]; files: ProjectChatFile[]; mentionIds: string[]
  tasks: ChatTaskReference[]; passwordCopies: Credential[]; forwardedFrom?: { authorId: string | null; authorName: string };
  poll?: ProjectChatPoll; todo?: ProjectChatTodo; pollClosed: boolean
  votes: { userId: string; optionId: string }[]
  todoStates: { itemId: string; done: boolean; updatedBy: string | null }[]
}
export interface ProjectChatPage { messages: ProjectChatMessage[]; nextBefore: number | null }
