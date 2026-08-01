# Checklist de deploy

Passo a passo do que fazer a cada mudança, da máquina local até a verificação no ar.
Detalhes de infraestrutura em [DEPLOY.md](DEPLOY.md); estado do projeto em [HANDOFF.md](HANDOFF.md).

---

## 1. Antes de commitar (máquina local)

```bash
npm run typecheck && npm run lint && npm test
```

Os três precisam passar. O hook de commit já roda parte disso, mas rodar antes evita commit quebrado.

### Testes de integração (opcional, contra banco real)

Os testes de `npm test` são de função pura. Os de integração exercitam o caminho completo
— transação → posição consolidada → carteira agrupada — contra um Postgres de verdade.
Rodam no servidor, num banco separado, usando a imagem `migrate` (que tem as dependências
de desenvolvimento):

```bash
docker compose exec -T postgres psql -U investhub -d postgres -c "CREATE DATABASE investhub_test;"
```

```bash
docker compose run --rm -e DATABASE_URL="postgresql://investhub:$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2)@postgres:5432/investhub_test" -e TEST_DATABASE_URL="postgresql://investhub:$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2)@postgres:5432/investhub_test" migrate sh -c "npx prisma migrate deploy && npx vitest run --config vitest.integration.config.ts"
```

Sem `TEST_DATABASE_URL` a suíte se declara ignorada em vez de falhar — por isso ela não
atrapalha o `npm test` do dia a dia. O banco de teste é truncado a cada caso; o banco de
produção nunca é tocado.

## 2. Commitar e enviar

```bash
git add -A && git commit -m "feat: descrição curta" && git push
```

Prefixos usados: `feat:` (novidade), `fix:` (correção), `chore:` (manutenção), `docs:`.

## 3. Backup do banco (antes de qualquer mudança com migração)

O serviço `backup` do compose já gera um dump por dia em `./backups`, com 7 dias de
retenção. Antes de uma migração, force um extra — o automático pode ter rodado horas atrás:

```bash
docker compose exec -T postgres pg_dump -U investhub investhub | gzip > ./backups/pre-migracao-$(date +%F-%H%M).sql.gz
```

Migração aplicada não volta atrás sozinha. Este é o seguro.

Para restaurar (destrutivo — sobrescreve o banco atual):

```bash
gunzip -c ./backups/ARQUIVO.sql.gz | docker compose exec -T postgres psql -U investhub -d investhub
```

## 4. Deploy no servidor

```bash
cd /opt/investhub && git pull && docker compose up -d --build app
```

Um comando cobre tudo: baixa o código, rebuilda a imagem, recarrega o `.env` e aplica as
migrações pendentes — o serviço `migrate` roda até o fim antes de o `app` subir.

## 5. Confirmar que subiu limpo

```bash
docker compose logs --tail 50 app
```

Procure `Ready in` e ausência de `error`. Erro de migração aparece aqui, antes de a
aplicação responder.

## 6. Sincronizar dados (só quando a mudança mexe em integração)

```bash
docker compose exec -T app node -e "fetch('http://localhost:3000/api/market/sync',{method:'POST',headers:{'x-cron-secret':process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log)"
```

No dia a dia é dispensável: o `scheduler` faz o mesmo a cada 30 minutos. Rode à mão quando
quiser o resultado imediato.

## 7. Verificar na tela

Abra a parte que mudou e valide com dado real, não só com o log.

---

## Diagnóstico quando algo sai errado

Erros recentes da aplicação:

```bash
docker compose logs app | grep -iE "erro|falha|warn" | tail -20
```

Estado geral do banco:

```bash
docker compose exec -T postgres psql -U investhub -d investhub -c "SELECT (SELECT count(*) FROM assets) ativos, (SELECT count(*) FROM asset_dividends) proventos, (SELECT count(*) FROM transactions) transacoes;"
```

Cobertura das filas de rotação (fundamentos e proventos):

```bash
docker compose exec -T postgres psql -U investhub -d investhub -c "SELECT type, count(*) total, count(\"fundamentalsCheckedAt\") fund_tentados, count(\"dividendsCheckedAt\") div_tentados FROM assets GROUP BY type ORDER BY total DESC;"
```

Último sync bem-sucedido e se o job está considerado parado:

```bash
docker compose exec -T app node -e "fetch('http://localhost:3000/api/health').then(r=>r.json()).then(d=>console.log(JSON.stringify(d)))"
```

Backups gerados e retenção:

```bash
ls -lh backups | tail -10
```

Dados "grudados" depois de trocar de plano ou de fonte — limpar o cache resolve:

```bash
docker compose exec -T redis redis-cli FLUSHALL
```

---

## Regras que valem sempre

- **Nunca `docker compose down -v`.** O `-v` apaga volumes: banco e certificados junto.
- **Mexeu no `.env`?** `git pull` não recarrega variável. Use o passo 4 ou
  `docker compose up -d --force-recreate app`.
- **`.env` com chave duplicada** dá comportamento imprevisível — o processo do app e o
  `docker compose exec` podem ler valores diferentes. Confira com
  `grep -c '^CHAVE=' .env` (tem que ser 1).
- **Cotas dos provedores:** `FUNDAMENTALS_PER_CYCLE` acima de 4 estoura as 200 chamadas
  diárias do plano gratuito do Bolsai. `DIVIDENDS_PER_CYCLE` usa fonte gratuita, o limite
  é bom senso.
