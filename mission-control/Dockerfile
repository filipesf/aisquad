# ── Base ────────────────────────────────────────────
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.17.1 --activate
WORKDIR /app

# ── Dependencies ────────────────────────────────────
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/control-api/package.json apps/control-api/
COPY apps/mission-ui/package.json apps/mission-ui/
COPY apps/workers/package.json apps/workers/
RUN pnpm install --frozen-lockfile

# ── Build ───────────────────────────────────────────
FROM deps AS build
COPY . .
RUN pnpm --filter @mc/shared build
RUN pnpm --filter @mc/control-api build
RUN pnpm --filter @mc/mission-ui build

# ── API Runtime ─────────────────────────────────────
FROM base AS api
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/control-api/node_modules ./apps/control-api/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/apps/control-api/dist ./apps/control-api/dist
COPY --from=build /app/apps/control-api/package.json ./apps/control-api/
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./
EXPOSE 3000
CMD ["node", "apps/control-api/dist/index.js"]

# ── UI (nginx) ──────────────────────────────────────
FROM nginx:alpine AS ui
COPY --from=build /app/apps/mission-ui/dist /usr/share/nginx/html
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 5173

# ── Worker Runtime ──────────────────────────────────
FROM base AS worker
RUN npm install -g tsx
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/workers/node_modules ./apps/workers/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/apps/workers ./apps/workers
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./
COPY --from=build /app/tsconfig.base.json ./
ENTRYPOINT ["tsx"]

# ── Migrate Runtime ─────────────────────────────────
FROM base AS migrate
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/db ./db
COPY --from=build /app/package.json ./
CMD ["node", "db/migrate.js"]
