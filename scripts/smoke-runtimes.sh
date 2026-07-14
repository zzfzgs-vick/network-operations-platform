#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
pids=()

cleanup() {
  status=$?
  if [[ "$status" -ne 0 ]]; then
    for log in web api worker collector; do
      if [[ -f "$tmp/$log.log" ]]; then
        echo "--- $log runtime log ---" >&2
        sed -n '1,120p' "$tmp/$log.log" >&2
      fi
    done
  fi
  for pid in "${pids[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  rm -rf "$tmp"
  return "$status"
}
trap cleanup EXIT

free_port() {
  node --input-type=module -e '
    import net from "node:net";
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      console.log(server.address().port);
      server.close();
    });
  '
}

wait_http() {
  local url="$1"
  local expected="$2"

  node --input-type=module -e '
    import { setTimeout as delay } from "node:timers/promises";
    const [url, expected = ""] = process.argv.slice(1);
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
        const body = await response.text();
        if (response.ok && (!expected || body.includes(expected))) process.exit(0);
      } catch {}
      await delay(100);
    }
    console.error(`Runtime did not become ready: ${url}`);
    process.exit(1);
  ' "$url" "$expected"
}

docker_available() {
  command -v docker >/dev/null 2>&1 &&
    [[ "$(docker info --format '{{.OSType}}' 2>/dev/null)" == "linux" ]]
}

export DATABASE_HOST=127.0.0.1
export DATABASE_PORT=5432
export DATABASE_NAME=network_operations
export DATABASE_USER=nop
export DATABASE_PASSWORD=change-me-local-only
export DATABASE_SSL_MODE=disable
export DATABASE_POOL_MAX=10
export DATABASE_CONNECT_TIMEOUT_MS=5000
export DATABASE_QUERY_TIMEOUT_MS=10000
export VICTORIAMETRICS_URL=http://127.0.0.1:8428
export VMALERT_URL=http://127.0.0.1:8880
export PLATFORM_HEALTH_TIMEOUT_MS=2000
export WORKER_HEARTBEAT_INTERVAL_MS=1000
export WORKER_HEARTBEAT_STALE_AFTER_MS=5000
export WORKER_INSTANCE_ID=platform-worker-smoke

dependency_health_verified=false
if docker_available; then
  npm run test:integration --workspace apps/platform -- platform-health
  npm run db:migrate --workspace apps/platform
  dependency_health_verified=true
  export NODE_ENV=development
  unset DATABASE_STARTUP_CHECK || true
else
  echo "Docker is unavailable; dependency readiness scenarios are covered by the Ubuntu job." >&2
  export NODE_ENV=test
  export DATABASE_STARTUP_CHECK=disabled
fi

web_port="$(free_port)"
api_port="$(free_port)"
worker_probe_port="$(free_port)"
collector_health_port="$(free_port)"
collector="$root/services/collector/dist/collector"

mkdir -p "$(dirname "$collector")"
go build -o "$collector" ./services/collector/cmd/collector
test "$($collector --version)" = "collector dev"

node "$root/node_modules/vite/bin/vite.js" preview "$root/apps/web" \
  --host 127.0.0.1 --port "$web_port" --strictPort \
  --config "$root/apps/web/vite.config.ts" \
  >"$tmp/web.log" 2>&1 &
web_pid=$!
pids+=("$web_pid")

HOST=127.0.0.1 PORT="$api_port" \
  node "$root/apps/platform/dist/main.js" >"$tmp/api.log" 2>&1 &
api_pid=$!
pids+=("$api_pid")

PORT="$worker_probe_port" \
  node "$root/apps/platform/dist/worker.js" >"$tmp/worker.log" 2>&1 &
worker_pid=$!
pids+=("$worker_pid")

COLLECTOR_HEALTH_LISTEN_ADDRESS="127.0.0.1:$collector_health_port" \
COLLECTOR_HEALTH_SHUTDOWN_TIMEOUT_MS=2000 \
  "$collector" >"$tmp/collector.log" 2>&1 &
collector_pid=$!
pids+=("$collector_pid")

wait_http "http://127.0.0.1:$web_port" "Network Operations Platform"
wait_http "http://127.0.0.1:$api_port" '"service":"platform-api"'
wait_http "http://127.0.0.1:$api_port/health/live" '"status":"ALIVE"'
wait_http "http://127.0.0.1:$api_port/metrics" "nop_runtime_dependency_available"
wait_http "http://127.0.0.1:$collector_health_port/health/ready" '"status":"READY"'

if [[ "$dependency_health_verified" == true ]]; then
  wait_http "http://127.0.0.1:$api_port/health/ready" '"status":"READY"'
  wait_http "http://127.0.0.1:8428/-/healthy" ""
  wait_http "http://127.0.0.1:8880/-/healthy" ""
  node -e '
    const socket = require("node:net").connect(5432, "127.0.0.1");
    socket.once("connect", () => { socket.destroy(); process.exit(0); });
    socket.once("error", () => process.exit(1));
    setTimeout(() => process.exit(1), 2000);
  '
fi

if node -e '
  const socket = require("node:net").connect(Number(process.argv[1]), "127.0.0.1");
  socket.once("connect", () => process.exit(1));
  socket.once("error", () => process.exit(0));
  setTimeout(() => process.exit(0), 500);
' "$worker_probe_port"; then
  :
else
  echo "Platform Worker opened an HTTP listener" >&2
  exit 1
fi

kill -TERM "$web_pid" "$api_pid" "$worker_pid" "$collector_pid"
wait "$web_pid" || test "$?" -eq 143
wait "$api_pid"
wait "$worker_pid"
wait "$collector_pid"
pids=()

grep -q "platform-api stopped" "$tmp/api.log"
grep -q "platform-worker stopped" "$tmp/worker.log"
grep -q "collector stopped" "$tmp/collector.log"

echo "Web runtime: PASS"
echo "API runtime: PASS (SIGTERM)"
echo "Worker runtime: PASS (no listener, SIGTERM)"
echo "Collector runtime: PASS (version, SIGTERM)"
if [[ "$dependency_health_verified" == true ]]; then
  echo "Dependency readiness: PASS (PostgreSQL, VictoriaMetrics, vmalert, Worker heartbeat, failure and recovery)"
fi
