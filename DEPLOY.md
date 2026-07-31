# Deploy — Ubuntu Server + Docker Compose + HTTPS

Guia completo para colocar o InvestHub no ar em um servidor Ubuntu com HTTPS (Let's Encrypt) e renovação automática de certificado.

> **Sobre "somente HTTPS"**: todo o tráfego da aplicação roda em HTTPS. A porta 80 serve apenas para redirecionar quem digitar `http://` — nenhum conteúdo é servido sem criptografia.

> **Servidor em casa, atrás de um roteador?** Provedores residenciais brasileiros costumam bloquear as portas 80 e 443 de entrada. Isso tem duas consequências que o guia já resolve: a validação do certificado passa a ser por **DNS-01** (registro TXT, sem abrir porta nenhuma) e o acesso fica em uma porta alternativa (ex: `https://seudominio.duckdns.org:8080`). Veja a seção **0.1**.

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
4. **Copie o `token`** exibido no topo da página. Ele vai no `.env` (`DUCKDNS_TOKEN`) e é o que permite emitir o certificado sem abrir portas. Trate como senha.

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

O IP retornado precisa ser o do servidor (ou o IP público da sua casa, se o servidor estiver na sua rede).

---

## 0.1 Servidor em casa: portas bloqueadas e encaminhamento

Se o servidor está na sua rede doméstica, o provedor quase certamente bloqueia as portas 80 e 443 de entrada. Isso significa:

**A validação do certificado não pode ser HTTP-01.** O Let's Encrypt sempre conecta na **porta 80** para esse desafio — não existe como redirecioná-lo para outra porta. Com a 80 bloqueada, use `CERT_MODE=dns`: o certbot publica um registro TXT no DuckDNS e o Let's Encrypt valida por DNS, sem tocar em porta nenhuma. É o modo já configurado no `.env`.

**O acesso vai carregar a porta na URL.** Sem a 443 liberada, o endereço fica `https://investhub.duckdns.org:8080`. Não há como esconder isso sem a 443.

### Encaminhamento de porta no roteador

No painel do roteador, crie uma regra de *port forwarding* / *redirecionamento de portas*:

```
Porta externa: 8080    →    IP interno do servidor : 8080    (TCP)
```

Mantenha a porta externa e a interna **iguais** (8080 → 8080) — é o que o `.env` já assume (`HTTPS_PORT=8080`). Se o seu roteador só permite portas diferentes, ajuste `HTTPS_PORT` para a porta interna e `APP_URL` para a externa.

Fixe também o IP interno do servidor (reserva de DHCP no roteador), senão a regra quebra quando o IP mudar.

### O que esperar de um servidor doméstico

Vale saber de antemão, para não ser surpresa depois:

- **IP dinâmico** — a maioria das conexões residenciais troca de IP periodicamente. O cron do DuckDNS (mostrado acima) resolve isso automaticamente.
- **Disponibilidade** — quedas de energia e de internet derrubam o sistema. Sem nobreak, conte com isso.
- **Upload** — planos residenciais têm upload bem menor que download; é o upload que serve as páginas.
- **Segurança** — você está expondo uma porta da sua rede doméstica à internet. Mantenha o servidor atualizado, ative o 2FA na aplicação e considere isolar o servidor em uma VLAN se o roteador permitir.
- **Termos do provedor** — alguns contratos residenciais proíbem hospedar serviços. Vale conferir se a plataforma for virar algo comercial.

Se em algum momento quiser eliminar tudo isso, uma VPS básica (Hetzner, DigitalOcean, Contabo) custa entre US$ 4 e US$ 6 por mês, tem IP fixo e portas 80/443 livres — aí você volta para `CERT_MODE=http`, `HTTPS_PORT=443` e o endereço fica limpo, sem porta.

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

Libere o SSH e a porta em que o sistema será acessado. No cenário de servidor doméstico com a 443 bloqueada pelo provedor, essa porta é a **8080**:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8080/tcp
sudo ufw allow 80/tcp
sudo ufw --force enable
```

> Se você estiver em uma VPS com as portas livres, troque `8080/tcp` por `443/tcp` (e ajuste `HTTPS_PORT=443` no `.env`).

Confira o resultado:

```bash
sudo ufw status verbose
```

Postgres, Redis e a aplicação Next.js **não** são expostos ao host — vivem só na rede interna do Docker. Só o nginx publica portas.

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

Confira/ajuste estas linhas (o exemplo abaixo é o cenário servidor doméstico + DuckDNS + porta 8080):

```ini
APP_DOMAIN=investhub.duckdns.org
APP_URL=https://investhub.duckdns.org:8080
AUTH_URL=https://investhub.duckdns.org:8080
HTTPS_PORT=8080
CERT_MODE=dns
DUCKDNS_TOKEN=cole-aqui-o-token-do-duckdns
LETSENCRYPT_EMAIL=seu@email.com
RESEND_API_KEY=re_xxxxxxxxxxxx
```

Notas importantes:

- **`APP_DOMAIN`** — sem `https://`, sem porta, sem barra final. Se `investhub` já estava em uso no DuckDNS e você registrou outro nome, troque aqui e nas URLs.
- **`APP_URL` e `AUTH_URL`** — a URL exata que você digita no navegador, **com a porta**. Se elas não baterem com o endereço real, o login entra em loop de redirecionamento.
- **`CERT_MODE=dns` + `DUCKDNS_TOKEN`** — obrigatórios quando a porta 80 é bloqueada. Sem o token, a emissão do certificado falha.
- **`HTTPS_PORT`** — a porta que o Docker publica no servidor; deve casar com o encaminhamento do roteador.
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

```bash
cd /opt/investhub
sh docker/init-letsencrypt.sh
```

O script detecta o modo pelo `CERT_MODE` do `.env`:

- **`CERT_MODE=dns`** (servidor doméstico, portas bloqueadas) — valida o token do DuckDNS, publica um registro TXT com o desafio, espera a propagação e remove o TXT ao final. **Nenhuma porta precisa estar aberta.**
- **`CERT_MODE=http`** (VPS com portas livres) — confere se o DNS aponta para este servidor, sobe um nginx temporário na porta 80 (o de produção não inicia sem os `.pem`), valida e encerra o temporário.

Nos dois casos o certificado fica no volume `investhub_certbot_conf`, e daí em diante a renovação é automática pelo serviço `certbot` — que reutiliza sozinho o mesmo método usado na emissão.

> **Quer testar antes?** Defina `LETSENCRYPT_STAGING=1` no `.env` e rode o script. O certificado gerado não é confiável pelo navegador (vai dar aviso de segurança), mas não consome o limite de 5 emissões por semana do Let's Encrypt. Depois, volte para `LETSENCRYPT_STAGING=0`, apague o certificado de teste e emita o real:
> ```bash
> docker run --rm -v investhub_certbot_conf:/etc/letsencrypt certbot/certbot delete --cert-name investhub.duckdns.org
> sh docker/init-letsencrypt.sh
> ```

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

Abra `https://investhub.duckdns.org:8080` no navegador (com a porta!). Você deve ver a tela de login com cadeado válido.

Checagens rápidas pelo terminal:

```bash
# Do próprio servidor — deve responder {"status":"ok"}
curl -k https://localhost:8080/api/health

# De fora da sua rede (celular no 4G, por exemplo) — confirma que o roteador encaminha
curl https://investhub.duckdns.org:8080/api/health
```

> Muitos roteadores não permitem acessar o próprio IP público de dentro da rede local (*NAT loopback*). Se de dentro de casa não abrir mas do celular no 4G abrir, o sistema está funcionando — é limitação do roteador. Nesse caso, acesse pelo IP interno do servidor quando estiver em casa.

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

**Certbot falha com `Timeout during connect` ou `unauthorized` (modo `http`)**
O Let's Encrypt não conseguiu alcançar o servidor na **porta 80** — e não existe forma de apontá-lo para outra porta, esse desafio é fixo na 80. Se o seu provedor bloqueia a 80 (padrão em internet residencial), mude para `CERT_MODE=dns` no `.env` e rode o script de novo. Em VPS, verifique o `ufw` e o firewall do painel (Security Group na AWS, etc.).

**Certbot falha no modo `dns` com "DuckDNS respondeu 'KO'"**
O token está errado ou o subdomínio não pertence à sua conta. Confira o `DUCKDNS_TOKEN` no `.env` (copie de novo do topo de duckdns.org) e se o `APP_DOMAIN` é exatamente o subdomínio que você criou.

**Certbot falha no modo `dns` com "Incorrect TXT record"**
Leia a mensagem imediatamente acima dessa linha no terminal — ela diz por que o TXT não foi publicado. Se o hook reportou erro, corrija a causa. Se o hook rodou bem e mesmo assim o TXT não foi encontrado, o registro não propagou a tempo; aumente a espera no `.env` e rode de novo:
```ini
DUCKDNS_PROPAGATION_SECONDS=60
```

**Onde fica o log detalhado do certbot**
O log vive dentro do container, não no host — por isso `cat /var/log/letsencrypt/letsencrypt.log` no servidor retorna "No such file". Ele é preservado no volume `investhub_certbot_logs`:
```bash
docker run --rm -v investhub_certbot_logs:/logs alpine tail -n 80 /logs/letsencrypt.log
```

**Verificar manualmente se o TXT está no ar**
Enquanto o desafio está publicado, consulte de outra máquina:
```bash
dig +short TXT _acme-challenge.investhub.duckdns.org
```

**`too many failed authorizations` ou `rate limit`**
O Let's Encrypt limita 5 emissões por domínio por semana. Use `LETSENCRYPT_STAGING=1` enquanto resolve o problema e só volte ao modo real quando o staging funcionar.

**O app não sobe: erro de conexão com o banco**
Confira se `DATABASE_URL` no `.env` usa o host `postgres` (nome do serviço), não `localhost`. E se `POSTGRES_PASSWORD` bate com a senha dentro da `DATABASE_URL`.

**Tabelas não existem / erro do Prisma ao abrir o site**
A migração inicial não foi criada. Volte ao passo 5.

**Login redireciona em loop ou dá erro de sessão**
`AUTH_URL` precisa ser exatamente o endereço que você digita no navegador — **incluindo a porta** e sem barra final (ex: `https://investhub.duckdns.org:8080`). Depois de corrigir: `docker compose up -d --force-recreate app`.

**O site abre do celular no 4G, mas não de dentro de casa**
É o *NAT loopback* do roteador, que não deixa acessar o próprio IP público de dentro da rede. O sistema está funcionando. Alguns roteadores têm a opção "NAT loopback"/"hairpin NAT" para habilitar; se não tiver, use o IP interno do servidor quando estiver em casa.

**Parou de abrir depois de alguns dias**
O IP público da sua casa provavelmente mudou. Confirme com `nslookup investhub.duckdns.org` e compare com seu IP atual. Configure o cron do DuckDNS (seção 0) para que isso se atualize sozinho.

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
