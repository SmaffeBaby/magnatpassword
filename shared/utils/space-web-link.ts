import { safeUrl } from './crypto'

export const spaceWebLinkMaxLength = 2000

export function spaceWebLinkUrl(value?: string) {
  const input = value?.trim()
  if (!input || input.length > spaceWebLinkMaxLength || !/^https?:\/\//i.test(input)) return

  const url = safeUrl(input)
  if (url && url.length <= spaceWebLinkMaxLength) return url
}
