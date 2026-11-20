import { operationDocumentation } from '../openapi/operations'

type Operation = {
  summary?: string
  description?: string
  tags?: string[]
  security?: Record<string, string[]>[]
}
type OpenApiDocument = {
  openapi: string
  paths: Record<string, Record<string, Operation>>
  servers?: { url: string }[]
  components?: { securitySchemes?: Record<string, unknown> }
}

const publicPaths = new Set([
  '/api/_nuxt_icon/{collection}',
  '/api/health',
  '/api/app-version',
  '/api/auth/brand',
  '/api/auth/qr/claim',
  '/api/auth/qr/create',
  '/api/auth/qr/inspect',
  '/api/auth/qr/poll',
  '/api/releases/latest',
  '/api/releases/files/{version}/{asset}',
])

export default defineNitroPlugin(nitro => {
  nitro.hooks.hook('beforeResponse', (event, response) => {
    if (getRequestURL(event).pathname !== '/docs/openapi.json') return

    const spec = response.body as OpenApiDocument | undefined
    if (!spec?.openapi || !spec.paths) return

    // Use the origin serving the document, including when reached through the HTTPS proxy.
    spec.servers = [{ url: '/' }]
    spec.components = {
      ...spec.components,
      securitySchemes: {
        ...spec.components?.securitySchemes,
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        releaseBuildToken: { type: 'http', scheme: 'bearer' },
      },
    }

    for (const [path, operations] of Object.entries(spec.paths)) {
      if (!path.startsWith('/api/')) {
        delete spec.paths[path]
        continue
      }

      const group = path.split('/')[2]
      for (const [method, operation] of Object.entries(operations)) {
        const documentation = operationDocumentation[`${method.toUpperCase()} ${path}`]
        if (documentation) {
          const [summary, description] = documentation
          operation.summary ??= summary
          if (description) operation.description ??= description
        }
        if (group && operation.tags?.[0] === 'API Routes') operation.tags = [group]
        if (publicPaths.has(path) || operation.security) continue
        operation.security = path === '/api/releases/plan'
          ? [{ releaseBuildToken: [] }]
          : [{ bearerAuth: [] }]
      }
    }

    setResponseHeaders(event, {
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    })
  })
})
