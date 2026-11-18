FROM node:24-alpine AS document-editors
WORKDIR /editors
RUN apk add --no-cache unzip
COPY scripts/prepare-document-editors.mjs scripts/document-editors.json ./scripts/
RUN --mount=type=cache,target=/editors/artifacts/document-editors node scripts/prepare-document-editors.mjs

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
COPY --from=document-editors /editors/public/editors ./public/editors
RUN NODE_OPTIONS=--max-old-space-size=1536 npm run build

FROM node:24-alpine AS runner
RUN apk add --no-cache python3 py3-reportlab font-dejavu libreoffice-writer libreoffice-impress poppler-utils
WORKDIR /app
ENV NODE_ENV=production NITRO_HOST=0.0.0.0 NITRO_PORT=3000
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/scripts/finance-report.py ./scripts/finance-report.py
COPY --from=build --chown=node:node /app/scripts/project-estimate.py ./scripts/project-estimate.py
COPY --from=build --chown=node:node /app/scripts/project-execution.py ./scripts/project-execution.py
COPY --from=build --chown=node:node /app/scripts/templates ./scripts/templates
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=8s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
