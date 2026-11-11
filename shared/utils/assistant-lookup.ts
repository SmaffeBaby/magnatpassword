import { wantsCredential } from './assistant.ts'
import type { AssistantContext, AssistantReply } from '../types/assistant'
export function assistantSite(url: string): string {
  try { return new URL(url.includes('://') ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}
export function isPasswordLookup(text: string): boolean {
  if (wantsCredential(text) || /^(?:добав|созда|сохран|запиш|измени|поменяй)/iu.test(text.trim()) || /связ|подпис/iu.test(text)) return false
  if (/^(?:как|где|можно ли|могу ли|умеешь ли)/iu.test(text.trim()) && /добав|созда|сохран/iu.test(text)) return false
  return /(?:какой|покажи|посмотр|узнать|найти|найди|мой|скажи|напомни|дай)[\s\S]{0,70}парол|парол[\s\S]{0,30}(?:от|для)\s+\S/iu.test(text)
}
export function passwordLookupReply(question: string, rows: AssistantContext['relations'], selected?: string): AssistantReply {
  const domains = [...question.matchAll(/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}/giu)].map(match => assistantSite(match[0]))
  const matches = selected ? rows.filter(row => row.key === selected) : rows.filter(row => domains.includes(row.site || '') || row.title.length >= 2 && question.toLocaleLowerCase('ru').includes(row.title.toLocaleLowerCase('ru')))
  if (!matches.length) return { message: 'Не нашёл подходящую карточку среди доступных вам. Уточните название или выберите карточку ниже. Посмотреть и скопировать пароль можно в разделе «Пароли».', draft: null, choice: { kind: 'record', prompt: 'Выберите карточку пароля', options: rows.map(row => ({ id: row.key, label: `${row.title} · ${row.vault}` })) }, links: [{ label: 'Открыть пароли', to: '/password' }] }
  const links = matches.slice(0, 10).map(row => {
    const [vault, entry] = row.key.split('/')
    return { label: `${row.title} · ${row.vault}`, to: `/password?${new URLSearchParams({ entry: entry || '', vault: vault || 'personal' })}` }
  })
  return { message: matches.length === 1 ? `Нашёл карточку «${matches[0]!.title}» в хранилище «${matches[0]!.vault}». Откройте её по кнопке ниже, чтобы посмотреть или скопировать пароль. Значение пароля не передаётся модели.` : 'Нашёл несколько доступных карточек. Выберите нужную ниже, чтобы посмотреть пароль в её форме.', draft: null, ...(matches.length > 1 ? { choice: { kind: 'record' as const, prompt: 'Выберите карточку пароля', options: matches.map(row => ({ id: row.key, label: `${row.title} · ${row.vault}` })) } } : {}), links }
}
