#!/usr/bin/env bash
# Start frontend, backend, Caddy and ngrok together.
# Each line of output is tagged and coloured by the service that wrote it.
# Ctrl+C stops everything.

set -u
cd "$(dirname "$0")"

# Keep colours in tool output even though it is piped.
export FORCE_COLOR=1

# Stop every child process when the script exits.
trap 'trap - INT TERM EXIT; kill 0 2>/dev/null' INT TERM EXIT

# run <tag> <colour code> <dir> <command...>
run() {
    local tag=$1 colour=$2 dir=$3
    shift 3
    (cd "$dir" && exec "$@") 2>&1 | while IFS= read -r line; do
        printf '\033[1;%sm%-8s\033[0m %s\n' "$colour" "[$tag]" "$line"
    done &
}

run frontend 36 frontend npm run dev
run backend 32 backend npm run dev
run caddy 35 . caddy run --config Caddyfile
run ngrok 33 . ngrok http 8080 --log stdout

wait
