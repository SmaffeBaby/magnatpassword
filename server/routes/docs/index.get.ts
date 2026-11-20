export default defineEventHandler(event => {
  setResponseHeaders(event, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'X-Robots-Tag': 'noindex, nofollow',
  })

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Magnat API — Swagger UI</title>
    <link rel="stylesheet" href="/docs/assets/swagger-ui.css">
    <script src="/docs/assets/swagger-ui-bundle.js" defer></script>
    <script src="/docs/init.js" defer></script>
  </head>
  <body>
    <div id="swagger-ui"></div>
  </body>
</html>`
})
