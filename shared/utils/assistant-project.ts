import { isFinancialFormula, financialFormulaReply } from './assistant-calculations.ts'
import type { AssistantDownload, AssistantReply } from '../types/assistant'
import type { AssistantProjectSnapshot, AssistantTeamSnapshot, ProjectReadTopic } from '../types/assistant-project'
export const normalizeAssistantName = (text: string) => text.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
export function projectReadTopic(question: string): ProjectReadTopic | 'team' | null {
  const q = normalizeAssistantName(question)
  if (/^(как|где) (добав|созда|измен|редакт|загруз|удал|прикреп|откры|настро)/u.test(q)) return null
  if (/должност|кем.*работ/u.test(q)) return 'team'
  if (/финанс/u.test(q) && !/проект|смет|выруч|прибыл|ндс/u.test(q)) return null
  if (/команд|сотрудник|коллег/u.test(q) && !/проект|участник/u.test(q)) return 'team'
  if (/участник|команд.*проект|кто.*проект/u.test(q)) return 'members'
  if (/закры|упд|подтвержд|приемк/u.test(q) || q.split(' ').some(word => ['акт', 'акты', 'актов', 'акта', 'акте'].includes(word))) return 'closing'
  if (/исполн|документ.*исполн|предоплат|счет на/u.test(q)) return 'execution'
  if (/договор|контракт/u.test(q)) return 'contracts'
  if (/входн|исходн|вложен|файл|загружен/u.test(q)) return 'inputs'
  if (isFinancialFormula(question) || /выруч|прибыл|рентабель|ндс|нацен/u.test(q)) return 'finance'
  if (/контрагент|реквизит|юр лиц|юрлиц|компани|поставщик|покупател|продавец/u.test(q)) return 'companies'
  if (/связ|взаимосвяз/u.test(q) && !/парол|подпис/u.test(q)) return 'relationships'
  if (/выруч|прибыл|бюджет|рентабель|ндс|финанс|итого|общая сумм|общие затрат|сумма смет|сколько.*проект|сумм.*проект/u.test(q)) return 'finance'
  if (/смет|товар|услуг|позици|стоим|цена|цену|сколько стоит|затрат|макет|ссылк.*дизайн/u.test(q)) return 'estimate'
  if (/проект|что происходит|как там|статус|этап|просроч|сроки|описание/u.test(q)) return 'overview'
  return null
}
const amount = (value: number) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value) + ' ₽'
const date = (value?: string) => value ? /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('.') : value : 'не указан'
const progress = (value?: { status: string; done: number; total: number; overdueCount: number; nextDue: string }) => !value ? 'нет данных' : !value.total ? 'нет контрольных пунктов' : `${value.status === 'complete' ? 'подтверждено' : value.status === 'overdue' ? 'есть просрочка' : 'ожидает подтверждений'} — ${value.done} из ${value.total}; просрочено ${value.overdueCount}${value.nextDue ? `; ближайший срок ${date(value.nextDue)}` : ''}`
const role = (value: string) => ({ owner: 'владелец', editor: 'редактирование', viewer: 'просмотр', hidden: 'доступ скрыт' }[value] || value)
function pageRows<T>(rows: T[], question: string) {
  const page = Math.max(1, Number(question.match(/страниц[аыеу]?\s*(\d+)/iu)?.[1]) || 1), size = 40
  const start = (page - 1) * size
  return { rows: rows.slice(start, start + size), note: rows.length > size ? `\nСтраница ${page}: ${Math.min(start + 1, rows.length)}–${Math.min(start + size, rows.length)} из ${rows.length}. Напишите «страница ${page + 1}», чтобы продолжить.` : '' }
}
export function projectDataReply(snapshot: AssistantProjectSnapshot, topic: ProjectReadTopic, question: string): AssistantReply {
  if (topic === 'finance' && isFinancialFormula(question)) return financialFormulaReply(snapshot)
  const { project, estimate, process, inputs } = snapshot
  const heading = `Проект «${project.name}».`, links = [{ label: 'Открыть проект', to: `/projects/${project.id}` }]
  const downloads: AssistantDownload[] = []
  const q = normalizeAssistantName(question), parts: string[] = [heading]
  const listRequest = /список|какие|все товары|все услуги|все позиции|вся смета/u.test(q)
  const withoutProject = q.replace(normalizeAssistantName(project.name), '')
  const matched = listRequest ? [] : estimate?.items.filter(item => {
    const name = normalizeAssistantName(item.name)
    if (name.length < 3) return false
    if ((' ' + withoutProject + ' ').includes(' ' + name + ' ')) return true
    return /скольк|цен|стоим|срок|кто/u.test(q) && name.split(' ').every(token => withoutProject.split(' ').some(word => word.startsWith(token) && word.length - token.length <= 2))
  }) || []
  const longest = matched.reduce((n, item) => Math.max(n, normalizeAssistantName(item.name).length), 0)
  const named = matched.filter(item => normalizeAssistantName(item.name).length === longest)
  if (named.length === 1 && !['contracts', 'execution', 'closing', 'inputs', 'members', 'relationships'].includes(topic)) topic = 'estimate'
  if (topic === 'estimate') {
    if (!estimate) parts.push('Не удалось получить смету. Данные не считаю пустыми — повторите запрос.')
    else {
      const onlyProducts = /товар/u.test(q) && !/услуг/u.test(q), onlyServices = /услуг/u.test(q) && !/товар/u.test(q)
      const all = named.length ? named : estimate.items.filter(item => onlyProducts ? item.kind === 'product' : onlyServices ? item.kind === 'service' : true)
      parts.push(`Позиций в смете: ${estimate.items.length}. ${onlyProducts ? 'Товары' : onlyServices ? 'Услуги' : 'Товары и услуги'} по запросу: ${all.length}.`)
      const page = pageRows(all, question)
      for (const item of page.rows) {
        parts.push(`• ${item.name} (${item.kind === 'service' ? 'услуга' : 'товар'}): ${item.quantity} ${item.unit} × ${amount(item.price)} = ${amount(item.total)}. Срок: ${date(item.deadline)}. ${item.internalCost ? 'Внутренние затраты' : item.counterparty || 'Контрагент не выбран'}. НДС ${item.vatRate}%: ${amount(item.vat)}.${item.link && /ссыл|url|макет/u.test(q) ? ` Ссылка: ${item.link}` : ''}${item.fields.length ? '\n  ' + item.fields.map(field => `${field.label}: ${field.value || 'не указано'}`).join('; ') : ''}`)
      }
      if (!all.length) parts.push('Подходящих позиций в текущей смете нет.')
      if (page.note) parts.push(page.note)
      const totals = snapshot.financials || process?.estimate
      if (totals) parts.push(`Итого затрат по всей смете: ${amount(totals.cost)}.`)
      if (estimate.details.description) parts.push(`Описание: ${estimate.details.description}`)
      if (/замет|примечан|комментар|все|всю/u.test(q)) parts.push(...estimate.details.notes, estimate.details.notice, ...estimate.details.fields.map(field => `${field.label}: ${field.value || 'не указано'}`))
    }
    links[0] = { label: 'Открыть смету', to: `/projects/${project.id}/estimate` }
  } else if (topic === 'finance') {
    if (!snapshot.financials && !process) parts.push('Финансовые показатели недоступны. Повторите запрос; суммы не подставляю.')
    else {
      const f = snapshot.financials || process!.estimate
      parts.push(`Затраты: ${amount(f.cost)}; входящий НДС: ${amount(f.inputVat)}; затраты без НДС: ${amount(f.netCost)}.`, `Выручка: ${amount(f.revenue)}; исходящий НДС: ${amount(f.outputVat)}; выручка без НДС: ${amount(f.netRevenue)}.`, `Прибыль без НДС: ${amount(f.profit)}; разница выручки и затрат: ${amount(f.difference)}; рентабельность: ${f.profitability === null ? 'не рассчитана' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(f.profitability * 100) + '%'}.`)
    }
  } else if (topic === 'members') {
    const members = project.members.filter(member => member.hasAccess && member.permission !== 'hidden')
    parts.push(`Участники проекта: ${members.length}.`, ...members.map(member => `• ${member.fullName || member.email} — ${role(member.permission)}${/почт|email|контакт/u.test(q) ? `; ${member.email}` : ''}.`))
  } else if (topic === 'companies') {
    if (!estimate) parts.push('Справочник компаний проекта недоступен.')
    else parts.push(`Компаний в проекте: ${estimate.counterparties.length}.`, ...estimate.counterparties.map(party => `• ${party.company} — ${party.isOwnLegalEntity ? 'наше юрлицо' : 'контрагент'}.${/реквизит|инн|банк|адрес|директор/u.test(q) ? ` ИНН: ${party.inn || 'не указан'}; КПП: ${party.kpp || 'не указан'}; директор: ${party.director || 'не указан'}; адрес: ${party.address || 'не указан'}; р/с: ${party.bankAccount || 'не указан'}.` : ''}`))
  } else if (topic === 'inputs') {
    if (!inputs) parts.push('Входные данные недоступны.')
    else {
      parts.push(`Карточек входных данных: ${inputs.cards.length}.`)
      const page = pageRows(inputs.cards, question)
      for (const card of page.rows) parts.push(`• ${card.title}${card.description ? ': ' + card.description : ''}${card.fields.length ? '\n  ' + card.fields.map(field => `${field.label}: ${field.value || 'не указано'}`).join('; ') : ''}\n  Файлы: ${card.attachments.length ? card.attachments.map(file => `${file.name} (${Math.ceil(file.size / 1024)} КБ)`).join(', ') : 'нет вложений'}.`)
      for (const card of page.rows) for (const file of card.attachments) downloads.push({ kind: 'input', projectId: project.id, fileId: file.id, name: file.name, size: file.size, source: `Входные данные · ${card.title}` })
      if (page.note) parts.push(page.note)
    }
  } else if (['contracts', 'execution', 'closing', 'relationships'].includes(topic)) {
    if (!process) parts.push('Не удалось получить договоры и состояние документов.')
    else {
      parts.push(`Договоров: ${process.contracts.length}.`)
      const page = pageRows(process.contracts, question)
      for (const contract of page.rows) {
        parts.push(`• Договор ${contract.number || contract.code}: ${contract.sellerName} → ${contract.buyerName}. ${contract.source === 'revenue' ? 'Выручка' : 'Затраты'}: ${contract.amount === null ? 'не рассчитано' : amount(contract.amount)}. Дата: ${date(contract.date)}; срок: ${date(contract.deadline)}.${contract.issue ? ' Требует исправления: ' + contract.issue : ''}`)
        if (topic === 'contracts') parts.push(...contract.checks.filter(check => ['contractSigned', 'appendicesSigned'].includes(check.key)).map(check => `  ${check.label}: ${check.confirmed ? 'подтверждено' : 'не подтверждено'}; срок ${date(check.deadline)}.`))
        if (topic === 'execution' || topic === 'closing') {
          const stage = topic === 'execution' ? 'execution' : 'closing'
          parts.push(...contract.documents.filter(doc => doc.stage === stage).map(doc => `  ${doc.title}; номер ${doc.number || 'не указан'}; дата ${date(doc.date)}; ${doc.confirmed ? 'подтверждено' : 'не подтверждено'}; срок ${date(doc.deadline)}.`))
          parts.push(...contract.checks.filter(check => stage === 'execution' ? ['advancePaid', 'fulfilled'].includes(check.key) : true).map(check => `  ${check.label}: ${check.confirmed ? 'подтверждено' : check.status === 'overdue' ? 'просрочено, подтверждения нет' : 'подтверждения нет'}; срок ${date(check.deadline)}.`))
          if (stage === 'execution' && contract.prepayment.enabled) parts.push(`  Предоплата: ${contract.prepayment.percent}%${contract.prepayment.amount === null ? '' : ' — ' + amount(contract.prepayment.amount)}.`)
          if (contract.needsReview) parts.push('  Подтверждения требуют повторной проверки после изменения данных.')
        }
        if (topic === 'relationships') parts.push(`  Объём: ${contract.scope.map(item => item.name).join(', ') || contract.scopeBasis}.`, ...contract.steps.map(step => `  ${step.label}: ${step.summary}.`))
      }
      if (page.note) parts.push(page.note)
      if (topic === 'relationships') parts.push(`Внутренние позиции: ${process.internalItems.map(item => item.name).join(', ') || 'нет'}. Позиции без договора: ${process.unallocatedItems.map(item => item.name).join(', ') || 'нет'}.`)
      if (snapshot.contractFiles) parts.push(...snapshot.contractFiles.map(row => `Файлы договора ${row.contract}: ${row.files.map(file => file.name).join(', ') || 'нет'}.`))
    }
    links[0] = { label: 'Открыть раздел проекта', to: `/projects/${project.id}/${topic === 'relationships' ? 'relationships' : topic}` }
  } else {
    parts.push(`Создан: ${date(project.createdAt.slice(0, 10))}. Изменён: ${date(project.updatedAt.slice(0, 10))}.`, `Доступ: ${role(project.permission)}. Участников с доступом: ${project.members.filter(member => member.hasAccess && member.permission !== 'hidden').length}.`)
    if (estimate) parts.push(`Смета: ${estimate.items.length} позиций; срок проекта: ${date(estimate.details.finishDate)}.${estimate.details.description ? '\n' + estimate.details.description : ''}`)
    if (process) parts.push(`Затраты: ${amount(process.estimate.cost)}; выручка: ${amount(process.estimate.revenue)}; прибыль без НДС: ${amount(process.estimate.profit)}.`, `Договоры: ${progress(process.stages.contracts)}.`, `Исполнение: ${progress(process.stages.execution)}.`, `Закрытие: ${progress(process.stages.closing)}.`, `Договоров: ${process.contracts.length}; форм документов: ${process.documentCount}.`)
    if (inputs) parts.push(`Входных карточек: ${inputs.cards.length}; вложений: ${inputs.cards.reduce((n, card) => n + card.attachments.length, 0)}.`)
  }
  if (topic === 'overview') for (const card of inputs?.cards.slice(0, 40) || []) for (const file of card.attachments) downloads.push({ kind: 'input', projectId: project.id, fileId: file.id, name: file.name, size: file.size, source: `Входные данные · ${card.title}` })
  for (const row of snapshot.contractFiles || []) for (const file of row.files) downloads.push({ kind: 'contract', projectId: project.id, contractId: row.contractId, fileId: file.id, name: file.name, size: file.size, source: `Договор ${row.contract}` })
  if (snapshot.documents?.length) parts.push(...snapshot.documents.map(doc => `${doc.title}\n${doc.text}`))
  if (snapshot.warnings.length) parts.push(`Часть источников недоступна: ${snapshot.warnings.join('; ')}.`)
  return { message: parts.filter(Boolean).join('\n'), draft: null, links, ...(downloads.length ? { downloads } : {}) }
}
export function teamDataReply(team: AssistantTeamSnapshot, question: string): AssistantReply {
  const unit = new Map(team.units.map(unit => [unit.id, unit])), q = normalizeAssistantName(question)
  const lines = [`${team.label}. Участников: ${team.total}.`]
  for (const person of team.people) {
    const positions = person.roleIds.map(id => unit.get(id)).filter(Boolean).map(role => `${role!.name}${role!.parentId && unit.get(role!.parentId) ? ' · ' + unit.get(role!.parentId)!.name : ''}`)
    lines.push(`• ${person.fullName || person.workEmail || person.email}${positions.length ? ' — ' + positions.join('; ') : ' — должность не указана'}${/контакт|почт|email|телеграм/u.test(q) ? `; рабочая почта: ${person.workEmail || 'не указана'}; Telegram: ${person.telegram || 'не указан'}` : ''}.`)
  }
  if (!team.people.length) lines.push('В доступной выборке сотрудников нет.')
  if (team.total > team.people.length) lines.push(`Показана страница ${team.page}: ${(team.page - 1) * 50 + 1}–${(team.page - 1) * 50 + team.people.length} из ${team.total}. Для продолжения напишите «команда, страница ${team.page + 1}».`)
  return { message: lines.join('\n'), draft: null, links: [{ label: 'Открыть команду', to: '/team' }] }
}
