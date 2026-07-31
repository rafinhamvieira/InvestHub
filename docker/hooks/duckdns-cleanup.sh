#!/bin/sh
# Hook de limpeza DNS-01 do certbot para o DuckDNS.
# Remove o registro TXT depois que o Let's Encrypt já validou o domínio.
set -e

if [ -z "$DUCKDNS_TOKEN" ]; then
  echo "AVISO: DUCKDNS_TOKEN ausente — não foi possível limpar o registro TXT."
  exit 0
fi

SUBDOMAIN=$(echo "$CERTBOT_DOMAIN" | sed 's/\.duckdns\.org$//')

echo "[duckdns] removendo TXT de $SUBDOMAIN..."
curl -s -m 30 \
  "https://www.duckdns.org/update?domains=${SUBDOMAIN}&token=${DUCKDNS_TOKEN}&txt=removed&clear=true" \
  >/dev/null || true
