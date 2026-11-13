type SignedAvatar = { path: string; signedUrl: string }

// Reuse signatures, not profile/access decisions. Call only after checking access.
export function createAvatarUrlCache(maxEntries = 1000) {
  const entries = new Map<string, { url: string; expiresAt: number }>()
  return async (accountId: string, paths: string[], sign: (paths: string[]) => Promise<SignedAvatar[]>, now = Date.now()) => {
    const urls = new Map<string, string>()
    const missing: string[] = []
    for (const path of new Set(paths)) {
      const key = JSON.stringify([accountId, path])
      const cached = entries.get(key)
      if (cached && cached.expiresAt > now) urls.set(path, cached.url)
      else { entries.delete(key); missing.push(path) }
    }
    if (missing.length) {
      for (const item of await sign(missing)) {
        if (!missing.includes(item.path) || !item.signedUrl) continue
        urls.set(item.path, item.signedUrl)
        entries.set(JSON.stringify([accountId, item.path]), { url: item.signedUrl, expiresAt: now + 55 * 60_000 })
        while (entries.size > maxEntries) entries.delete(entries.keys().next().value!)
      }
    }
    return urls
  }
}

export function avatarCacheControl(request: URL, method: string, status: number, contentType: string | null, now = Date.now()): string {
  if (!['GET', 'HEAD'].includes(method) || ![200, 304].includes(status)
    || !/^\/supabase\/storage\/v1\/object\/sign\/profile-avatars\/[^/]+\/[^/]+\.(?:png|jpe?g|webp)$/.test(request.pathname)
    || (status === 200 && !/^image\/(?:png|jpeg|webp)(?:;|$)/i.test(contentType || ''))) return 'no-store'
  // The upstream validates the signature. This only bounds the browser cache TTL.
  try {
    const token = request.searchParams.get('token') || ''
    if (token.length > 8192 || token.split('.').length !== 3) return 'no-store'
    const { exp } = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'))
    if (typeof exp !== 'number' || !Number.isFinite(exp)) return 'no-store'
    const seconds = Math.min(3600, Math.floor(exp - now / 1000 - 30))
    return seconds > 0 ? `private, max-age=${seconds}` : 'no-store'
  } catch { return 'no-store' }
}
