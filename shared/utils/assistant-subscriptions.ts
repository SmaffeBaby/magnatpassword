import { isSubscriptionHistoryQuestion } from './assistant-payment-history.ts'
import type { AssistantReply } from '../types/assistant'
import type { ScopedCredential } from './vault-sources'
import { subscriptionRows, todayDate, validDate, dateLabel, moneyLabel, periodLabel, subscriptionCardReferences, matchesSubscriptionCard, addPeriod } from './subscriptions.ts'
export function isSubscriptionRead(question: string) {
  if (/проект|договор|связан|связь|связи|парол/iu.test(question)) return false
  if (/(?:^|\s)как\s+.*(?:добав|созда|измен|настро|отмет|оплатить)|где.*(?:посмотр|найти|открыть)/iu.test(question)) return false
  if (isSubscriptionHistoryQuestion(question)) return true
  return /подпис/iu.test(question) && /ближайш|следующ|просроч|скоро|истека|заканч|когда|какие|список|мои|моих|доступн|стоим|стоит|цена|срок|период|автопрод|оплачено/iu.test(question) || /(?:что|когда|какая|какой|какие)[\s\S]{0,30}(?:скоро оплатить|ближайш[а-яё]* (?:оплат|плат[её]ж))/iu.test(question)
}
export function subscriptionReadReply(question: string, entries: ScopedCredential[], today = todayDate(), selected?: string): AssistantReply {
  const rows = subscriptionRows(entries, today), valid = rows.filter(row => validDate(row.subscription.paidUntil))
  const clean = (text: string) => text.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const q = ` ${clean(question)} `
  const named = valid.filter(row => clean(row.entry.title).length >= 3 && q.includes(` ${clean(row.entry.title)} `))
  const picked = selected ? valid.filter(row => `${row.entry.vaultId}/${row.entry.id}` === selected) : []
  const scoped = named.length ? named : picked.length ? picked : valid
  const detail = /стоим|стоит|цена|срок|когда|период|автопрод|оплачено/iu.test(question) && !/ближайш|следующ|просроч|скоро|истека|заканч/iu.test(question)
  if ((detail && !named.length && !picked.length && !/домен|хостинг|почт|(?:[a-z0-9-]+\.)+[a-z]{2,63}/iu.test(question) || named.length && new Set(named.map(row => `${row.entry.vaultId}/${row.entry.id}`)).size > 1 && !picked.length) && valid.length) {
    const options = [...new Map((named.length ? named : valid).map(row => [`${row.entry.vaultId}/${row.entry.id}`, { id: `${row.entry.vaultId}/${row.entry.id}`, label: `${row.entry.title} · ${row.entry.vaultName}` }])).values()]
    return { message: 'О какой подписке рассказать? Выберите карточку ниже.', draft: null, choice: { kind: 'record', prompt: 'Выберите подписку', options } }
  }
  const base = picked.length && named.length > 1 ? picked : scoped
  const category = /домен/iu.test(question) ? /домен|domain/iu : /хостинг|hosting|vps|vds/iu.test(question) ? /хостинг|hosting|vps|vds/iu : /почт/iu.test(question) ? /почт|mail/iu : null
  const domains = [...question.matchAll(/(?:[a-z0-9-]+\.)+[a-z]{2,63}/giu)].map(match => match[0].toLowerCase())
  const current = base.filter(row => {
    const linked = subscriptionCardReferences(row.subscription).flatMap(ref => entries.filter(entry => matchesSubscriptionCard(ref, entry)))
    const labels = [row.entry.title, row.field.label, ...linked.map(entry => entry.title)].join(' ')
    const titleIsDomain = [row.entry.title, ...linked.map(entry => entry.title)].some(title => /^(?:[a-z0-9-]+\.)+[a-z]{2,63}$/iu.test(title.trim()))
    if (category && !category.test(labels) && !(/домен/iu.test(question) && titleIsDomain)) return false
    return !domains.length || domains.some(domain => `${labels} ${row.entry.url} ${linked.map(entry => entry.url).join(' ')}`.toLowerCase().includes(domain))
  })
  const overdue = current.filter(row => row.daysLeft < 0), future = current.filter(row => row.daysLeft >= 0)
  const onlyOverdue = /просроч/iu.test(question), nearest = /ближайш|следующ/iu.test(question) && !/список|какие|подписки|платежи|платёж[и]/iu.test(question)
  const days = /недел|7\s*дн/iu.test(question) ? 7 : /ближайш[а-яё]* месяц|30\s*дн/iu.test(question) ? 30 : undefined
  let matching = onlyOverdue ? overdue : /ближайш|следующ|скоро|истека|заканч/iu.test(question) || days ? future : current
  if (/(?:в этом|текущ[а-яё]*) месяц/iu.test(question)) {
    const from = today.slice(0, 7) + '-01', to = addPeriod(addPeriod(from, 1, 'month'), -1, 'day')
    matching = matching.filter(row => row.subscription.paidUntil >= from && row.subscription.paidUntil <= to)
  }
  if (days !== undefined) matching = matching.filter(row => row.daysLeft >= 0 && row.daysLeft <= days)
  if (nearest && matching.length) matching = matching.filter(row => row.subscription.paidUntil === matching[0]!.subscription.paidUntil)
  const lines = [onlyOverdue ? `Просроченных подписок: ${matching.length}.` : nearest ? 'Ближайшее окончание оплаченного срока:' : `Подписок по запросу: ${matching.length}.`]
  for (const row of matching.slice(0, 20)) lines.push(`• ${row.entry.title} · ${row.field.label} · ${row.entry.vaultName}. Оплачено до: ${dateLabel(row.subscription.paidUntil)} (${row.daysLeft < 0 ? `просрочено на ${-row.daysLeft} дн.` : row.daysLeft === 0 ? 'сегодня' : `через ${row.daysLeft} дн.`}). Стоимость: ${moneyLabel(row.subscription)} / ${periodLabel(row.subscription)}. Автопродление: ${row.subscription.autoRenew ? 'включено' : 'выключено'}.`)
  if (!matching.length) lines.push(!rows.length ? 'В доступных вам карточках подписки не найдены.' : onlyOverdue ? 'Среди доступных подписок с корректной датой просроченных нет.' : 'Подходящих подписок с корректной датой в доступных карточках нет.')
  if (!onlyOverdue && overdue.length) lines.push(`Отдельно есть просроченные подписки: ${overdue.length}. Самый ранний срок: ${dateLabel(overdue[0]!.subscription.paidUntil)}. Напишите «Какие подписки просрочены?», чтобы увидеть их.`)
  if (matching.length > 20) lines.push(`Показаны первые 20 из ${matching.length}; полный список — в разделе «Ближайшие подписки».`)
  if (rows.length !== valid.length) lines.push(`Не удалось учесть записи с некорректной датой: ${rows.length - valid.length}.`)
  lines.push('Даты взяты из сохранённых карточек. Окончание оплаченного срока не подтверждает фактическое списание денег. Дата сравнения: ' + dateLabel(today) + ' (Москва).')
  return { message: lines.join('\n'), draft: null, conversation: { topic: 'site' }, links: [{ label: 'Ближайшие подписки', to: '/finances/subscriptions' }] }
}
