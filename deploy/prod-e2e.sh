#!/usr/bin/env bash
# Full production-stack test, LOCAL ONLY (it kills and restarts containers on purpose).
# Runs the exact docker-compose.prod.yml stack (Caddy HTTPS, same images as the server) and checks
# every feature plus the failure modes: crashes, Redis restart, full stop/start (reboot), two
# workers, Elasticsearch outage, hourly limit.
#   ENV_FILE=.env.prodtest deploy/prod-e2e.sh
# .env.prodtest needs SITE_ADDRESS=localhost, HTTP_PORT/HTTPS_PORT, https://localhost:<port> URLs.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

ENV_FILE="${ENV_FILE:-.env.prodtest}"
export ENV_FILE
PORT=$(grep -E '^HTTPS_PORT=' "$ENV_FILE" | cut -d= -f2)
BASE="https://localhost:${PORT:-443}"
C=(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE")
CURL=(curl -sSk --max-time 30)
JAR=$(mktemp)
trap 'rm -f "$JAR" "$ENV_FILE.cap"' EXIT
PASS=0
FAIL=0
ok() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
json() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1"; }
sql() { "${C[@]}" exec -T postgres psql -U scheduler -d scheduler -tAc "$1"; }
wait_healthy() {
  for _ in $(seq 1 90); do
    "${CURL[@]}" "$BASE/health" 2>/dev/null | grep -q '"ok":true' && "${C[@]}" ps --format '{{.Service}} {{.State}}' | grep -q '^worker running' && return 0
    sleep 3
  done
  return 1
}
# schedule <label> <count> <lead-seconds> [senderId] -> prints campaign id
schedule() {
  local start recips sender=""
  start=$(python3 -c "import datetime as d; print((d.datetime.now(d.timezone.utc)+d.timedelta(seconds=$3)).strftime('%Y-%m-%dT%H:%M:%SZ'))")
  recips=$(python3 -c "import json,time; print(json.dumps([f'$1-{i}-{int(time.time()*1000)}@example.com' for i in range($2)]))")
  [ -n "${4:-}" ] && sender=",\"senderId\":\"$4\""
  "${CURL[@]}" -b "$JAR" -X POST "$BASE/api/campaigns" -H 'content-type: application/json' \
    -H "Idempotency-Key: $(python3 -c 'import uuid;print(uuid.uuid4())')" \
    -d "{\"subject\":\"E2E $1\",\"body\":\"Production e2e $1\",\"recipients\":$recips,\"startAt\":\"$start\",\"delayMs\":2000,\"hourlyLimit\":200$sender}" | json 'd["campaign"]["id"]'
}
count() { sql "select count(*) from emails where campaign_id='$1' and status='$2'"; }
wait_sent() { # <campaign> <n> <timeout-s>
  for _ in $(seq 1 $(($3 / 3))); do [ "$(count "$1" sent)" -ge "$2" ] && return 0; sleep 3; done
  return 1
}
once() { # every email of the campaign claimed exactly once, never early, distinct Message-IDs
  [ "$(sql "select count(*) from emails where campaign_id='$1' and (attempt_count<>1 or processed_at<scheduled_at)")" = 0 ] &&
    [ "$(sql "select count(distinct smtp_message_id)=count(*) from emails where campaign_id='$1'")" = t ]
}

echo "== Building and starting the production stack ($BASE)"
"${C[@]}" up -d --build >/dev/null 2>&1
check "stack healthy behind Caddy HTTPS" wait_healthy

echo "== Smoke test (same script used against the live site)"
deploy/smoke-test.sh "$BASE" -k | sed 's/^/  /'
SMOKE=${PIPESTATUS[0]}
check "smoke test passed" "[ $SMOKE -eq 0 ]"

echo "== Exposure"
PUBLISHED=$(docker ps --filter "label=com.docker.compose.project=reachinbox-prod" --format '{{.Names}} {{.Ports}}' | grep -- '->' | awk '{print $1}' | tr '\n' ' ')
check "only Caddy publishes ports (databases unreachable from outside) [$PUBLISHED]" "[ \"\$(echo $PUBLISHED)\" = reachinbox-prod-caddy-1 ]"

"${CURL[@]}" -c "$JAR" -o /dev/null -X POST "$BASE/api/auth/register" -H 'content-type: application/json' \
  -d "{\"name\":\"E2E\",\"email\":\"e2e-$(date +%s)@example.com\",\"password\":\"e2e-password-1\"}"

echo "== 1. Crash: SIGKILL api + worker while 6 emails are scheduled"
C1=$(schedule crash 6 60)
"${C[@]}" kill -s SIGKILL api worker >/dev/null 2>&1
sleep 10
check "nothing lost while processes are dead (6 still scheduled)" "[ \$(count $C1 scheduled) = 6 ]"
"${C[@]}" up -d >/dev/null 2>&1
wait_healthy
check "after restart all 6 sent" "wait_sent $C1 6 150"
check "each sent exactly once, none before its time, distinct Message-IDs" "once $C1"

echo "== 2. Redis restart with delayed jobs pending (AOF)"
C2=$(schedule redis 4 45)
BEFORE=$("${C[@]}" exec -T redis redis-cli zcard bull:emails:delayed | tr -d '\r')
sleep 2
"${C[@]}" restart redis >/dev/null 2>&1
AFTER=$("${C[@]}" exec -T redis redis-cli zcard bull:emails:delayed | tr -d '\r')
check "delayed jobs survived the Redis restart ($BEFORE -> $AFTER)" "[ $AFTER -ge 4 ] && [ $AFTER -ge $BEFORE ]"
check "all 4 sent after Redis restart" "wait_sent $C2 4 150"
check "each sent exactly once" "once $C2"

echo "== 3. Full stop and start of every container (server reboot)"
C3=$(schedule reboot 4 75)
"${C[@]}" down >/dev/null 2>&1
check "stack fully stopped" "[ -z \"\$(docker ps -q --filter label=com.docker.compose.project=reachinbox-prod)\" ]"
"${C[@]}" up -d >/dev/null 2>&1
check "stack back up and healthy" wait_healthy
check "account still exists after reboot (session cookie still valid)" "[ \"\$(\"\${CURL[@]}\" -b $JAR -o /dev/null -w '%{http_code}' $BASE/api/auth/me)\" = 200 ]"
check "all 4 emails scheduled before the reboot were sent" "wait_sent $C3 4 180"
check "each sent exactly once" "once $C3"

echo "== 4. Two workers at once"
"${C[@]}" up -d --scale worker=2 --no-recreate >/dev/null 2>&1
sleep 15
C4=$(schedule twoworkers 12 5)
check "all 12 sent with 2 workers" "wait_sent $C4 12 150"
check "each sent exactly once" "once $C4"
IDS=$(sql "select id from emails where campaign_id='$C4'")
LOGS=$("${C[@]}" logs --no-color worker 2>/dev/null)
DUP=$(for id in $IDS; do echo "$LOGS" | grep -c "\"emailId\":\"$id\".*\"msg\":\"sent\""; done | sort -u | tr '\n' ' ')
check "worker logs show one SMTP send per email (counts: $DUP)" "[ \"\$(echo $DUP)\" = 1 ]"
W=$(for id in $IDS; do echo "$LOGS" | grep "\"emailId\":\"$id\".*\"msg\":\"sent\"" | awk '{print $1}'; done | sort -u | wc -l | tr -d ' ')
check "both workers sent some of them ($W worker containers)" "[ $W -eq 2 ]"
"${C[@]}" up -d --scale worker=1 >/dev/null 2>&1

echo "== 5. Elasticsearch down: sending must not be blocked"
"${C[@]}" stop elasticsearch >/dev/null 2>&1
C5=$(schedule esdown 3 5)
check "3 emails sent while Elasticsearch is down" "wait_sent $C5 3 120"
"${C[@]}" start elasticsearch >/dev/null 2>&1
wait_healthy
FOUND=0
for _ in $(seq 1 60); do
  FOUND=$("${CURL[@]}" -b "$JAR" "$BASE/api/emails/search?q=esdown&status=sent" | json 'd["total"]' 2>/dev/null || echo 0)
  [ "$FOUND" -ge 3 ] && break
  sleep 5
done
check "search catches up after Elasticsearch returns ($FOUND/3 indexed)" "[ $FOUND -ge 3 ]"

echo "== 6. Hourly limit: overflow is deferred, never dropped or failed"
sed -E 's/^MAX_EMAILS_PER_HOUR_PER_SENDER=.*//' "$ENV_FILE" > "$ENV_FILE.cap"
echo "MAX_EMAILS_PER_HOUR_PER_SENDER=2" >> "$ENV_FILE.cap"
ENV_FILE="$ENV_FILE.cap" "${C[@]}" up -d api worker >/dev/null 2>&1
wait_healthy
SENDER=$("${CURL[@]}" -b "$JAR" "$BASE/api/senders" | json 'd[0]["id"]')
C6A=$(schedule limitA 3 3 "$SENDER")
C6B=$(schedule limitB 3 3 "$SENDER")
sleep 45
NEXT_HOUR=$(python3 -c "import time; print(int(time.time()//3600+1)*3600)")
for c in "$C6A" "$C6B"; do
  check "campaign ${c:0:8}: 0 failed" "[ \$(count $c failed) = 0 ]"
done
DEFERRED=$(sql "select count(*) from emails where campaign_id in ('$C6A','$C6B') and status='scheduled' and deferred_count>0 and extract(epoch from scheduled_at) >= $NEXT_HOUR")
TOTAL_OK=$(sql "select count(*) from emails where campaign_id in ('$C6A','$C6B') and status in ('sent','scheduled')")
check "over-limit emails deferred into the next hour ($DEFERRED deferred)" "[ $DEFERRED -ge 4 ]"
check "all 6 accounted for as sent or scheduled" "[ $TOTAL_OK = 6 ]"
check "worker logged the limit hit and kept running" "\"\${C[@]}\" logs --no-color worker 2>/dev/null | grep -q 'hourly limit hit' && \"\${C[@]}\" ps --format '{{.Service}} {{.State}}' | grep -q '^worker running'"
"${C[@]}" up -d api worker >/dev/null 2>&1
wait_healthy

echo
echo "Production e2e: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
