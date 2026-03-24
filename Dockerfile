# Multi-stage build for user-management-ui (Next.js)
#
# Stage 1: Node.js builder — install deps, build Next.js
# Stage 2: Node.js runtime — run Next.js + Express API
#
# Quality gates (typecheck + lint + build) run in cloudbuild.yaml BEFORE this build.

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Production: Node.js runtime ───────────────────────────────────
FROM node:20-alpine AS prod

WORKDIR /app

COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/server ./server

EXPOSE 5184 8017

CMD ["sh", "-c", "node server/index.js & npx next start -p 5184"]
