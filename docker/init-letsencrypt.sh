#!/bin/sh
# ============================================================
# Emissão inicial do certificado Let's Encrypt.
#
# Rode UMA VEZ, na primeira instalação:
#   sh docker/init-letsencrypt.sh
#
# As renovações seguintes são automáticas (serviço "certbot" do compose).
#
# Dois modos, definidos por CERT_MODE no .env:
#
#   dns  — validação DNS-01 via DuckDNS. Não precisa de NENHUMA porta aberta.
#          Use quando o provedor bloqueia a porta 80 (comum em internet residencial).
#
#   http — validação HTTP-01 via webroot. Exige a porta 80 acessível pela internet.
#          Funciona com qualquer domínio, não só DuckDNS.
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
MODE=$(read_env CERT_MODE)
DUCKDNS_TOKEN=$(read_env DUCKDNS_TOKEN)
MODE=${MODE:-http}

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
echo "==> Modo:    $MODE"

STAGING_ARG=""
if [ "$STAGING" = "1" ] || [ "$STAGING" = "true" ]; then
  echo "==> MODO STAGING: o certificado NÃO será confiável pelo navegador (use só para testar)."
  STAGING_ARG="--staging"
fi

docker volume create "$VOL_CONF" >/dev/null
docker volume create "$VOL_WWW" >/dev/null

# ============================================================
# Modo DNS-01 (DuckDNS)
# ============================================================
if [ "$MODE" = "dns" ]; then
  case "$DOMAIN" in
    *.duckdns.org) ;;
    *)
      echo "ERRO: CERT_MODE=dns só funciona com domínios *.duckdns.org."
      echo "      Para outro provedor de DNS, use o plugin correspondente do certbot."
      exit 1
      ;;
  esac

  if [ -z "$DUCKDNS_TOKEN" ]; then
    echo "ERRO: defina DUCKDNS_TOKEN no .env (o token exibido em duckdns.org)."
    exit 1
  fi

  echo "==> Validando token do DuckDNS..."
  SUB=$(echo "$DOMAIN" | sed 's/\.duckdns\.org$//')
  CHECK=$(curl -s -m 20 "https://www.duckdns.org/update?domains=${SUB}&token=${DUCKDNS_TOKEN}&txt=teste-investhub")
  if [ "$CHECK" != "OK" ]; then
    echo "ERRO: o DuckDNS respondeu '$CHECK'. Confira DUCKDNS_TOKEN e se o subdomínio '$SUB' é seu."
    exit 1
  fi
  curl -s -m 20 "https://www.duckdns.org/update?domains=${SUB}&token=${DUCKDNS_TOKEN}&txt=removed&clear=true" >/dev/null
  echo "==> Token válido."

  echo "==> Solicitando certificado (validação DNS-01, sem abrir portas)..."
  docker run --rm \
    -v "$VOL_CONF:/etc/letsencrypt" \
    -v "$(pwd)/docker/hooks:/hooks:ro" \
    -e "DUCKDNS_TOKEN=$DUCKDNS_TOKEN" \
    certbot/certbot:latest \
    certonly --manual --preferred-challenges dns \
      --manual-auth-hook "sh /hooks/duckdns-auth.sh" \
      --manual-cleanup-hook "sh /hooks/duckdns-cleanup.sh" \
      $STAGING_ARG \
      --email "$EMAIL" \
      -d "$DOMAIN" \
      --rsa-key-size 4096 \
      --agree-tos \
      --no-eff-email \
      --non-interactive

# ============================================================
# Modo HTTP-01 (webroot) — exige a porta 80 aberta
# ============================================================
else
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

  echo "==> Subindo nginx temporário na porta 80..."
  docker rm -f "$TMP_NGINX" >/dev/null 2>&1 || true
  docker run -d --name "$TMP_NGINX" \
    -p 80:80 \
    -v "$VOL_WWW:/var/www/certbot:ro" \
    -v "$(pwd)/docker/nginx-bootstrap.conf:/etc/nginx/conf.d/default.conf:ro" \
    nginx:1.27-alpine >/dev/null

  cleanup() {
    echo "==> Removendo nginx temporário..."
    docker rm -f "$TMP_NGINX" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT INT TERM

  sleep 3

  echo "==> Solicitando certificado (validação HTTP-01)..."
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
fi

echo ""
echo "Certificado emitido com sucesso para $DOMAIN."
echo "Agora suba a stack completa:"
echo ""
echo "    docker compose up -d --build"
echo ""
