#!/bin/sh
# Hook de autenticação DNS-01 do certbot para o DuckDNS.
#
# O certbot chama este script durante a emissão/renovação, com estas variáveis:
#   CERTBOT_DOMAIN     — o domínio sendo validado (ex: investhub.duckdns.org)
#   CERTBOT_VALIDATION — o valor que precisa ser publicado no registro TXT
#
# Publicamos o TXT via API do DuckDNS e esperamos a propagação.
set -e

. "$(dirname "$0")/http-get.sh"

if [ -z "$DUCKDNS_TOKEN" ]; then
  echo "ERRO: DUCKDNS_TOKEN não está definido no ambiente do container certbot." >&2
  exit 1
fi

# A API do DuckDNS espera apenas o subdomínio, sem o ".duckdns.org".
SUBDOMAIN=$(echo "$CERTBOT_DOMAIN" | sed 's/\.duckdns\.org$//')

echo "[duckdns] publicando TXT para $SUBDOMAIN..."
RESPONSE=$(http_get "https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${DUCKDNS_TOKEN}&txt=${CERTBOT_VALIDATION}")

if [ "$RESPONSE" != "OK" ]; then
  echo "ERRO: DuckDNS respondeu '$RESPONSE' (esperado 'OK'). Verifique DUCKDNS_TOKEN e APP_DOMAIN." >&2
  exit 1
fi

# O DuckDNS propaga em poucos segundos; a espera evita que o Let's Encrypt
# consulte o TXT antes de ele estar visível nos servidores DNS.
WAIT=${DUCKDNS_PROPAGATION_SECONDS:-30}
echo "[duckdns] TXT publicado. Aguardando ${WAIT}s pela propagação..."
sleep "$WAIT"
