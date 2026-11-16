import type { H3Event } from 'h3'
import type { AssistantConversation, AssistantReply } from '../../shared/types/assistant'
import type { RegisterFile } from '../../shared/types/contract-register'
import { contractAnswer, isContractQuestion } from '../../shared/utils/assistant-contracts'
import { todayDate } from '../../shared/utils/subscriptions'
import { registryRows } from './contract-register'
import { assistantFetch } from './assistant-context'

export async function assistantRegistryRead(event: H3Event, question: string, memory: AssistantConversation = {}, page = '', projectId?: string): Promise<AssistantReply | null> {
  if (!isContractQuestion(question,memory,page)) return null
  // Preserve document rendering and the project-specific reader outside the registry.
  if (memory.topic==='project' && projectId && page!=='/contract-register' && !/реестр/iu.test(question) || /(?:текст|содержим|полный документ).*проект|проект.*(?:текст|содержим|полный документ)/iu.test(question)) return null
  const rows = await registryRows(event)
  const answer = contractAnswer(rows,question,memory,todayDate())
  if (!answer.files || !answer.selected) return answer.reply
  const row = answer.selected
  const {files} = await assistantFetch<{files:RegisterFile[]}>(event,`/api/contract-register/${row.origin}/${row.id}/files`)
  return { ...answer.reply, message: answer.reply.message + (files.length ? `\nДоступно вложений: ${files.length}. Их можно скачать ниже.` : '\nУ этого договора нет доступных вложений.'), downloads: files.map(file=>({kind:'registry' as const,origin:row.origin,contractId:row.id,fileId:file.id,name:file.name,size:file.size,source:`Договор ${row.number}${file.kind==='supplement'?' · Доп. соглашение':''}`})) }
}
