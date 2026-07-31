# Deploy — Ubuntu Server + Docker Compose + HTTPS

Guia completo para colocar o InvestHub no ar em um servidor Ubuntu com HTTPS (Let's Encrypt) e renovação automática de certificado.

> **Sobre "somente 443"**: todo o tráfego da aplicação roda em HTTPS na porta 443. A porta 80 fica aberta apenas para (a) o Let's Encrypt validar a posse do domínio e (b) redirecionar quem digitar `http://` para `https://`. Nenhum conteúdo da aplicação é servido em HTTP. Fechar a 80 completamente impede a emissão e a renovação do certificado.

---

## 0. Pré-requisitos

| Item | Mínimo recomendado |
|---|---|
| Servidor | Ubuntu Server 22.04 ou 24.04 LTS |
| CPU / RAM | 2 vCPU / 4 GB (1 vCPU / 2 GB roda, mas o build fica lento) |
| Disco | 20 GB |
| Domínio | Obrigatório para HTTPS — veja abaixo como obter um de graça |
| Acesso | SSH com usuário sudo |

**Por que um domínio é obrigatório:** o Let's Encrypt não emite certificado para endereço IP — ele precisa de um nome para validar a posse. Sem domínio, não há HTTPS confiável.

Escolha um dos dois caminhos abaixo.

### Caminho A — Subdomínio gratuito com DuckDNS

Não custa nada, leva dois minutos e gera um certificado tão válido quanto o de um domínio pago (cadeado verde, sem aviso no navegador). É o suficiente para uso pessoal e para testar a plataforma.

1. Acesse [duckdns.org](https://www.duckdns.org) e entre com Google, GitHub ou Reddit.
2. No campo **sub domain**, digite o nome desejado (ex: `investhub`) e clique em **add domain**.
   Se o nome já estiver em uso, tente uma variação (`investhub-rafael`, `investhub-app`).
3. Na linha do domínio criado, preencha **current ip** com o IP público do servidor e clique em **update ip**.
4. Anote o **token** exibido no topo da página (guarde, é a sua credencial).

Seu domínio será `SEUNOME.duckdns.org`.

> **Nota:** o DuckDNS costuma remover subdomínios sem uso por muito tempo. Como seu servidor fica no ar permanentemente, isso não é um problema — mas se pretende vender a plataforma, registre um domínio próprio (Caminho B).

Se o IP do seu servidor mudar (comum em conexões domésticas, raro em VPS), atualize com:

```bash
curl "https://www.duckdns.org/update?domains=SEUNOME&token=SEU-TOKEN&ip="
```

Deixando `ip=` vazio, o DuckDNS usa automaticamente o IP de onde a requisição partiu. Para manter sincronizado sozinho, agende no servidor:

```bash
crontab -e
```

```
*/5 * * * * curl -s "https://www.duckdns.org/update?domains=SEUNOME&token=SEU-TOKEN&ip=" >/dev/null
```

### Caminho B — Domínio próprio

Recomendado se a plataforma for comercial: você tem a marca, e-mail no próprio domínio e não depende de um serviço de terceiros.

- **.com.br** — [registro.br](https://registro.br), cerca de R$ 40/ano (exige CPF ou CNPJ).
- **.com / .app / .dev** — [Cloudflare Registrar](https://www.cloudflare.com/products/registrar/) vende a preço de custo, sem margem.

Depois de registrar, crie no painel de DNS:

```
Tipo: A    Nome: investhub    Valor: <IP-DO-SERVIDOR>    TTL: 300
```

### Confirme antes de prosseguir

Independentemente do caminho, valide a resolução do seu computador:

```bash
nslookup investhub.duckdns.org
```

O IP retornado precisa ser o do servidor. Se não for, **não prossiga** — a emissão do certificado vai falhar e cada tentativa frustrada consome parte do limite semanal do Let's Encrypt.

---

## 1. Preparar o servidor

Conecte via SSH e atualize o sistema:

```bash
sudo apt update && sudo apt upgrade -y
```

Instale utilitários básicos:

```bash
sudo apt install -y curl git ufw ca-certificates
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

Confira o resultado:

```bash
sudo ufw status verbose
```

Devem aparecer apenas 22 (SSH), 80 e 443. Postgres, Redis e a aplicação Next.js **não** são expostos ao host — vivem só na rede interna do Docker.

### Fuso horário (opcional, ajuda nos logs)

```bash
sudo timedatectl set-timezone America/Sao_Paulo
```

---

## 2. Instalar o Docker

Use o repositório oficial (o `docker.io` do Ubuntu costuma vir defasado):

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Permita usar o Docker sem `sudo`:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

Verifique:

```bash
docker --version
docker compose version
```

---

## 3. Enviar o código para o servidor

**Opção A — via Git** (recomendado se o projeto estiver em um repositório):

```bash
sudo mkdir -p /opt/investhub
sudo chown $USER:$USER /opt/investhub
git clone <URL-DO-SEU-REPOSITORIO> /opt/investhub
cd /opt/investhub
```

**Opção B — copiando do seu Windows** (PowerShell, na sua máquina):

```powershell
scp -r C:\investhub usuario@IP-DO-SERVIDOR:/tmp/investhub
```

E no servidor:

```bash
sudo mkdir -p /opt/investhub
sudo mv /tmp/investhub/* /tmp/investhub/.??* /opt/investhub/
sudo chown -R $USER:$USER /opt/investhub
cd /opt/investhub
```

> Se copiou do Windows, normalize as quebras de linha dos scripts (o Windows usa CRLF, o shell do Linux não aceita):
> ```bash
> sudo apt install -y dos2unix
> dos2unix docker/init-letsencrypt.sh
> ```

Garanta que `node_modules` e `.next` não vieram junto (se vieram, remova — serão reconstruídos dentro do container):

```bash
rm -rf node_modules .next
```

---

## 4. Configurar o `.env`

O arquivo `.env` já vem com segredos gerados. Só é preciso trocar o domínio, o e-mail e a chave de e-mail:

```bash
nano /opt/investhub/.env
```

Confira/ajuste estas linhas (o exemplo abaixo usa o domínio DuckDNS):

```ini
APP_DOMAIN=investhub.duckdns.org
APP_URL=https://investhub.duckdns.org
AUTH_URL=https://investhub.duckdns.org
LETSENCRYPT_EMAIL=seu@email.com
RESEND_API_KEY=re_xxxxxxxxxxxx
```

Notas importantes:

- **`APP_DOMAIN`** — sem `https://`, sem barra no final. Precisa ser exatamente o domínio que você reivindicou. Se `investhub` já estava em uso no DuckDNS e você registrou outro nome, troque nas três linhas (`APP_DOMAIN`, `APP_URL`, `AUTH_URL`).
- **`RESEND_API_KEY`** — crie uma conta gratuita em [resend.com](https://resend.com) e valide seu domínio. **Sem essa chave, os e-mails de confirmação de cadastro, recuperação de senha e alertas não são enviados** (ficam só no log). Como o login exige e-mail confirmado, você não conseguiria entrar. Alternativa se não quiser configurar e-mail agora: veja a seção *Confirmar e-mail manualmente* no fim do guia.
- **`MARKET_DATA_API_KEY`** — já preenchida com seu token da brapi.
- **Não mexa** em `AUTH_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET` e `POSTGRES_PASSWORD` — são segredos únicos já gerados. Se trocar `ENCRYPTION_KEY` depois que alguém ativar 2FA, os segredos de 2FA ficam ilegíveis.

Proteja o arquivo:

```bash
chmod 600 /opt/investhub/.env
```

---

## 5. Criar a migração inicial do banco

O projeto ainda não tem arquivos de migração (eles precisam de um Postgres real para serem gerados). Faça isto **uma única vez**:

```bash
cd /opt/investhub
docker compose up -d postgres
docker compose run --rm migrate npx prisma migrate dev --name init
```

Isso cria `prisma/migrations/xxxxx_init/migration.sql` (persistido no host) e aplica o schema no banco. Confirme:

```bash
ls prisma/migrations/
```

> Nos deploys seguintes você **não** repete este passo — o serviço `migrate` aplica as migrações existentes automaticamente com `prisma migrate deploy`.

---

## 6. Emitir o certificado HTTPS

Com o DNS já apontando para o servidor:

```bash
cd /opt/investhub
sh docker/init-letsencrypt.sh
```

O script confere se o DNS aponta para este servidor, sobe um nginx temporário na porta 80 (o nginx de produção não inicia sem os arquivos de certificado), pede o certificado ao Let's Encrypt via desafio HTTP-01 e encerra o nginx temporário. A partir daí os certificados ficam no volume `investhub_certbot_conf` e o nginx de produção consegue subir.

> **Quer testar antes?** Defina `LETSENCRYPT_STAGING=1` no `.env` e rode o script. O certificado gerado não é confiável pelo navegador (vai dar aviso de segurança), mas não consome o limite de 5 emissões por semana do Let's Encrypt. Depois, volte para `LETSENCRYPT_STAGING=0` e rode o script de novo.

---

## 7. Subir a aplicação

```bash
cd /opt/investhub
docker compose up -d --build
```

O primeiro build leva alguns minutos (instala dependências e compila o Next.js). Acompanhe:

```bash
docker compose logs -f app
```

Espere pela linha `✓ Ready`. Depois confira o estado de todos os serviços:

```bash
docker compose ps
```

Devem estar `running`/`healthy`: `postgres`, `redis`, `app`, `nginx`, `certbot`, `scheduler`. O `migrate` aparece como `exited (0)` — é esperado, ele roda uma vez e encerra.

### Popular ativos de exemplo (opcional)

```bash
docker compose run --rm migrate npx tsx prisma/seed.ts
```

Cadastra alguns tickers conhecidos (PETR4, VALE3, HGLG11...) para você já ter o que ver nos screeners antes da primeira sincronização.

---

## 8. Verificar

Abra `https://investhub.duckdns.org` no navegador. Você deve ver a tela de login com cadeado válido.

Checagens rápidas pelo terminal:

```bash
# Deve responder {"status":"ok"}
curl https://investhub.duckdns.org/api/health

# Deve responder 301 para https
curl -I http://investhub.duckdns.org
```

Crie sua conta em `/register`, confirme o e-mail pelo link recebido e entre.

### Primeira carga de dados de mercado

Após entrar, cadastre ao menos uma transação ou favorite alguns ativos, e clique no ícone ↻ no topo da tela. Isso busca cotações, fundamentos, dividendos e histórico na brapi. Daí em diante, o serviço `scheduler` repete essa sincronização a cada 15 minutos automaticamente.

---

## 9. Operação do dia a dia

### Logs

```bash
docker compose logs -f app          # aplicação
docker compose logs -f nginx        # acessos e erros do proxy
docker compose logs -f scheduler    # sincronizações automáticas
docker compose logs --tail=100 certbot   # renovação do certificado
```

### Atualizar a aplicação

```bash
cd /opt/investhub
git pull                      # ou reenvie os arquivos por scp
docker compose up -d --build
```

O `migrate` roda sozinho antes do `app` subir e aplica migrações novas. Os dados no banco são preservados.

### Reiniciar

```bash
docker compose restart app
```

### Parar tudo

```bash
docker compose down            # para os containers, PRESERVA os dados
```

> **Nunca use `docker compose down -v`** em produção: o `-v` apaga os volumes, ou seja, o banco de dados inteiro e os certificados.

### Backup do banco

Backup manual:

```bash
docker compose exec -T postgres pg_dump -U investhub investhub | gzip > ~/investhub-$(date +%F).sql.gz
```

Backup diário automático via cron:

```bash
mkdir -p ~/backups
crontab -e
```

Adicione a linha:

```
0 3 * * * cd /opt/investhub && docker compose exec -T postgres pg_dump -U investhub investhub | gzip > ~/backups/investhub-$(date +\%F).sql.gz && find ~/backups -name '*.sql.gz' -mtime +14 -delete
```

Isso gera um backup às 3h e mantém os últimos 14 dias.

Restaurar:

```bash
gunzip -c ~/backups/investhub-2026-08-01.sql.gz | docker compose exec -T postgres psql -U investhub investhub
```

### Escalar horizontalmente

A aplicação é stateless (sessão em JWT), então dá para rodar várias instâncias atrás do nginx:

```bash
docker compose up -d --scale app=3
```

O nginx distribui as requisições automaticamente (usa o DNS interno do Docker, com reconsulta a cada 10s).

### Acessar o banco pela interface web

O Adminer fica restrito a `localhost` no servidor. Use um túnel SSH a partir da sua máquina:

```bash
ssh -L 8080:localhost:8080 usuario@IP-DO-SERVIDOR
```

No servidor:

```bash
docker compose --profile dev up -d adminer
```

Aí acesse `http://localhost:8080` no seu navegador (Sistema: PostgreSQL, Servidor: `postgres`, Usuário/Senha/Base: os do `.env`).

---

## 10. Renovação do certificado

Automática. O serviço `certbot` verifica a cada 12 horas e renova quando faltarem menos de 30 dias para expirar; o nginx recarrega a cada 6 horas para adotar o certificado novo.

Testar sem renovar de fato:

```bash
docker compose run --rm certbot certbot renew --dry-run
```

Ver a validade atual:

```bash
docker compose run --rm certbot certbot certificates
```

---

## 11. Problemas comuns

**O nginx não sobe: `cannot load certificate`**
O certificado ainda não foi emitido. Rode `sh docker/init-letsencrypt.sh`.

**O script de certificado falha com `port is already allocated`**
Algo já está ocupando a porta 80 — provavelmente o próprio nginx da stack. Pare tudo antes (`docker compose down`), rode o script e só então suba de novo.

**Certbot falha com `Timeout during connect` ou `unauthorized`**
O Let's Encrypt não conseguiu alcançar o servidor na porta 80. Verifique: o DNS aponta para o IP certo (`nslookup`)? A porta 80 está liberada no `ufw` **e** no firewall do provedor (AWS Security Group, painel da Hetzner/DigitalOcean etc.)?

**`too many failed authorizations` ou `rate limit`**
O Let's Encrypt limita 5 emissões por domínio por semana. Use `LETSENCRYPT_STAGING=1` enquanto resolve o problema e só volte ao modo real quando o staging funcionar.

**O app não sobe: erro de conexão com o banco**
Confira se `DATABASE_URL` no `.env` usa o host `postgres` (nome do serviço), não `localhost`. E se `POSTGRES_PASSWORD` bate com a senha dentro da `DATABASE_URL`.

**Tabelas não existem / erro do Prisma ao abrir o site**
A migração inicial não foi criada. Volte ao passo 5.

**Login redireciona em loop ou dá erro de sessão**
`AUTH_URL` precisa ser exatamente `https://seu-dominio`, com https e sem barra final. Depois de corrigir: `docker compose up -d --force-recreate app`.

**Não recebo e-mail de confirmação**
`RESEND_API_KEY` não está configurada ou o domínio não foi verificado na Resend. Veja abaixo como contornar.

**Build falha por falta de memória**
Em servidores de 1–2 GB, adicione swap:
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Confirmar e-mail manualmente (sem serviço de e-mail configurado)

Se ainda não configurou a Resend e quer entrar na sua conta:

```bash
docker compose exec postgres psql -U investhub -d investhub \
  -c "UPDATE users SET \"emailVerified\" = NOW() WHERE email = 'seu@email.com';"
```

Isso marca o e-mail como confirmado e libera o login. Vale só para o seu acesso inicial — para uso real (recuperação de senha, alertas), configure a Resend.

---

## 12. Recomendações de segurança pós-deploy

- **Desative login por senha no SSH** e use apenas chave pública (`PasswordAuthentication no` em `/etc/ssh/sshd_config`).
- **Instale atualizações automáticas de segurança**:
  ```bash
  sudo apt install -y unattended-upgrades
  sudo dpkg-reconfigure --priority=low unattended-upgrades
  ```
- **Instale o fail2ban** para bloquear tentativas de força bruta no SSH:
  ```bash
  sudo apt install -y fail2ban
  ```
- **Ative o 2FA** na sua conta do InvestHub (Configurações → Segurança).
- **Teste sua nota de TLS** em [ssllabs.com/ssltest](https://www.ssllabs.com/ssltest/) — a configuração atual (TLS 1.2/1.3, HSTS, OCSP stapling) deve tirar A ou A+.
- **Verifique os backups de verdade**: um backup nunca testado não é um backup. Restaure em um ambiente separado pelo menos uma vez.
