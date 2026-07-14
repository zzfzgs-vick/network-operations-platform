#!/usr/bin/env sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compose_file="$repo_root/deploy/compose/dev.compose.yml"
action=${1:-smoke}

compose() {
  docker compose -f "$compose_file" "$@"
}

wait_for_healthy() {
  service=$1
  attempts=0

  while [ "$attempts" -lt 60 ]; do
    container_id=$(compose ps -q "$service")
    if [ -n "$container_id" ]; then
      status=$(docker inspect --format '{{.State.Health.Status}}' "$container_id")
      if [ "$status" = healthy ]; then
        return 0
      fi
      if [ "$status" = unhealthy ]; then
        compose logs "$service"
        return 1
      fi
    fi
    attempts=$((attempts + 1))
    sleep 2
  done

  compose logs "$service"
  echo "$service did not become healthy" >&2
  return 1
}

start_services() {
  compose up -d postgres victoriametrics vmalert
}

published_endpoint() {
  service=$1
  container_port=$2
  endpoint=$(compose port "$service" "$container_port")
  case "$endpoint" in
    127.0.0.1:*) printf '%s\n' "$endpoint" ;;
    *)
      echo "unexpected $service endpoint: $endpoint" >&2
      return 1
      ;;
  esac
}

postgres_query() {
  sql=$1
  compose exec -T postgres sh -c \
    'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"' \
    nop-smoke "$sql"
}

verify_postgres_persistence() {
  marker_table="nop_infra_smoke_$$_$(date +%s)"
  marker_value="marker_$$_$(date +%s)"

  postgres_query "CREATE TABLE public.$marker_table (value text PRIMARY KEY); INSERT INTO public.$marker_table VALUES ('$marker_value');" >/dev/null
  compose stop postgres
  compose rm -f postgres
  compose up -d postgres
  wait_for_healthy postgres

  persisted_value=$(postgres_query "SELECT value FROM public.$marker_table;")
  if [ "$persisted_value" != "$marker_value" ]; then
    echo "PostgreSQL marker did not survive container recreation" >&2
    return 1
  fi

  postgres_query "DROP TABLE public.$marker_table;" >/dev/null
}

run_smoke() {
  compose config >/dev/null
  start_services
  wait_for_healthy postgres
  wait_for_healthy victoriametrics
  wait_for_healthy vmalert

  victoriametrics_endpoint=$(published_endpoint victoriametrics 8428)
  vmalert_endpoint=$(published_endpoint vmalert 8880)
  postgres_endpoint=$(published_endpoint postgres 5432)
  postgres_port=${postgres_endpoint##*:}

  curl --fail --silent --show-error "http://$victoriametrics_endpoint/-/healthy" >/dev/null
  curl --fail --silent --show-error "http://$vmalert_endpoint/-/healthy" >/dev/null
  docker run --rm --network host --entrypoint pg_isready postgres:18.4-alpine \
    -h 127.0.0.1 \
    -p "$postgres_port" \
    -U "${POSTGRES_USER:-nop}" \
    -d "${POSTGRES_DB:-network_operations}" >/dev/null

  user_schema_count=$(postgres_query \
    "SELECT count(*) FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('information_schema', 'public');")
  if [ "$user_schema_count" != 0 ]; then
    echo "expected an empty PostgreSQL instance, found $user_schema_count user schemas" >&2
    return 1
  fi

  verify_postgres_persistence

  running_services=$(compose ps --status running --services | sort | tr '\n' ' ')
  if [ "$running_services" != "postgres victoriametrics vmalert " ]; then
    echo "unexpected running services: $running_services" >&2
    return 1
  fi

  echo "local infrastructure smoke passed"
}

case "$action" in
  config)
    compose config --quiet
    ;;
  up)
    start_services
    ;;
  smoke)
    run_smoke
    ;;
  down)
    compose --profile application down --remove-orphans
    ;;
  clean)
    compose --profile application down --volumes --remove-orphans
    ;;
  *)
    echo "usage: $0 [config|up|smoke|down|clean]" >&2
    exit 2
    ;;
esac
