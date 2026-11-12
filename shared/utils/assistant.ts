// Secrets may only be copied from the user's own text, never invented by the model.
export function assistantSecret(value: string, userText: string): string {
  if (/^(?:не\s+(?:указан[ао]?|задан[ао]?|извест(?:ен|на|но))|нет|отсутствует|пароль|password|unknown|not\s+(?:specified|provided)|n\/?a|null|none|[—–-])\s*[.!]?$/iu.test(value.trim())) return ''
  return value && userText.includes(value) ? value : ''
}

export function wantsCredential(text: string): boolean {
  if (/^(?:как|где|что|почему|зачем|можно ли|могу ли|умеешь ли|расскажи|объясни|подскажи)/iu.test(text.trim())) return false
  return /(?:добав|сохран|созда|запиш|заве)[\s\S]{0,120}(?:парол|доступ|карточ|логин)|(?:add|save|create)[\s\S]{0,120}(?:password|credential|login)/iu.test(text)
}

export function continuesCredential(text: string): boolean {
  return /^(?:сайт|url|https?:|логин|пароль|название|компания|измени|поменяй|исправь|добавь сайт)/iu.test(text.trim())
}

export function assistantActionKind(text: string): 'create_task' | 'edit_task' | 'move_task' | 'attach_files' | null {
  if (/умеешь|умеет|способен/iu.test(text) || /^(?:как|где|что|почему|расскажи|объясни|подскажи)/iu.test(text.trim())) return null
  if (!/скача|прикрепл[её]н|загруженн/iu.test(text) && /(?:прикреп|загруз|добав)[\s\S]{0,100}(?:файл|документ|вложен)/iu.test(text)) return 'attach_files'
  if (/(?:перемест|перенес|перенёс|передвин|поменяй стади)[\s\S]{0,100}(?:задач|кабан|стади)|(?:задач)[\s\S]{0,100}(?:перемест|перенес)/iu.test(text)) return 'move_task'
  if (/(?:измен|помен|замен|исправ|редакт|переимен|обнов)[\s\S]{0,100}(?:задач)|(?:задач)[\s\S]{0,100}(?:измен|исправ|редакт)/iu.test(text)) return 'edit_task'
  if (/(?:созда|добав|заведи|постав)[\s\S]{0,100}(?:задач)/iu.test(text)) return 'create_task'
  return null
}
