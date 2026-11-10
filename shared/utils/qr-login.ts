export const qrLoginLifetimeMs = 2 * 60 * 1000
export const qrSecretPattern = /^[a-f0-9]{64}$/

// A deep link may select a local confirmation page, never a server or redirect URL.
export function qrTokenFromDeepLink(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'magnat:' || url.hostname !== 'auth' || url.pathname !== '/qr' || url.username || url.password || url.port || url.search) return null
    const token = new URLSearchParams(url.hash.slice(1)).get('token')
    return token && qrSecretPattern.test(token) ? token : null
  } catch { return null }
}
