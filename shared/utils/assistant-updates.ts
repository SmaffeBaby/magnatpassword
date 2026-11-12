import type { AssistantUpdate } from '../types/assistant-updates'
export function updatesCsv(posts: AssistantUpdate[]): string {
  return '\uFEFF' + [['id', 'date', 'kind', 'title', 'body'], ...posts.map(p => [p.id, p.date, p.kind, p.title, p.body])].map(row => row.map(value => '"' + value.replace(/"/g, '""') + '"').join(',')).join('\r\n')
}
export function parseUpdatesCsv(text: string): AssistantUpdate[] {
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false
  text = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++ } else quoted = !quoted }
    else if (c === ',' && !quoted) { row.push(value); value = '' }
    else if ((c === '\n' || c === '\r') && !quoted) { if (c === '\r' && text[i + 1] === '\n') i++; row.push(value); rows.push(row); row = []; value = '' }
    else value += c
  }
  if (quoted) throw new Error('В CSV не закрыты кавычки.')
  if (value || row.length) { row.push(value); rows.push(row) }
  if (rows.shift()?.join(',') !== 'id,date,kind,title,body') throw new Error('Нужны колонки id,date,kind,title,body. Используйте экспорт как шаблон.')
  return rows.filter(row => row.some(Boolean)).map(row => {
    const [id, date, kind, title, body] = row
    if (row.length !== 5 || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !['feature', 'fix'].includes(kind || '') || !title?.trim() || !body?.trim()) throw new Error('Проверьте дату, тип (feature/fix), заголовок и текст CSV.')
    return { id: id || crypto.randomUUID(), date, kind: kind as AssistantUpdate['kind'], title, body }
  })
}
