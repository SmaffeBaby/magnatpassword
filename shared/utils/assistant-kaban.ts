import type { AssistantConversation } from '../types/assistant'
import type { AssistantKabanDraft } from '../types/assistant-kaban'
export interface AssistantKabanRequest { topic: 'tasks' | 'categories' | 'stages'; draft?: AssistantKabanDraft }
export function assistantKabanRequest(question: string, memory: AssistantConversation = {}, previous = '', page = '/'): AssistantKabanRequest | null {
  const intentText = question.replace(/[«"][^»"]*[»"]/gu, '')
  const explicit = /кабан|канбан|kanban/iu.test(intentText)
  if (!explicit && /проект|смет|парол|подпис|хранилищ.*парол/iu.test(intentText)) return null
  const contextual = explicit || /задач/iu.test(question) || memory.topic === 'kaban' || memory.topic === 'task' || /кабан|канбан|задач/iu.test(previous) || page === '/kaban'
  if (!contextual) return null
  const taskCommand = /(?:созда|добав|измен|помен|редакт|перемест|переимен)[а-яё]*\s+(?:(?:мне|пожалуйста|новую|у)\s+)?задач/iu.test(question)
  const topic = taskCommand ? 'tasks' : /стади|колонк/iu.test(intentText) ? 'stages' : /категор/iu.test(intentText) ? 'categories' : /задач/iu.test(intentText) ? 'tasks' : /^(?:а |и |давай|да[.! ]*$|можем|можно|переимен|измени|поменяй|добав|созда|удал|убер)/iu.test(question.trim()) ? memory.kabanTopic : undefined
  if (!topic) return null
  const capability = /умеешь|умеет|способен|что ты можешь/iu.test(question) || /^(?:как|где|можно ли)/iu.test(question.trim())
  const mutation = !capability && /измен|помен|исправ|редакт|переимен|обнов|созда|добав|завед|удал|убер/iu.test(question)
  if (!mutation || topic === 'tasks') return { topic }
  const quoted = [...question.matchAll(/[«"]([^»"]+)[»"]/gu)].map(m => m[1]!)
  const categoryName = question.match(/категори[а-яё]*\s+[«"]([^»"]+)[»"]/iu)?.[1] || (topic === 'categories' ? quoted[0] : '') || ''
  const replacement = question.match(/\s(?:на|в)\s+[«"]([^»"]+)[»"]/iu)?.[1] || question.match(/(?:название|назови)\s*[:=]\s*([^\n]+)/iu)?.[1] || ''
  const create = topic === 'categories' && /созда|добав|завед/iu.test(question)
  const name = create ? quoted[0] || question.match(/категори[а-яё]*\s*[:—-]?\s+([^\n]+)/iu)?.[1]?.split(/\s+(?:в|для|с цветом|цвет)/iu)[0]?.trim() || '' : replacement
  const stageName = topic === 'stages' ? question.match(/(?:стади[а-яё]*|колонк[а-яё]*)\s+[«"]([^»"]+)[»"]/iu)?.[1] || (topic === memory.kabanTopic ? quoted[0] : '') || '' : ''
  const parentName = create ? question.match(/(?:в|внутри)\s+категори[а-яё]*\s+[«"]([^»"]+)[»"]/iu)?.[1] : undefined
  const stageOperation = /добав|созда/iu.test(question) ? 'add' : /удал|убер/iu.test(question) ? 'remove' : 'edit'
  return { topic, draft: { operation: topic === 'stages' ? 'edit_stages' : create ? 'create_category' : 'edit_category', categoryName, name, stageName, ...(parentName ? { parentName } : {}), ...(topic === 'stages' ? { stageOperation } : {}), ...(question.match(/#[0-9a-f]{6}\b/iu)?.[0] ? { color: question.match(/#[0-9a-f]{6}\b/iu)![0] } : {}) } }
}
