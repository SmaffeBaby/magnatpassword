import type { AssistantAction, AssistantConversation, AssistantReply } from '../types/assistant'
import type { TeamPerson, TeamUnit } from '../types/team'
import { assistantHelp } from './assistant-help.ts'
export function siteSectionReply(question: string): AssistantReply | null {
  if (/проект|смет|выруч|прибыл|ндс/iu.test(question)) return null
  if (/(?:какие|что)[\s\S]{0,80}(?:разделы|сервисы)|что[\s\S]{0,40}есть на сайте/iu.test(question)) return { message: 'На сайте доступны:\n• Пароли — карточки доступов и хранилища.\n• Финансы — подписки, оплаты, календарь и отчёты.\n• Взаимосвязи — связи карточек и карта.\n• Проекты — смета, договоры, исполнение и закрытие.\n• Команда — сотрудники и должности.\n• Кабан — доска задач.', draft: null, conversation: { topic: 'site' }, links: [{ label: 'Главная', to: '/' }] }
  if (/финанс/iu.test(question)) {
    const doc = assistantHelp.find(doc => doc.id === 'finance')!
    return { message: doc.text, draft: null, conversation: { topic: 'site' }, links: [{ label: 'Финансы', to: '/finances' }, { label: 'История оплат', to: '/finances/history' }] }
  }
  return null
}
export function quickTaskAction(kind: AssistantAction['kind'], question: string): AssistantAction {
  const action: AssistantAction = { kind, title: '', description: '', dueOn: '', taskName: '', stageName: '' }
  const quoted = question.match(/[«"]([^»"]+)[»"]/u)?.[1]
  const after = question.replace(/^[\s\S]*?задач[а-яё]*\s*[:—-]?\s*/iu, '').trim()
  const meaningful = after && !/^(?:в кабане|в хранилище|пожалуйста|новую|новая|на доске)[\s.!]*$/iu.test(after)
  if (kind === 'create_task') action.title = (quoted || (meaningful ? after.split(/\s+(?:в хранилищ|описание|срок|до \d)/iu)[0] : '') || '').slice(0, 200)
  else action.taskName = (quoted || (meaningful ? after.split(/\s+(?:в стадию|на стадию|в колонку|переимен|измени|описание)/iu)[0] : '') || '').slice(0, 200)
  action.description = (question.match(/описание\s*[:—-]\s*([\s\S]+)/iu)?.[1] || '').slice(0, 2000)
  action.dueOn = question.match(/\b\d{4}-\d{2}-\d{2}\b/u)?.[0] || ''
  action.stageName = (question.match(/(?:в стадию|на стадию|в колонку)\s+[«"]?([^»".,]+)/iu)?.[1] || '').trim().slice(0, 60)
  return action
}
const ignored = new Set('а и у в во на какая какой какое как должность должности должностью должностей работает работу кем кто такой такая роль роли контакты контакт почта телефон email телеграм light лайт magnat магнат компании компания сотрудника сотрудник его ее него нее сейчас пожалуйста'.split(' '))
export function personSearchText(question: string): string {
  return question.toLocaleLowerCase('ru').replace(/ё/g, 'е').match(/[\p{L}]{3,}/gu)?.filter(word => !ignored.has(word)).map(word => word.replace(/(?:ами|ями|ом|ым|а|я|у|ю|е|ы|и)$/u, '')).filter(word => word.length >= 3).join(' ') || ''
}
export function companyBrand(question: string): 'light' | 'magnat' | null {
  return /(?:^|[^\p{L}])(?:light|лайт)(?:$|[^\p{L}])/iu.test(question) ? 'light' : /(?:^|[^\p{L}])(?:magnat|магнат)(?:$|[^\p{L}])/iu.test(question) ? 'magnat' : null
}
export function personPositionReply(person: TeamPerson, units: TeamUnit[], brand: ReturnType<typeof companyBrand>): AssistantReply {
  const byId = new Map(units.map(unit => [unit.id, unit]))
  const paths = person.roleIds.map(id => {
    const path: TeamUnit[] = [], visited = new Set<string>()
    let item = byId.get(id)
    while (item && !visited.has(item.id)) { visited.add(item.id); path.unshift(item); item = item.parentId ? byId.get(item.parentId) : undefined }
    return path
  }).filter(path => !brand || path[0]?.brand === brand || (brand === 'light' ? /light|лайт/iu : /magnat|магнат/iu).test(path[0]?.name || ''))
  const lines = paths.map(path => {
    const position = path.findLast(unit => unit.kind === 'role')
    return position ? `• ${position.name} — ${path.filter(unit => unit.id !== position.id).map(unit => unit.name).join(' → ')}` : `• ${path.map(unit => unit.name).join(' → ')}: должность не указана`
  })
  return { message: `${person.fullName || person.workEmail || person.email}${brand ? ` · ${brand === 'light' ? 'Light' : 'Magnat'}` : ''}:\n${lines.length ? lines.join('\n') : 'Должность в профиле не указана.'}`, draft: null, conversation: { personId: person.id, personName: person.fullName, topic: 'person' }, links: [{ label: 'Профиль сотрудника', to: `/team/${person.id}` }] }
}
export function personQuestion(question: string, previous: string, memory: AssistantConversation): boolean {
  return /должност|кем\s+работ|роль.*(?:light|лайт|компани)/iu.test(question) || !!memory.personId && /^(?:а |и |он |она |его |ее )/iu.test(question.trim()) && /работ|контакт|light|лайт|magnat|магнат/iu.test(question) || /^(?:а |и )/iu.test(question.trim()) && /должност/iu.test(previous)
}
