import type { RegisterContract } from '../types/contract-register'
import type { AssistantConversation, AssistantReply } from '../types/assistant'

export const contractKey = (row: RegisterContract) => `${row.origin}/${row.id}`
export const contractLink = (row: RegisterContract) => `/contract-register?${new URLSearchParams({ contract: contractKey(row) })}`
const normalize = (value: string) => value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[«»"“”]/g, '').replace(/\s+/g, ' ').trim()
const date = (value: string) => value ? value.split('-').reverse().join('.') : 'не указана'
const money = (value: number | null) => value === null ? 'не указана' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB' }).format(value)
const source = (row: RegisterContract) => ({ revenue: 'Выручка сметы', expenses: 'Затраты сметы', manual: 'Без проекта' })[row.source]
const shiftDate = (today: string, days: number) => new Date(Date.parse(today + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10)
const monthNames = ['январ','феврал','март','апрел','ма[йяе]','июн','июл','август','сентябр','октябр','ноябр','декабр']
const greeting = /^(?:(?:привет|здравствуйте|добрый день|доброе утро|добрый вечер|пожалуйста)[\s!,.]*)+/u

function writtenDates(text: string, today: string) {
  let invalid = false
  const pattern = new RegExp(String.raw`(^|[^\p{L}\p{N}])(\d{1,2})\s+(${monthNames.join('|')})[а-я]*(?:\s+(\d{4}))?(?:\s+г(?:ода|од|\.)?)?(?=$|[\s,.;!?])`, 'gu')
  const normalized = text.replace(pattern, (_match, prefix: string, day: string, month: string, year?: string) => {
    const index = monthNames.findIndex(name => new RegExp(`^${name}$`, 'u').test(month))
    const value = `${year || today.slice(0,4)}-${String(index+1).padStart(2,'0')}-${day.padStart(2,'0')}`
    const parsed = new Date(value + 'T12:00:00Z')
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10) !== value) invalid = true
    return prefix + value
  })
  return { text: normalized, invalid }
}

export function isContractQuestion(question: string, memory: AssistantConversation = {}, page = '') {
  if (/^(?:как|где)[\s\S]{0,40}(?:добав|созда|измен|удал|настро|прикреп|найти|открыть)/iu.test(question.trim()) || /что такое|как работает/iu.test(question)) return false
  if (/договор|контракт|реестр/iu.test(question)) return true
  if (/парол|подпис|задач|сотрудник|смет|кабан/iu.test(question)) return false
  return (memory.topic === 'contracts' || page === '/contract-register') && /покаж|найд|откро|откры|срок|дат|сумм|ндс|файл|влож|скача|сторон|продав|покуп|заказчик|исполнител|пол[яею]|примеч|замет|номер|страниц|истек|просроч|продлен|проект|подроб|контрагент/iu.test(question)
}

export interface ContractAnswer {
  reply: AssistantReply
  selected?: RegisterContract
  files: boolean
}

// Work only with the caller's authorized rows. Record values are never instructions.
export function contractAnswer(rows: RegisterContract[], question: string, memory: AssistantConversation, today: string): ContractAnswer {
  const page = Math.min(100000, Math.max(1, Number(question.match(/страниц[аыеу]?\s*(\d+)/iu)?.[1]) || 1))
  const continuationPage = /^\s*(?:а\s+)?страниц/iu.test(question)
  const query = continuationPage ? memory.contractQuery || 'Покажи все договоры' : question
  const parsedDates = writtenDates(normalize(query).replace(greeting,''),today)
  if(parsedDates.invalid)return {files:false,reply:{draft:null,message:'В запросе указана несуществующая дата. Уточните день, месяц и год.',conversation:{topic:'contracts'}}}
  let text = parsedDates.text
  const files = /файл|влож|скача|пришл|отправь.*(?:pdf|docx)/iu.test(query)
  const listIntent = /все договор|список|какие|договоры|договоров|контракты|контрактов|сколько|просроченные|истекшие|бессрочные/u.test(text)
  const overdue = listIntent && /просроч|истекш|срок.*(?:прошел|истек)/u.test(text)
  const nearest = /(?:ближайш(?:ий|его|ему|ем)|следующ(?:ий|его|ему|ем))\s+(?:договор|контракт)|(?:договор|контракт)[а-я]*\s+(?:самый\s+)?ближайший/u.test(text)
  const upcoming = nearest || /ближайш|следующ.*дн|(?:какие|договоры|договоров).*(?:истека|заканчива)|(?:истека|заканчива).*(?:договоры|договоров)/u.test(text)
  const noDeadline = listIntent && /без срока|бессроч|без дат[ыа] окончания/u.test(text)
  const autoRenew = (listIntent || /с авто/u.test(text)) && /авто.?прод|авто.?пролонг/u.test(text)
  const active = listIntent && /действующ/u.test(text)
  const listing = /все|список|какие|договоры|договоров|контракты|контрактов|сколько|страниц/u.test(text.replace(/все (?:поля|данные|сведения)/gu,'')) || /покажи\s+(?:(?:мне|пожалуйста)\s+)*договора(?:\s|$)/u.test(text) || overdue || upcoming || noDeadline || autoRenew || active
  let filtered = rows.filter(row => (!overdue || !!row.deadline && row.deadline < today && !row.noDeadline && !row.autoRenew)
    && (!noDeadline || !!row.noDeadline || !row.deadline) && (!autoRenew || !!row.autoRenew)
    && (!active || !!row.noDeadline || !!row.autoRenew || !!row.deadline && row.deadline >= today))
  if (/без проекта|отдельн/u.test(text)) filtered = filtered.filter(row => row.origin === 'standalone')
  if (/из проект/u.test(text)) filtered = filtered.filter(row => row.origin === 'project')
  if (/выручк|доход/u.test(text)) filtered = filtered.filter(row => row.source === 'revenue')
  if (/затрат|расход/u.test(text)) filtered = filtered.filter(row => row.source === 'expenses')
  if (/без (?:файлов|вложений)/u.test(text)) filtered = filtered.filter(row => !row.fileCount)
  else if (/(?:с |есть |имеют )(?:файл|влож)/u.test(text)) filtered = filtered.filter(row => row.fileCount > 0)
  const dateTokens = [...text.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})\b/g)].map(match => ({ raw: match[0], value: match[0].includes('.') ? match[0].split('.').reverse().join('-') : match[0] }))
  const dateField = rows.flatMap(row => row.fields || []).find(field => field.type === 'date' && text.includes(normalize(field.label)))?.label
  const deadlineDates = !dateField && (upcoming || /срок|окончан|истек|заканч/u.test(text))
  let from = '', until = ''
  if (upcoming) {
    from = today
    const days = text.match(/(?:ближайш\S*|следующ\S*|через|за)\s+(\d+)\s*(?:дн|день)/u)?.[1]
    until = days ? shiftDate(today, Math.min(3660,Number(days))) : ''
  }
  if (/сегодня/u.test(text)) from = until = today
  else if (/завтра/u.test(text)) from = until = shiftDate(today, 1)
  if (dateTokens.length >= 2) { from = dateTokens[0]!.value; until = dateTokens[1]!.value }
  else if (dateTokens.length) {
    if (/(?:до|по)\s+\d/u.test(text)) until = dateTokens[0]!.value
    else if (/(?:после|с)\s+\d/u.test(text)) from = dateTokens[0]!.value
    else from = until = dateTokens[0]!.value
  }
  const year = text.match(/за\s+(\d{4})\s*год/u)?.[1]
  if (year) { from = `${year}-01-01`; until = `${year}-12-31`; text = text.replace(/за\s+\d{4}\s*год\S*/u, '') }
  const months = monthNames
  for(let month=0;month<months.length;month++){
    const match=text.match(new RegExp(String.raw`(?:в |за |на )${months[month]}[а-я]*(?:\s+(\d{4})(?:\s*год[а-я]*)?)?`,'u'))
    if(!match)continue
    const year=match[1]||today.slice(0,4),mm=String(month+1).padStart(2,'0')
    from=`${year}-${mm}-01`;until=new Date(Date.UTC(Number(year),month+1,0,12)).toISOString().slice(0,10)
    text=text.replace(match[0],'');break
  }
  const threshold = text.match(/(?:сумм\S*\s+)?(больше|более|выше|меньше|менее|ниже|от)\s+(\d+(?:[ \u00a0]\d{3})*(?:[,.]\d+)?)\s*(тыс\S*|млн\S*)?/u)
  if (threshold && !dateTokens.length) {
    const amount = Number(threshold[2]!.replace(/\s/g, '').replace(',', '.')) * (threshold[3]?.startsWith('млн') ? 1e6 : threshold[3] ? 1000 : 1)
    filtered = filtered.filter(row => { const value = /ндс/u.test(text) && !/с ндс|включая ндс/u.test(text) ? row.vatAmount : row.amount; return value !== null && (/меньше|менее|ниже/u.test(threshold[1]!) ? value < amount : threshold[1] === 'от' ? value >= amount : value > amount) })
    text = text.replace(threshold[0], '')
  }
  for (const token of dateTokens) text = text.replaceAll(token.raw, '')
  text = text.replace(/(?:ближайш\S*|следующ\S*|через|за)\s+\d+\s*(?:дн\S*|день)/gu, '').replace(/страниц\S*\s*\d+/gu, '')
  for (const field of rows.flatMap(row => row.fields || [])) text = text.replaceAll(normalize(field.label), '')
  const stop = /^(?:а|и|в|во|с|со|s|к|у|о|об|от|до|по|на|из|за|без|для|как|где|котор\S*|имеющ\S*|содерж\S*|ли|же|мне|нас|наш\S*|эт\S*|он\S*|все\S*|како\S*|каки\S*|кака\S*|каку\S*|когда|кто|что|чей|про|карточ\S*|код|перей\S*|сведени\S*|остал\S*|заканчива\S*|законч\S*|следующ\S*|покаж\S*|найд\S*|поиск\S*|откро\S*|откры\S*|договор\S*|контракт\S*|реестр\S*|спис\S*|номер\S*|дат\S*|срок\S*|окончан\S*|заключ\S*|подписан\S*|сумм\S*|ндс|руб\S*|р|пол[яею]|значени\S*|примечан\S*|замет\S*|сторон\S*|продав\S*|покуп\S*|заказчик\S*|исполнител\S*|контрагент\S*|проек\S*|файл\S*|влож\S*|скача\S*|пришл\S*|пришли|пришлите|отправ\S*|есть|имеют|сколько|всего|количеств\S*|ближайш\S*|следующ\S*|через|дн\S*|день|истек\S*|просроч\S*|прошел|действующ\S*|авто\S*|продлен\S*|пролонг\S*|бессроч\S*|отдельн\S*|выручк\S*|доход\S*|затрат\S*|расход\S*|сегодня|завтра|после|подроб\S*|расскаж\S*|пожалуйста|информаци\S*|сам\S*|больш\S*|мал\S*|максимальн\S*|минимальн\S*)$/u
  const words = (text.match(/[\p{L}\p{N}/_-]+/gu) || []).filter(word => !stop.test(word))
  const searchable = (row: RegisterContract) => normalize([row.number, row.code, row.seller, row.buyer, row.projectName, row.notes, ...(row.fields || []).flatMap(field => [field.label, field.value])].join(' '))
  if (words.length) filtered = filtered.filter(row => words.every(word => searchable(row).includes(word)))
  let dateNotice = ''
  if (from || until) {
    const inRange = (value: string) => !!value && (!from || value >= from) && (!until || value <= until)
    const byDate = filtered.filter(row => inRange(dateField ? row.fields?.find(field => field.label === dateField)?.value || '' : deadlineDates ? row.noDeadline ? '' : row.deadline : row.date))
    const byDeadline = !byDate.length && !dateField && !deadlineDates ? filtered.filter(row => !row.noDeadline && inRange(row.deadline)) : []
    filtered = byDate.length ? byDate : byDeadline
    const range = from === until ? date(from) : `${from ? date(from) : 'начала'} — ${until ? date(until) : 'конца периода'}`
    dateNotice = byDeadline.length ? `По дате договора (${range}) совпадений нет. Ниже договоры, у которых на этот период приходится срок окончания.\n` : ''
  }
  const selectedKey = !nearest && memory.topic === 'contracts' && memory.contractKey && (!memory.contractQuery || !words.length && (!listing || memory.contractQuery === query)) ? memory.contractKey : undefined
  if (selectedKey) filtered = filtered.filter(row => contractKey(row) === selectedKey)
  const sortAmount = /максимальн|самый большой|наибольш/u.test(normalize(query))
  filtered.sort((a,b) => sortAmount && !nearest ? (b.amount ?? -1) - (a.amount ?? -1) : upcoming ? a.deadline.localeCompare(b.deadline) : b.date.localeCompare(a.date) || a.number.localeCompare(b.number,'ru',{numeric:true}))
  if(nearest&&filtered.length){
    const deadline=filtered[0]!.deadline
    filtered=filtered.filter(row=>row.deadline===deadline)
    dateNotice+=`Ближайший указанный срок: ${date(deadline)}. По состоянию на ${date(today)}.\n`
  }
  const base = { draft: null, conversation: { topic: 'contracts' as const, contractQuery: query }, links: [{ label: 'Реестр договоров', to: '/contract-register' }] }
  if (!filtered.length) return { files, reply: { ...base, message: selectedKey ? 'Договор удалён или больше недоступен. Запросите список договоров заново.' : nearest && !until ? 'Среди доступных договоров не найдено указанного срока окончания сегодня или позже. Бессрочные договоры и прошедшие даты не учитывались.' : 'По указанным условиям доступных договоров не найдено.' } }
  if(/откро|откры|перей/u.test(normalize(query)) && /проект/u.test(normalize(query))){
    const projects=[...new Map(filtered.filter(row=>row.projectId&&row.canOpenProject).map(row=>[row.projectId,{label:`Проект: ${row.projectName}`,to:`/projects/${row.projectId}`}])).values()]
    return {files:false,reply:{...base,message:projects.length?'Доступные проекты найденных договоров:':'Договоры доступны в реестре, но нет доступного для открытия связанного проекта.',links:[...projects,...filtered.slice(0,20).map(row=>({label:`Договор ${row.number}`,to:contractLink(row)})),...base.links]}}
  }
  const selected = filtered.length === 1 && (!listing || files || selectedKey || nearest) ? filtered[0] : undefined
  if (selected) {
    const row = selected
    const lines = [`Договор ${row.number || row.code}`, `Код: ${row.code || 'не указан'}`, `Источник: ${source(row)}${row.projectName ? ' · '+row.projectName : ''}`, `Продавец / исполнитель: ${row.seller}`, `Покупатель / заказчик: ${row.buyer}`, `Дата договора: ${date(row.date)}`, `Срок: ${row.noDeadline ? 'без срока' : date(row.deadline)}`, `Автопродление: ${row.autoRenew ? 'да' : 'нет'}`, `Сумма с НДС: ${money(row.amount)}`, `НДС: ${money(row.vatAmount)}`, `Вложения: ${row.fileCount}`]
    if (row.deadline && !row.noDeadline && row.deadline < today) lines.push(row.autoRenew ? 'Указанная дата прошла; включено автопродление. Фактическое прекращение договора по этой дате не подтверждено.' : 'Указанный срок договора прошёл.')
    if(row.deadline&&!row.noDeadline&&row.deadline>=today)lines.push(`До указанного срока: ${Math.round((Date.parse(row.deadline+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000)} дн.`)
    if (row.notes) lines.push(`Примечания: ${row.notes}`)
    for (const field of row.fields || []) lines.push(`${field.label}: ${field.type==='checkbox' ? field.value==='true'?'да':'нет' : field.type==='date' ? date(field.value) : field.value || 'не указано'}`)
    if (row.issue) lines.push(`Проверка данных: ${row.issue}`)
    return { files, selected: row, reply: { ...base, message: dateNotice + lines.join('\n'), conversation: { ...base.conversation, contractKey: contractKey(row) }, links: [{label:`Открыть договор ${row.number}`,to:contractLink(row)}, ...(row.canOpenProject && row.projectId ? [{label:`Проект: ${row.projectName}`,to:`/projects/${row.projectId}`}] : []), ...base.links] } }
  }
  const pages = Math.ceil(filtered.length / 20), current = Math.min(page, pages), visible = filtered.slice((current-1)*20, current*20)
  const summary = visible.map(row => `• ${row.number} · ${row.projectName || 'Без проекта'} · ${row.seller} → ${row.buyer}. Дата: ${date(row.date)}; срок: ${row.noDeadline?'без срока':date(row.deadline)}${row.autoRenew?' (автопродление)':''}; сумма: ${money(row.amount)}; НДС: ${money(row.vatAmount)}; файлов: ${row.fileCount}.`).join('\n')
  const choose = files || !listing
  return { files, reply: { ...base, message: dateNotice + `Найдено доступных договоров: ${filtered.length}. Страница ${current} из ${pages}.\n${summary}${choose?'\nВыберите договор для подробностей и вложений.':''}${pages>1?'\nДля продолжения напишите «страница 2» (или другой номер).':''}`, ...(choose ? {choice:{kind:'registry-contract' as const,prompt:'Выберите договор',options:visible.map(row=>({id:contractKey(row),label:`${row.number} · ${row.projectName||'Без проекта'} · ${row.seller} → ${row.buyer}`}))}} : {}), links: [...visible.map(row=>({label:`Договор ${row.number}`,to:contractLink(row)})),...base.links] } }
}
