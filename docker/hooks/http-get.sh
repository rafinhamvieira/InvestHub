#!/bin/sh
# Faz uma requisição HTTP GET e imprime o corpo da resposta.
#
# A imagem oficial do certbot NÃO inclui curl. Ela é baseada em Python, então
# usamos o que estiver disponível, nesta ordem: curl, wget e por fim Python
# (sempre presente, já que o próprio certbot é escrito em Python).
http_get() {
  url="$1"

  if command -v curl >/dev/null 2>&1; then
    curl -s -m 30 "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O - -T 30 "$url"
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c 'import sys, urllib.request; sys.stdout.write(urllib.request.urlopen(sys.argv[1], timeout=30).read().decode().strip())' "$url"
  elif command -v python >/dev/null 2>&1; then
    python -c 'import sys, urllib.request; sys.stdout.write(urllib.request.urlopen(sys.argv[1], timeout=30).read().decode().strip())' "$url"
  else
    echo "ERRO: nenhuma ferramenta HTTP disponível (curl, wget ou python)." >&2
    return 1
  fi
}
