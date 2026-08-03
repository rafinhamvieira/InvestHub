# syntax=docker/dockerfile:1

# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
# O .npmrc carrega legacy-peer-deps (conflito de peers do next-auth beta com o @auth/core);
# sem ele o `npm ci` resolveria diferente do ambiente local. O glob evita falhar se não existir.
COPY package.json package-lock.json* .npmrc* ./
RUN npm ci
# O schema entra depois do `npm ci` de propósito: mudar o schema não pode invalidar a
# instalação das dependências. O `generate` roda aqui, e não no builder, porque aqui o
# engine baixado pelo `npm ci` está no mesmo estágio — o builder só copia o node_modules
# e, ao rodar `generate` lá, o Prisma ia à rede reconferir o binário. Com isso o estágio
# que compila o app não precisa de DNS nenhuma vez.
COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate

# ---------- builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# As páginas públicas (login, cadastro) são pré-renderizadas aqui, e é aqui que o endereço
# das imagens de pré-visualização é gravado nelas. Sem este argumento o build usaria
# localhost e a prévia do link quebraria justamente nas páginas que alguém compartilha.
# O `.env` do runtime chega tarde demais para elas.
ARG APP_URL
ENV APP_URL=${APP_URL}
# O Git não versiona diretórios vazios: se public/ não tiver nenhum arquivo, ele não
# chega no clone e o COPY do estágio runner falha. Garantir a pasta aqui torna o build
# independente disso.
RUN mkdir -p /app/public
# Sem `prisma generate` aqui: o client já vem gerado em node_modules/.prisma, copiado do
# estágio deps. Ver o comentário lá.
RUN npm run build

# ---------- runner ----------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# pg_dump para o backup sob demanda do painel administrativo. A versão precisa acompanhar
# a do servidor (Postgres 16): cliente mais antigo recusa dump de banco mais novo.
RUN apk add --no-cache postgresql16-client

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "server.js"]
