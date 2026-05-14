FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# ---- Install dependencies ----
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY docs/package.json ./docs/
COPY packages/better-activity/package.json ./packages/better-activity/
COPY packages/react/package.json ./packages/react/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter=docs... --ignore-scripts

# ---- Build ----
FROM base AS builder
WORKDIR /app

COPY --from=deps /app /app
COPY . .

RUN pnpm --filter=docs build

# ---- Runtime ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

COPY --from=builder /app/docs/.output ./

EXPOSE 3000

CMD ["node", "server/index.mjs"]
