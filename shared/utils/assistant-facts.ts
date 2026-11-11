// Factual questions without an implemented reader must not turn help headings into real records.
export function requiresVerifiedFacts(question: string) {
  if (/^(?:как|где)[\s\S]{0,30}(?:добав|созда|измен|удал|посмотр|найти|откры|настро|прикреп|отмет|оплатить)/iu.test(question) || /что такое|для чего|что (?:умеет|можно)|как работает/iu.test(question)) return false
  return /подпис|проект|договор|задач|карточ|сотрудник|команд|парол|домен|хостинг/iu.test(question) && /како|кака|каки|сколько|кто|когда|покаж|найд|список|истека|статус|оплач|просроч|ближай/iu.test(question)
}
