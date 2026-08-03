# InvestHub

Plataforma premium de gestão e análise de investimentos na B3 — carteira, dividendos, valuation e recomendações inteligentes. Ver [ARCHITECTURE.md](ARCHITECTURE.md) para detalhes de arquitetura, camadas e modelo de dados.

> **Status**: em produção. Produto completo (dashboard, carteira, aporte, alocação, proventos, renda fixa, screeners, valuation, watchlist, importação/exportação). Painel administrativo em construção por etapas — Etapa 1 (auditoria imutável, RBAC e sessões) e Etapa 2 (números de negócio e resumo de saúde) entregues.

## Stack

Next.js 15 · React · TypeScript · TailwindCSS · Shadcn UI · Framer Motion · PostgreSQL · Prisma · Auth.js · Docker

## Deploy em produção

Para colocar no ar em um servidor Ubuntu com HTTPS, siga o guia dedicado: **[DEPLOY.md](DEPLOY.md)**.

## Como rodar localmente

Em desenvolvimento, apenas o banco e o cache sobem em containers; a aplicação roda direto com `npm run dev` (hot reload). Os serviços `nginx`/`certbot` do compose são específicos de produção e exigem domínio real com certificado — não use localmente.

Requer Node 20+ e Docker.

1. Copie o arquivo de ambiente:

   ```bash
   cp .env.example .env
   ```

   Ajuste para o ambiente local e gere os segredos:

   ```ini
   NODE_ENV=development
   APP_URL=http://localhost:3000
   AUTH_URL=http://localhost:3000
   DATABASE_URL=postgresql://investhub:SENHA@localhost:5432/investhub?schema=public
   REDIS_URL=redis://localhost:6379
   ```

   ```bash
   openssl rand -base64 32   # AUTH_SECRET
   openssl rand -hex 32      # ENCRYPTION_KEY
   ```

   > Note que localmente os hosts são `localhost` (e não `postgres`/`redis`, que são os nomes dos serviços dentro da rede do Docker).

2. Suba Postgres e Redis, expondo as portas para a sua máquina:

   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

3. Instale as dependências e crie a migração inicial (uma única vez — o repositório ainda não tem migrações):

   ```bash
   npm install
   npx prisma migrate dev --name init
   ```

4. (Opcional) Popule ativos de exemplo:

   ```bash
   npm run prisma:seed
   ```

5. Rode a aplicação:

   ```bash
   npm run dev
   ```

   Acesse http://localhost:3000.

> Sem `RESEND_API_KEY`, os e-mails não são enviados — ficam registrados no log. Como o login exige e-mail confirmado, marque sua conta como verificada direto no banco durante o desenvolvimento:
> ```bash
> npx prisma studio
> ```
> e preencha o campo `emailVerified` do seu usuário.

## Escalando em produção

O container `app` é stateless (sessão via JWT, sem estado em memória), então pode ser escalado livremente atrás do `nginx`:

```bash
docker compose up -d --scale app=3
```

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run lint` / `npm run format` | Lint e formatação |
| `npm run typecheck` | Checagem de tipos |
| `npm test` | Testes unitários (Vitest) |
| `npm run test:e2e` | Testes end-to-end (Playwright) |
| `npm run prisma:studio` | Explorador visual do banco |

## Estrutura

Ver a seção "Camadas" em [ARCHITECTURE.md](ARCHITECTURE.md). Resumo:

```
src/app          rotas (App Router)
src/components   UI (ui/ = primitivos shadcn, demais = por domínio)
src/services     regra de negócio
src/repositories acesso a dados (Prisma)
src/schemas      validação Zod
src/lib          infraestrutura (auth, prisma, redis, email, logger)
prisma/          schema e migrações
docker/          nginx e assets de container
```

## Segurança

JWT · bcrypt · CSRF · proteção XSS (CSP) · rate limiting (Redis) · cookies `httpOnly`/`secure`/`sameSite` · auditoria de login · 2FA opcional (TOTP). Detalhes em [ARCHITECTURE.md § Segurança](ARCHITECTURE.md#4-segurança-implementado-na-fase-1).
