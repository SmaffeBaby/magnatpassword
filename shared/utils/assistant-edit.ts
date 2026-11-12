import type { AssistantEdit } from '../types/assistant-edit'
export function assistantEditRequest(question: string): AssistantEdit | null {
  if (!/(?:измен|помен|исправ|редакт|обнов|переимен|свяж|связать|привяж|отвяж|удал|убер|замен|свяжи)/iu.test(question) || /^(?:как|где|можно ли)/iu.test(question.trim())) return null
  const kind = /связ|свяж|привяж|отвяж/iu.test(question) && /подпис/iu.test(question) ? 'relation' : /парол|карточк|логин/iu.test(question) ? 'credential' : /проект|смет/iu.test(question) ? 'project' : null
  if (!kind) return null
  const fields = [['username', 'логин'], ['password', 'значение пароля|пароль на'], ['url', 'сайт|адрес|url'], ['notes', 'заметк'], ['description', 'описани'], ['finishDate', 'срок|дат.*заверш'], ['title', 'названи|заголов|переимен'], ['code', 'код'], ['price', 'цен'], ['quantity', 'количеств']] as const
  const field = question.match(/пол[ея]\s+[«"]([^»"]+)[»"]/iu)?.[1] || fields.find(([, pattern]) => new RegExp(pattern, 'iu').test(question))?.[0] || (/(?:измени|поменяй|обнови|замени)\s+(?:значение\s+)?пароль(?:\s|$)/iu.test(question) ? 'password' : '')
  const value = question.match(/(?:\sна\s+|(?:логин|сайт|url|заметки|описание|название|код|цена|количество|срок)\s*[:=]\s*)([\s\S]+)$/iu)?.[1]?.replace(/^[«"]|[»"]$/gu, '').trim() || ''
  return { kind, target: question, field, value }
}
