import { assistantFileTopic, isAssistantFileRequest } from '../../shared/utils/assistant-files'
import { assistantTaskFilesRead } from './assistant-files-read'
import { assistantSubscriptionsRead } from './assistant-subscriptions-read'
import { assistantGraphRead } from './assistant-graph-read'
import { arithmeticReply, isFinancialFormula, financialFormulaReply } from '../../shared/utils/assistant-calculations'
import type { H3Event } from 'h3'
import type { Project } from '../../shared/types/projects'
import type { ProjectEstimate } from '../../shared/types/estimate'
import type { ProjectInputs } from '../../shared/types/project-inputs'
import type { ProjectProcess } from '../../shared/types/project-process'
import type { ProjectExecution } from '../../shared/types/project-execution'
import type { ProjectClosing } from '../../shared/types/project-closing'
import type { TeamDirectory, TeamProfile } from '../../shared/types/team'
import type { AssistantReply, AssistantConversation } from '../../shared/types/assistant'
import type { AssistantProjectSnapshot, ProjectReadTopic } from '../../shared/types/assistant-project'
import { projectReadTopic, projectDataReply, teamDataReply, normalizeAssistantName } from '../../shared/utils/assistant-project'
import { estimateAmounts, estimateFinancials } from '../../shared/utils/estimate'
import { renderExecutionDocument } from '../../shared/utils/project-execution'
import { renderClosingDocument } from '../../shared/utils/project-closing'
import { personSearchText, companyBrand, personPositionReply, personQuestion, siteSectionReply } from '../../shared/utils/assistant-dialog'
import { assistantFetch } from './assistant-context'

export async function assistantRead(event: H3Event, question: string, selection: { projectId?: string; recordKey?: string; vaultId?: string } = {}, previousQuestion = '', memory: AssistantConversation = {}): Promise<AssistantReply | null> {
  const taskFiles = await assistantTaskFilesRead(event, question, selection, memory)
  if (taskFiles) return taskFiles
  const calculation = arithmeticReply(question)
  if (calculation) return calculation
  const subscriptions = await assistantSubscriptionsRead(event, question, selection.recordKey)
  if (subscriptions) return subscriptions
  const section = isFinancialFormula(question) ? null : siteSectionReply(question)
  if (section) return section
  const graphPage = memory.topic === 'relationships' && /^страниц/iu.test(question.trim())
  const graph = await assistantGraphRead(event, graphPage ? `${(memory.relationQuery || 'Связи карточки').replace(/страниц[аыуе]?\s*\d+/giu, '')} ${question}` : question, selection.recordKey || (graphPage ? memory.recordKey : undefined))
  if (graph) return graph
  if (personQuestion(question, previousQuestion, memory)) {
    const explicit = personSearchText(question)
    const search = explicit || personSearchText(memory.personName || previousQuestion)
    if (!search) return { message: 'О каком сотруднике рассказать? Напишите имя и фамилию.', draft: null }
    const [directory, profile] = await Promise.all([assistantFetch<TeamDirectory>(event, `/api/team?${new URLSearchParams({ q: search })}`), assistantFetch<TeamProfile>(event, '/api/profile')])
    const person = directory.people.find(person => person.id === memory.personId) || (directory.people.length === 1 ? directory.people[0] : undefined)
    if (person) return personPositionReply(person, profile.units, companyBrand(question))
    return { message: directory.people.length ? 'Нашёл несколько сотрудников. Уточните, о ком рассказать.' : 'В доступном справочнике сотрудник не найден. Уточните имя и фамилию.', draft: null, ...(directory.people.length ? { choice: { kind: 'person' as const, prompt: 'Выберите сотрудника', options: directory.people.map(person => ({ id: person.id, label: person.fullName || person.email })) } } : {}) }
  }
  if (/парол|подпис|кабан|задач/iu.test(question) && !/проект|смет|договор/iu.test(question)) return null
  let topic = assistantFileTopic(question, previousQuestion, memory)
  if (!topic && /^(?:а |и |ещ[её]|дальше|подробнее|страниц)/iu.test(question.trim())) topic = projectReadTopic(previousQuestion)
  if (!topic) return null
  const query = normalizeAssistantName(question)
  if (topic === 'team') {
    const profile = await assistantFetch<TeamProfile>(event, '/api/profile')
    const companies = profile.units.filter(unit => unit.kind === 'company' && profile.commonUnits.includes(unit.id))
    const company = companies.length === 1 && !/все|всех|общий|справочник/u.test(query) ? companies[0] : undefined
    const page = Math.min(10000, Math.max(1, Number(question.match(/страниц[аыеу]?\s*(\d+)/iu)?.[1]) || 1))
    const params = new URLSearchParams({ page: String(page), ...(company ? { company: company.id } : {}) })
    const team = await assistantFetch<TeamDirectory>(event, `/api/team?${params}`)
    return { ...teamDataReply({ ...team, units: profile.units, label: company ? `Команда «${company.name}»` : 'Доступный справочник команды' }, question), conversation: { topic: 'site' } }
  }
  let projects: Project[]
  try { projects = await assistantFetch<Project[]>(event, '/api/projects') }
  catch (failure: any) {
    if (isFinancialFormula(question) && !selection.projectId && (failure?.statusCode ?? failure?.status) === 403) return financialFormulaReply()
    throw failure
  }
  if (topic === 'overview' && /(?:какие|мои)\s+проект|список\s+проект/u.test(query)) return { message: projects.length ? `Доступно проектов: ${projects.length}.\n` + projects.slice(0, 40).map(project => `• ${project.name}`).join('\n') : 'Нет доступных проектов.', draft: null, links: [{ label: 'Проекты', to: '/projects' }] }
  const named = projects.filter(project => normalizeAssistantName(project.name).length > 1 && query.includes(normalizeAssistantName(project.name)))
  // A name in the question is resolved against the caller's visible projects, never a model-generated ID.
  const project = named.length === 1 ? named[0] : projects.find(project => project.id === selection.projectId) || (projects.length === 1 ? projects[0] : undefined)
  if (selection.projectId && !projects.some(project => project.id === selection.projectId)) throw createError({ statusCode: 403, message: 'Проект недоступен.' })
  if (!project) {
    const list = projects.slice(0, 30).map(project => `• ${project.name}`).join('\n')
    if (isFinancialFormula(question)) return { ...financialFormulaReply(), ...(projects.length ? { choice: { kind: 'project' as const, prompt: 'Показать расчёт на данных проекта', options: projects.map(project => ({ id: project.id, label: project.name })) } } : {}) }
    return { message: projects.length ? `О каком проекте рассказать? Выберите его ниже или напишите название. Доступные проекты:\n${list}` : 'Нет доступных проектов. Участие и доступ к разделу выдаёт администратор.', draft: null, conversation: { topic: 'project', projectTopic: topic }, choice: { kind: 'project', prompt: 'Выберите проект', options: projects.map(project => ({ id: project.id, label: project.name })) }, links: [{ label: 'Проекты', to: '/projects' }] }
  }
  const snapshot: AssistantProjectSnapshot = { project, warnings: [] }
  async function read<T>(path: string, label: string): Promise<T | null> {
    try { return await assistantFetch<T>(event, path) }
    catch (failure: any) {
      if ([401, 403, 404, 429].includes(failure?.statusCode ?? failure?.status)) throw failure
      snapshot.warnings.push(label); return null
    }
  }
  const needEstimate = ['overview', 'estimate', 'finance', 'companies'].includes(topic)
  const needProcess = ['overview', 'contracts', 'execution', 'closing', 'relationships'].includes(topic)
  const needInputs = topic === 'overview' || topic === 'inputs'
  const [estimate, process, inputs] = await Promise.all([
    needEstimate ? read<ProjectEstimate>(`/api/projects/${project.id}/estimate`, 'Смета') : null,
    needProcess ? read<ProjectProcess>(`/api/projects/${project.id}/process-map`, 'Состояние этапов') : null,
    needInputs ? read<ProjectInputs>(`/api/projects/${project.id}/input-data`, 'Входные данные') : null
  ])
  snapshot.process = process; snapshot.inputs = inputs
  if (estimate) {
    const amounts = estimateAmounts(estimate.items)
    snapshot.estimate = { ...estimate, items: estimate.items.map(({ image: _image, ...item }, index) => ({ ...item, ...amounts[index]!, counterparty: estimate.counterparties.find(party => party.id === item.counterpartyId)?.company || '' })) }
    snapshot.financials = estimateFinancials(estimate)
  }
  if ((topic === 'contracts' || topic === 'overview' && isAssistantFileRequest(question)) && process) {
    const matching = process.contracts.filter(contract => contract.number && query.includes(normalizeAssistantName(contract.number)))
    const start = (Math.max(1, Number(question.match(/страниц[аыеу]?\s*(\d+)/iu)?.[1]) || 1) - 1) * 40
    const contracts = matching.length ? matching : process.contracts.slice(start, start + 20)
    snapshot.contractFiles = await Promise.all(contracts.map(async contract => ({ contractId: contract.id, contract: contract.number || contract.code, files: await read<{ id: string; name: string; size: number }[]>(`/api/projects/${project.id}/contracts/${contract.id}/files`, `Файлы договора ${contract.number}`) || [] })))
    if (!matching.length && process.contracts.length > start + 20) snapshot.warnings.push('Файлы показаны для первых 20 договоров на странице; уточните номер договора')
  }
  if (['contracts', 'execution', 'closing'].includes(topic) && /текст|содержим|полный документ/u.test(query) && process) {
    const closing = topic === 'closing' ? await read<ProjectClosing>(`/api/projects/${project.id}/closing`, 'Текст закрывающих документов') : null
    const execution = closing?.execution || await read<ProjectExecution>(`/api/projects/${project.id}/execution`, 'Текст документов исполнения')
    snapshot.documents = []
    for (const contract of process.contracts.slice(0, 20)) for (const doc of contract.documents) {
      if (topic === 'closing' ? doc.stage !== 'closing' : topic === 'contracts' ? doc.kind !== 'contract' : doc.stage !== 'execution') continue
      try {
        const rendered = doc.kind === 'act' || doc.kind === 'upd' ? closing && renderClosingDocument(closing, contract.id, doc.kind) : execution && renderExecutionDocument(execution, contract.id, doc.kind, doc.appendixId)
        if (rendered) snapshot.documents.push({ title: rendered.title, text: rendered.blocks.map(block => block.type === 'text' ? block.text : [block.headers.join(' | '), ...block.rows.map(row => row.join(' | '))].join('\n')).join('\n') })
      } catch { snapshot.warnings.push(`Текст ${doc.title} требует проверки исходных данных`) }
    }
  }
  return { ...projectDataReply(snapshot, topic as ProjectReadTopic, question), projectId: project.id, conversation: { topic: 'project', projectTopic: topic as ProjectReadTopic } }
}
