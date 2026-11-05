export interface AccountDevice {
  id: string
  kind: 'web' | 'app'
  platform: string
  browser: string
  createdAt: string
  lastSeen: string
  current: boolean
}
