#!/usr/bin/env bash
set -euo pipefail

# SentientM VPS Deploy & PM2 Cluster Orchestrator
# - Starts all 3 services in the correct ports using PM2 cluster mode
# - Optionally applies NGINX config from VPS.conf (no path changes)
# - Verifies health/ports and key API endpoints

# Tunables (override via env)
MAIN_INSTANCES="${MAIN_INSTANCES:-3}"
PROXY_INSTANCES="${PROXY_INSTANCES:-2}"
RAG_INSTANCES="${RAG_INSTANCES:-1}"

MAIN_PORT=${MAIN_SERVER_PORT:-3000}
PROXY_PORT=${PROXY_SERVER_PORT:-3002}
RAG_PORT=${RAG_SERVER_PORT:-3001}

SITE_HOST="${SITE_HOST:-sentientm.com}"
NGINX_SITE="/etc/nginx/sites-enabled/sentientm"
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

banner() { echo -e "\n\033[0;34m$1\033[0m"; }
ok() { echo -e "\033[0;32m✔ $1\033[0m"; }
warn() { echo -e "\033[1;33m⚠ $1\033[0m"; }
err() { echo -e "\033[0;31m✘ $1\033[0m"; }

echo "MAIN_INSTANCES=$MAIN_INSTANCES, PROXY_INSTANCES=$PROXY_INSTANCES, RAG_INSTANCES=$RAG_INSTANCES"

echo "Using ports: MAIN=$MAIN_PORT, PROXY=$PROXY_PORT, RAG=$RAG_PORT"

banner "1) Ensuring prerequisites (pm2)"
if ! command -v pm2 >/dev/null 2>&1; then
  warn "pm2 not found; installing globally via npm..."
  npm i -g pm2
fi
ok "pm2 available: $(pm2 -v)"

banner "2) Optionally apply NGINX config (VPS.conf)"
if [ -f "$PROJECT_DIR/VPS.conf" ]; then
  sudo cp "$PROJECT_DIR/VPS.conf" /tmp/VPS.conf.apply
  # VPS.conf in this repo is a here-doc wrapper; extract the inner server block if needed
  # If the file begins with 'sudo tee ... << EOF', evaluate the heredoc to write to the site file
  if grep -q "^sudo tee" /tmp/VPS.conf.apply; then
    warn "Detected heredoc-style VPS.conf; applying to $NGINX_SITE via heredoc"
    bash -lc "$(cat /tmp/VPS.conf.apply)" || true
  else
    sudo cp "$PROJECT_DIR/VPS.conf" "$NGINX_SITE"
  fi
  sudo nginx -t
  sudo systemctl reload nginx
  ok "NGINX reloaded"
else
  warn "VPS.conf not found in project root; skipping NGINX apply"
fi

banner "3) Prepare PM2 ecosystem (cluster with explicit ports)"
# Ensure logs dir exists
mkdir -p "$PROJECT_DIR/logs"

# Export instance counts for pm2 env interpolation
export MAIN_INSTANCES PROXY_INSTANCES RAG_INSTANCES
export MAIN_SERVER_PORT="$MAIN_PORT"
export PROXY_SERVER_PORT="$PROXY_PORT"
export RAG_SERVER_PORT="$RAG_PORT"

# Stop any conflicting listeners on our ports (LISTEN sockets only)
for p in "$MAIN_PORT" "$RAG_PORT" "$PROXY_PORT"; do
  PID=$(lsof -tiTCP:"$p" -sTCP:LISTEN 2>/dev/null || true)
  if [ -n "$PID" ]; then
    warn "Killing process $PID on port $p"
    kill -9 "$PID" || true
  fi
done

# Clean existing pm2 apps to avoid env contamination
pm2 delete vps-main vps-proxy vps-rag >/dev/null 2>&1 || true

# Start with ecosystem
pm2 start "$PROJECT_DIR/ecosystem.config.cjs" \
  --env production \
  --only vps-main,vps-proxy,vps-rag

sleep 2
pm2 status
pm2 save || true
ok "PM2 apps started"

banner "4) Verify local ports"
for svc in main:$MAIN_PORT rag:$RAG_PORT proxy:$PROXY_PORT; do
  name="${svc%%:*}"; port="${svc##*:}"
  if curl -s "http://127.0.0.1:${port}/health" | grep -q '"status"\s*:\s*"ok"'; then
    ok "$name server healthy on :$port"
  else
    warn "$name server health check failed on :$port"
  fi
done

banner "5) Sanity-check public endpoints (through NGINX)"
USER_ID="${USER_ID:-KUvVFxnLanYTWPuSIfphby5hxJQ2}"

check_ep() {
  local url="$1"
  local label="$2"
  code=$(curl -k -s -o /dev/null -w "%{http_code}" "${url}") || code=000
  echo "${label}: ${code} ${url}"
}

check_ep "https://${SITE_HOST}/api/platform-access/${USER_ID}?platform=instagram" "platform-access"
check_ep "https://${SITE_HOST}/api/usage/${USER_ID}" "usage-by-user"
check_ep "https://${SITE_HOST}/api/processing-status/${USER_ID}?platform=instagram" "processing-status"
check_ep "https://${SITE_HOST}/api/profile-info/instagram/maccosmetics" "profile-info"

ok "Deployment checks completed"

echo
echo "If any endpoint shows 404 for platform-access/usage, verify pm2 logs and that vps-main is bound to ${MAIN_PORT}."
echo "Tail logs: pm2 logs vps-main --lines 100"
