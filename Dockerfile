FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN NODE_OPTIONS=--max-old-space-size=1536 npm run build

FROM node:24-alpine AS runner
RUN apk add --no-cache python3 py3-reportlab font-dejavu
WORKDIR /app
ENV NODE_ENV=production NITRO_HOST=0.0.0.0 NITRO_PORT=3000
COPY --from=build --chown=node:node /app/.output ./.output
COPY --from=build --chown=node:node /app/scripts/finance-report.py ./scripts/finance-report.py
COPY --from=build --chown=node:node /app/scripts/project-estimate.py ./scripts/project-estimate.py
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=8s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
