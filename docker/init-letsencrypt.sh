#!/bin/sh
# ============================================================
# Emissão inicial do certificado Let's Encrypt.
#
# Rode UMA VEZ, na primeira instalação:
#   sh docker/init-letsencrypt.sh
#
# As renovações seguintes são automáticas (serviço "certbot" do compose).
#
# Como funciona: o nginx de produção não inicia sem os arquivos .pem, e o
# Let's Encrypt precisa alcançar o servidor na porta 80 para validar o domínio.
# Então subimos um nginx descartável só com HTTP, emitimos o certificado e
# encerramos esse nginx temporário.
# ============================================================
set -e

cd "$(dirname "$0")/.."

PROJECT="investhub"
VOL_CONF="${PROJECT}_certbot_conf"
VOL_WWW="${PROJECT}_certbot_www"
TMP_NGINX="${PROJECT}-certbot-bootstrap"

if [ ! -f .env ]; then
  echo "ERRO: arquivo .env não encontrado em $(pwd)"
  exit 1
fi

read_env() {
  grep -E "^$1=" .env | head -n1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r'
}

DOMAIN=$(read_env APP_DOMAIN)
EMAIL=$(read_env LETSENCRYPT_EMAIL)
STAGING=$(read_env LETSENCRYPT_STAGING)

if [ -z "$DOMAIN" ]; then
  echo "ERRO: defina APP_DOMAIN no .env (ex: investhub.duckdns.org)."
  exit 1
fi
if [ -z "$EMAIL" ] || [ "$EMAIL" = "voce@exemplo.com" ]; then
  echo "ERRO: defina LETSENCRYPT_EMAIL no .env com o seu e-mail real."
  exit 1
fi

echo "==> Domínio: $DOMAIN"
echo "==> E-mail:  $EMAIL"

# Confere se o DNS aponta para este servidor antes de gastar uma tentativa.
SERVER_IP=$(curl -s -m 10 https://api.ipify.org || echo "")
DOMAIN_IP=$(getent hosts "$DOMAIN" 2>/dev/null | awk '{print $1}' | head -n1 || echo "")
if [ -n "$SERVER_IP" ] && [ -n "$DOMAIN_IP" ] && [ "$SERVER_IP" != "$DOMAIN_IP" ]; then
  echo ""
  echo "AVISO: $DOMAIN resolve para $DOMAIN_IP, mas o IP público deste servidor é $SERVER_IP."
  echo "A emissão provavelmente vai falhar. Corrija o DNS ou aguarde a propagação."
  printf "Continuar mesmo assim? [s/N] "
  read -r answer
  case "$answer" in
    s|S|y|Y) ;;
    *) exit 1 ;;
  esac
fi

# ------------------------------------------------------------
# 1. Volumes compartilhados com o compose.
# ------------------------------------------------------------
docker volume create "$VOL_CONF" >/dev/null
docker volume create "$VOL_WWW" >/dev/null

# ------------------------------------------------------------
# 2. Nginx temporário na porta 80.
# ------------------------------------------------------------
echo "==> Subindo nginx temporário na porta 80..."
docker rm -f "$TMP_NGINX" >/dev/null 2>&1 || true
docker run -d --name "$TMP_NGINX" \
  -p 80:80 \
  -v "$VOL_WWW:/var/www/certbot:ro" \
  -v "$(pwd)/docker/nginx-bootstrap.conf:/etc/nginx/conf.d/default.conf:ro" \
  nginx:1.27-alpine >/dev/null

# Encerra o nginx temporário mesmo se algo falhar no meio do caminho.
cleanup() {
  echo "==> Removendo nginx temporário..."
  docker rm -f "$TMP_NGINX" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

sleep 3

# ------------------------------------------------------------
# 3. Emissão do certificado.
# ------------------------------------------------------------
STAGING_ARG=""
if [ "$STAGING" = "1" ] || [ "$STAGING" = "true" ]; then
  echo "==> MODO STAGING: o certificado NÃO será confiável pelo navegador (use só para testar)."
  STAGING_ARG="--staging"
fi

echo "==> Solicitando certificado ao Let's Encrypt..."
docker run --rm \
  -v "$VOL_CONF:/etc/letsencrypt" \
  -v "$VOL_WWW:/var/www/certbot" \
  certbot/certbot:latest \
  certonly --webroot -w /var/www/certbot \
    $STAGING_ARG \
    --email "$EMAIL" \
    -d "$DOMAIN" \
    --rsa-key-size 4096 \
    --agree-tos \
    --no-eff-email \
    --non-interactive

echo ""
echo "Certificado emitido com sucesso para $DOMAIN."
echo "Agora suba a stack completa:"
echo ""
echo "    docker compose up -d --build"
echo ""
