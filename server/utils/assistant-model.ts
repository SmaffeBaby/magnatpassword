import type { H3Event } from 'h3'
import { AssistantOutputError, repetitiveAssistantText } from '../../shared/utils/assistant-output.ts'
export async function assistantModel(event: H3Event, body: Record<string, unknown>, onDelta?: (text: string) => Promise<void>, signal?: AbortSignal) {
  const controller = new AbortController(), timeout = AbortSignal.timeout(90000)
  const combined = AbortSignal.any([timeout, controller.signal, ...(signal ? [signal] : [])])
  const response = await fetch(`${useRuntimeConfig(event).ollamaUrl}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, stream: !!onDelta }), signal: combined })
  if (!response.ok) throw new Error('Model unavailable')
  if (!onDelta) {
    const result = await response.json() as { message: { content: string }; done_reason?: string }
    if (!body.format && repetitiveAssistantText(result.message.content)) throw new AssistantOutputError()
    return result
  }
  const reader = response.body!.getReader(), decoder = new TextDecoder()
  let buffer = '', content = '', reason = '', done = false
  async function consume(line: string) {
    if (!line.trim()) return
    const item = JSON.parse(line)
    if (item.error) throw new Error('Model failed')
    if (item.message?.content) {
      content += item.message.content
      if (repetitiveAssistantText(content)) throw new AssistantOutputError()
      await onDelta!(item.message.content)
    }
    if (item.done) { done = true; reason = item.done_reason }
  }
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      buffer += decoder.decode(part.value, { stream: true })
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); await consume(line) }
    }
    buffer += decoder.decode(); await consume(buffer)
    if (!done) throw new Error('Incomplete stream')
    return { message: { content }, done_reason: reason }
  } catch (failure) {
    controller.abort(); await reader.cancel().catch(() => {}); throw failure
  } finally { reader.releaseLock() }
}
