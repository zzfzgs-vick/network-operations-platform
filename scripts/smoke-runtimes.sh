#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
pids=()

cleanup() {
  for pid in "${pids[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  rm -rf "$tmp"
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

  for _ in {1..50}; do
    if node -e '
      fetch(process.argv[1])
        .then((response) => response.text())
        .then((body) => process.exit(body.includes(process.argv[2]) ? 0 : 1))
        .catch(() => process.exit(1));
    ' "$url" "$expected"; then
      return 0
    fi
    sleep 0.1
  done

  return 1
}

web_port="$(free_port)"
api_port="$(free_port)"
worker_probe_port="$(free_port)"
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

NODE_ENV=test DATABASE_STARTUP_CHECK=disabled HOST=127.0.0.1 PORT="$api_port" \
  node "$root/apps/platform/dist/main.js" >"$tmp/api.log" 2>&1 &
api_pid=$!
pids+=("$api_pid")

NODE_ENV=test DATABASE_STARTUP_CHECK=disabled PORT="$worker_probe_port" \
  node "$root/apps/platform/dist/worker.js" >"$tmp/worker.log" 2>&1 &
worker_pid=$!
pids+=("$worker_pid")

"$collector" >"$tmp/collector.log" 2>&1 &
collector_pid=$!
pids+=("$collector_pid")

wait_http "http://127.0.0.1:$web_port" "Network Operations Platform"
wait_http "http://127.0.0.1:$api_port" '"service":"platform-api"'

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
