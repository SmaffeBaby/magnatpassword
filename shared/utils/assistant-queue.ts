import type { AssistantQueueStatus } from '../types/assistant'
export class AssistantQueueError extends Error {
  code: 'FULL' | 'OWNER_LIMIT' | 'WAIT_TIMEOUT'
  constructor(code: 'FULL' | 'OWNER_LIMIT' | 'WAIT_TIMEOUT') { super(code); this.code = code; this.name = 'AssistantQueueError' }
}
type Job = { owner: string; entered: number; signal?: AbortSignal; notify?: (status: AssistantQueueStatus) => void | Promise<void>; resolve: (release: () => void) => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout>; abort: () => void }

// One Nitro process owns the single local inference slot. Pending requests contain no chat text.
export class AssistantQueue {
  private active: Job | null = null
  private pending: Job[] = []
  private capacity: number
  private waitMs: number
  constructor(capacity = 12, waitMs = 600000) { this.capacity = capacity; this.waitMs = waitMs }
  acquire(owner: string, options: { signal?: AbortSignal; onStatus?: Job['notify'] } = {}): Promise<() => void> {
    const { signal } = options
    if (signal?.aborted) return Promise.reject(this.cancelled())
    if (this.pending.length >= this.capacity && this.active) return Promise.reject(new AssistantQueueError('FULL'))
    if (this.pending.filter(job => job.owner === owner).length + (this.active?.owner === owner ? 1 : 0) >= 2) return Promise.reject(new AssistantQueueError('OWNER_LIMIT'))
    return new Promise((resolve, reject) => {
      const job: Job = { owner, entered: Date.now(), signal, notify: options.onStatus, resolve, reject, abort: () => this.remove(job, this.cancelled()) }
      signal?.addEventListener('abort', job.abort, { once: true })
      job.timer = setTimeout(() => this.remove(job, new AssistantQueueError('WAIT_TIMEOUT')), this.waitMs)
      job.timer.unref?.()
      this.pending.push(job)
      this.pump()
      this.notify()
    })
  }
  private cancelled() { const error = new Error('Request cancelled'); error.name = 'AbortError'; return error }
  private clean(job: Job) { clearTimeout(job.timer); job.signal?.removeEventListener('abort', job.abort) }
  private remove(job: Job, error: Error) {
    const index = this.pending.indexOf(job)
    if (index < 0) return
    this.pending.splice(index, 1); this.clean(job); job.reject(error); this.pump(); this.notify()
  }
  private pump() {
    if (this.active) return
    const job = this.pending.shift()
    if (!job) return
    this.active = job; this.clean(job)
    let released = false
    job.resolve(() => {
      if (released) return
      released = true; this.active = null; this.pump(); this.notify()
    })
  }
  private notify() {
    const send = (job: Job, position: number) => {
      try { Promise.resolve(job.notify?.({ state: position ? 'queued' : 'running', position, waiting: this.pending.length, waitedMs: Date.now() - job.entered })).catch(() => {}) } catch { /* A disconnected client cannot stall other requests. */ }
    }
    if (this.active) send(this.active, 0)
    this.pending.forEach((job, index) => send(job, index + 1))
  }
}
