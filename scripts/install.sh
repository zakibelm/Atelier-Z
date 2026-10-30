#!/usr/bin/env bash
# Installe OpenMausBot et l'équipe Atelier Z (10 bots + salon « Atelier de recherche »).
# Prérequis : Node 24+, et au moins un CLI d'agent connecté (ex. : `claude login`).
# Usage : bash scripts/install.sh [port] [dossier-de-données]
set -euo pipefail

PORT="${1:-8799}"
DATA="${2:-$HOME/.atelier-z/data}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$node_major" -lt 24 ]; then
  echo "Node 24+ requis (version actuelle : $(node -v 2>/dev/null || echo aucune)). Installe-le puis relance." >&2
  exit 1
fi

if ! command -v openmausbot >/dev/null 2>&1; then
  npm install -g openmausbot
fi

mkdir -p "$DATA"
if ! curl -fsS "http://127.0.0.1:$PORT/api/bots" >/dev/null 2>&1; then
  nohup openmausbot serve --port "$PORT" --data-dir "$DATA" --label "Atelier Z" --no-pair \
    > "$DATA/server.log" 2>&1 &
  for _ in $(seq 1 30); do
    curl -fsS "http://127.0.0.1:$PORT/api/bots" >/dev/null 2>&1 && break
    sleep 1
  done
fi

node "$ROOT/tools/build-team.mjs"
node "$ROOT/tools/setup-atelier.mjs" "http://127.0.0.1:$PORT"

echo
echo "Atelier Z est prêt sur http://127.0.0.1:$PORT"
echo "Pour y accéder depuis ta tablette : openmausbot service install --tunnel (ou --domain TON.DOMAINE), puis openmausbot pair"
