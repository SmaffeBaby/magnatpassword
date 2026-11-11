export function repetitiveAssistantText(text: string): boolean {
  const words = (text.toLocaleLowerCase('ru').match(/[\p{L}\p{N}]+/gu) || []).slice(-100)
  for (let width = 1; width <= 12; width++) {
    const repeats = width === 1 ? 5 : 4
    if (words.length < width * repeats) continue
    const end = words.slice(-width).join(' ')
    if (end.length < 3) continue
    let matching = true
    for (let repeat = 2; repeat <= repeats; repeat++) {
      if (words.slice(-width * repeat, -width * (repeat - 1)).join(' ') !== end) { matching = false; break }
    }
    if (matching) return true
  }
  return false
}
export class AssistantOutputError extends Error {
  constructor() { super('Repetitive model output'); this.name = 'AssistantOutputError' }
}
