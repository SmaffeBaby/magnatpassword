import { isTauri } from '@tauri-apps/api/core'
export function isNativeShell(): boolean {
  if (!import.meta.client) return false
  try {
    if (isTauri() || new URLSearchParams(location.search).get('native') === '1') {
      sessionStorage.setItem('magnat-native-shell', '1')
      return true
    }
    return sessionStorage.getItem('magnat-native-shell') === '1'
  } catch { return isTauri() }
}
