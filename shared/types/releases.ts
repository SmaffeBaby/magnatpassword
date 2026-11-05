export interface ReleaseDownload {
  platform: string
  label: string
  asset?: string
  url?: string
  signingExpiresAt?: string
}
export interface AppRelease {
  version: string
  notes: string
  publishedAt: string
  downloads: ReleaseDownload[]
}
