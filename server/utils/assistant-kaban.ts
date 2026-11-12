import type { H3Event } from 'h3'
import type { AssistantConversation, AssistantReply } from '../../shared/types/assistant'
import type { KabanWorkspace } from '../../shared/types/kaban'
import { kabanCategoryStages } from '../../shared/utils/kaban-stages'
import { assistantKabanRequest } from '../../shared/utils/assistant-kaban'
import { assistantFetch } from './assistant-context'
import { assistantVaultOptions } from './assistant-options'
export async function assistantKabanReply(event: H3Event, question: string, selection: { vaultId?: string } = {}, memory: AssistantConversation = {}, previous = '', page = '/'): Promise<AssistantReply | null> {
  const request = assistantKabanRequest(question, memory, previous, page)
  if (!request) return null
  // Normal task commands keep the existing task draft workflow; capability questions just explain it.
  if (request.topic === 'tasks' && !/умеешь|умеет|способен|можем|можно|как|где/iu.test(question)) return null
  const conversation = { topic: 'kaban' as const, kabanTopic: request.topic }
  const links = [{ label: 'Открыть Кабан', to: '/kaban' }]
  if (request.topic === 'tasks') return { message: 'Да, могу подготовить создание, изменение или перемещение задачи Кабана. Изменения показываю в черновике и сохраняю после проверки кнопкой. Назовите задачу, нужное поле и новое значение.', draft: null, conversation, links }
  const options = await assistantVaultOptions(event)
  const selected = options.find(o => o.id === selection.vaultId)
  if (!selected) return { message: 'Выберите хранилище Кабана для работы с категориями и стадиями.', draft: null, conversation, choice: { kind: 'vault', prompt: 'Хранилище Кабана', options: options.map(o => ({ ...o, disabled: request.draft ? o.disabled : false })) }, links }
  const workspace = await assistantFetch<KabanWorkspace>(event, `/api/kaban?vault=${encodeURIComponent(selected.id)}`)
  if (request.draft) {
    const allowed = request.topic === 'stages' ? workspace.canManage : workspace.canEdit
    if (!allowed) return { message: request.topic === 'stages' ? 'Менять стадии этой доски может владелец или управляющий с полным доступом.' : 'Нет прав на изменение категорий в этом хранилище.', draft: null, conversation, links }
    return { message: `Хранилище «${selected.label}». Подготовил черновик ${request.topic === 'stages' ? 'стадий' : 'категории'} Кабана. Проверьте поля и сохраните изменения отдельной кнопкой.`, draft: null, structure: request.draft, conversation, links }
  }
  const message = request.topic === 'stages'
    ? `Стадии доски «${selected.label}»:\n${(workspace.categories.filter(c => !c.archived && question.toLocaleLowerCase('ru').includes(c.name.toLocaleLowerCase('ru')))).length ? workspace.categories.filter(c => !c.archived && question.toLocaleLowerCase('ru').includes(c.name.toLocaleLowerCase('ru'))).map(c => `Категория «${c.name}»${c.stages ? '' : ' · наследует стадии'}:\n${kabanCategoryStages(workspace,c.id).map((s,i)=>`${i+1}. ${s.name}${s.done?' · завершённая':''}`).join('\n')}`).join('\n') : workspace.categories.filter(c=>!c.archived).slice(0,20).map(c=>`• ${c.name}${c.stages?'':' · наследует стадии'}: ${kabanCategoryStages(workspace,c.id).map(s=>s.name).join(' → ')}`).join('\n') || 'Пока нет категорий. Сначала создайте категорию.'}\nМогу подготовить изменение названия, цвета и порядка стадий, добавить стадию или убрать пустую. Напишите, что нужно изменить.`
    : `Категории Кабана «${selected.label}»:\n${workspace.categories.filter(c => !c.archived).map(c => `• ${c.name}${c.parentId ? ' · подкатегория' : ''}`).join('\n') || 'Пока нет категорий.'}\nМогу создать категорию или изменить её название, цвет и родительскую категорию через черновик.`
  return { message, draft: null, conversation, links }
}
