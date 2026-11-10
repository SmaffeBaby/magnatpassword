export function shellConfig(origin, version) {
  const url = new URL(origin)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('MAGNAT_SERVER_URL must be an HTTP(S) origin without credentials or a path')
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('Invalid shell version')
  return {
    version,
    build: { frontendDist: `${url.origin}/?native=1&appVersion=${encodeURIComponent(version)}`, beforeBuildCommand: '' },
    app: {
      windows: [{ label: 'main', title: 'Magnat', url: `${url.origin}/?native=1&appVersion=${encodeURIComponent(version)}`, width: 1280, height: 850, minWidth: 360, minHeight: 600, resizable: true, dragDropEnabled: false }],
      security: { capabilities: ['default', { identifier: 'native-actions', windows: ['main'], remote: { urls: [`${url.origin}/*`] }, permissions: ['core:app:allow-version', 'deep-link:default', 'core:event:allow-listen', 'core:event:allow-unlisten', 'allow-open-external', 'allow-save-download', 'allow-notification-permission', 'allow-set-unread-count', 'allow-show-unread-notification'] }] }
    },
    bundle: { createUpdaterArtifacts: false }
  }
}
