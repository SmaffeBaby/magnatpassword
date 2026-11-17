export function shouldSendChatKey(event: { key: string; shiftKey: boolean; isComposing: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }) {
  return event.key === 'Enter' && !event.shiftKey && !event.isComposing && !event.ctrlKey && !event.altKey && !event.metaKey
}
export function chatMentionHandle(name: string) { return name.normalize('NFKC').replace(/[^\p{L}\p{N}_]/gu, '') || 'Участник' }
export function chatMentionOptions(members: { id: string; name: string }[]) {
  return members.map(member => {
    const base = chatMentionHandle(member.name)
    const duplicate = members.some(other => other.id !== member.id && chatMentionHandle(other.name).toLocaleLowerCase('ru') === base.toLocaleLowerCase('ru'))
    return { ...member, handle: duplicate ? `${base}_${member.id.slice(0, 8)}` : base }
  })
}
export function chatMentionIds(text: string, members: { id: string; name: string }[]) {
  const handles = new Set([...text.matchAll(/(?<![\p{L}\p{N}_])@([\p{L}\p{N}_]+)/gu)].map(match => match[1]!.toLocaleLowerCase('ru')))
  return chatMentionOptions(members).filter(member => handles.has(member.handle.toLocaleLowerCase('ru'))).map(member => member.id)
}
export function firstUnreadChatSeq(messages: { seq: number; authorId: string | null; deletedAt?: string | null }[], boundary: number | null, userId?: string) {
  if (boundary === null || boundary < 0) return undefined
  return messages.find(message => message.seq > boundary && message.authorId !== userId && !message.deletedAt)?.seq
}
export function chatSelectionRange<T extends { seq: number; authorId: string | null; deletedAt?: string | null }>(messages: T[], anchor: number, target: number, actor: string) {
  const lower = Math.min(anchor,target), upper = Math.max(anchor,target)
  return messages.filter(message => message.seq >= lower && message.seq <= upper && message.authorId === actor && !message.deletedAt)
}
