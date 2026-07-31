# Arquitetura — InvestHub

Plataforma premium de gestão e análise de investimentos (B3). Este documento descreve a arquitetura da Fase 1 (fundação): autenticação, banco de dados, camadas de código e infraestrutura Docker. Funcionalidades de produto (carteira, screener, valuation, IA etc.) são construídas nas fases seguintes sobre esta base.

## 1. Princípios

- **Clean Architecture**: regra de negócio nunca vive em componentes React. Componentes só renderizam e disparam ações.
- **Fluxo de dependência único**: `app (rotas)` → `services` → `repositories` → `Prisma / APIs externas`. Nunca o inverso, nunca pular camada a partir da UI.
- **Server-first**: Next.js App Router com Server Components e Server Actions/Route Handlers como padrão. Client Components apenas onde há interatividade.
- **Multi-tenant por usuário**: todo dado sensível é escopado por `userId`, aplicado na camada de repository.
- **Segurança por padrão**: toda rota de API é autenticada e validada por schema antes de tocar o banco.

## 2. Camadas

```
src/
├── app/            Rotas (App Router). Apenas composição de UI + chamada de services/actions. Zero SQL, zero regra de negócio.
├── components/     Componentes de UI puros (ui/ = shadcn, demais = compostos por domínio). Recebem dados via props.
├── hooks/          Hooks de cliente (useX) — estado de UI, data fetching client-side (SWR/React Query futuro), nunca regra de negócio financeira.
├── services/       Regra de negócio e orquestração. Ex: AuthService, PortfolioService. Chamado pela camada app. Faz validação de regras (não de shape — isso é schemas/validators).
├── repositories/   Acesso a dados (Prisma) e a APIs externas de mercado. Única camada que importa @/lib/prisma. Retorna entidades tipadas, não modelos Prisma crus quando possível.
├── schemas/        Schemas Zod para validação de entrada/saída (request/response, formulários).
├── validators/     Regras de validação de domínio reutilizáveis (ex: força de senha, ticker válido) usadas por schemas e services.
├── types/           Tipos e contratos de domínio (DTOs, enums espelhados do Prisma quando necessário no client).
├── utils/          Funções puras sem estado e sem I/O (formatação de moeda, datas, cálculo financeiro puro).
├── lib/            Singletons de infraestrutura: prisma client, redis, logger, auth config, email, rate-limit, crypto.
├── config/         Configuração estática da aplicação (nav items, feature flags, limites).
└── constants/      Constantes de domínio (enums de UI, mensagens padrão).
```

Regra prática: **se o dado vem de fora (banco, API, arquivo) ele passa por repository → service antes de chegar em um componente.** Componentes de servidor podem chamar `services` diretamente; Route Handlers/Server Actions chamam `services`.

## 3. Fluxo de uma requisição (exemplo: login)

```
[LoginForm.tsx]  (client component, react-hook-form + zod resolver)
      │  submit
      ▼
[Server Action / app/api/auth/*]   valida input com schemas/auth.schema.ts
      │
      ▼
[services/auth.service.ts]   regra de negócio: verifica tentativas, aplica rate limit,
      │                      decide 2FA, registra auditoria
      ▼
[repositories/user.repository.ts]  consulta/gravação via Prisma
      │
      ▼
[PostgreSQL]
```

Auth.js (`src/lib/auth.ts`) usa um `CredentialsProvider` cuja função `authorize` delega para `services/auth.service.ts` — a lógica de autenticação vive no service, não no config do NextAuth, para ser testável isoladamente.

## 4. Segurança (implementado na Fase 1)

| Camada | Mecanismo |
|---|---|
| Transporte | Cookies `httpOnly`, `secure` (produção), `sameSite=lax`; HSTS via headers |
| Sessão | JWT assinado (Auth.js), rotação de sessão, expiração configurável |
| Senha | `bcryptjs` (custo 12), nunca texto plano, política de força no schema Zod |
| CSRF | Proteção nativa do Auth.js (double-submit token) + `sameSite` cookies |
| XSS | CSP estrita via headers (`next.config.ts`), sanitização de output, React escaping por padrão |
| SQL Injection | Prisma (queries parametrizadas) — nunca query raw com interpolação de string |
| Rate limiting | Redis (`src/lib/rate-limit.ts`), aplicado em login, registro, reset de senha |
| Headers | Equivalente Helmet via `next.config.ts` (`X-Frame-Options`, `X-Content-Type-Options`, `Permissions-Policy`, etc.) |
| Auditoria | Tabela `LoginAudit` (IP, user agent, sucesso/falha, timestamp) + `AuditLog` genérico para ações sensíveis |
| 2FA | TOTP opcional (`otplib`), segredo armazenado cifrado (`ENCRYPTION_KEY`) |
| Autorização | `middleware.ts` protege rotas `(dashboard)` e `api/*` exceto `api/auth/*` públicas |

## 5. Banco de dados

PostgreSQL + Prisma. Ver [`prisma/schema.prisma`](prisma/schema.prisma) para o modelo completo. Domínios principais:

- **Identidade/Auth**: `User`, `Account`, `Session`, `VerificationToken`, `PasswordResetToken`, `LoginAudit`, `AuditLog`.
- **Mercado (dados mestres, alimentados por integrações futuras)**: `Asset`, `AssetFundamental` (série histórica de indicadores), `AssetPrice` (série histórica de preço), `AssetDividend`.
- **Carteira do usuário**: `Broker`, `Transaction` (fonte da verdade, ledger de compras/vendas), `Position` (posição consolidada, materializada por service após cada transação).
- **Planejamento**: `AllocationTarget` (metas de alocação por classe/setor/ticker), `ScoreWeight` (pesos do score 0–100 personalizáveis), `ValuationAssumption` (parâmetros de Graham/Bazin/DCF por usuário).
- **Acompanhamento**: `Watchlist`, `WatchlistItem`, `Alert`, `Notification`.

Todas as tabelas de domínio do usuário têm `userId` com `onDelete: Cascade` e índice composto para isolamento e performance.

## 6. Docker / escalabilidade

- `app`: container Next.js standalone (multi-stage build, imagem final mínima `node:alpine`).
- `postgres`: PostgreSQL 16 com volume nomeado.
- `redis`: cache + rate limiting + (futuro) filas de job para sincronização de mercado.
- Stateless no container de app → permite escalar horizontalmente (`docker compose up --scale app=N`) atrás de um load balancer.
- Sessão em JWT (não em memória do servidor) para não exigir sticky sessions.

## 7. Qualidade

- **ESLint + Prettier**: padronização e regra customizada impedindo componente importar `repositories`/`prisma` diretamente.
- **Husky + lint-staged**: bloqueia commit com lint/format quebrado.
- **Vitest**: testes unitários de `services`, `utils`, `validators`.
- **Playwright**: testes E2E de fluxos críticos (login, cadastro).

## 8. Roadmap de entrega

Fase 1 (esta entrega): arquitetura, estrutura de pastas, banco de dados, Prisma, autenticação, layout base.
Fases seguintes (uma funcionalidade por vez, mediante confirmação): Dashboard → Carteira → Recomendação de Aporte → Alocação → Screener Ações/FIIs → Valuation → Tela do Ativo → Preço Teto → Watchlist/Alertas → Importação/Exportação → Perfil/Configurações → Integrações de mercado → Score Inteligente → IA opcional.
