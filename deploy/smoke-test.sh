#!/usr/bin/env bash
# Functional smoke test against a running deployment (local or live). Non-destructive: it creates
# one throwaway account and sends 3 emails to example.com addresses (Ethereal never delivers them).
#   deploy/smoke-test.sh https://your-host            (add -k as 2nd arg for self-signed local HTTPS)
set -uo pipefail

BASE="${1:?usage: deploy/smoke-test.sh <base-url> [-k]}"
BASE="${BASE%/}"
CURL=(curl -sS --max-time 30 ${2:-})
JAR=$(mktemp)
trap 'rm -f "$JAR"' EXIT
PASS=0
FAIL=0
ok() { echo "  PASS  $1"; PASS=$((PASS + 1)); }
bad() { echo "  FAIL  $1"; FAIL=$((FAIL + 1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }
json() { python3 -c "import sys,json; d=json.load(sys.stdin); print(eval(sys.argv[1]))" "$1"; }
code() { "${CURL[@]}" -o /dev/null -w '%{http_code}' "$@"; }

echo "Smoke test: $BASE"

echo "- health and pages"
H=$("${CURL[@]}" "$BASE/health")
check "health: postgres, redis, elasticsearch all ok" "[ \"\$(echo '$H' | json 'd[\"ok\"] and d[\"elasticsearch\"][\"ok\"]')\" = True ]"
for p in / /login /dashboard /compose /privacy; do
  check "page $p serves the app" "[ \"\$(code -H 'Accept: text/html' $BASE$p)\" = 200 ]"
done
check "unknown API route returns JSON 404" "[ \"\$(code $BASE/api/nope)\" = 404 ]"

echo "- security"
HDRS=$("${CURL[@]}" -D - -o /dev/null "$BASE/login")
check "HSTS header" "echo \"\$HDRS\" | grep -qi strict-transport-security"
check "Content-Security-Policy header" "echo \"\$HDRS\" | grep -qi content-security-policy"
check "API rejects requests without a session (401)" "[ \"\$(code $BASE/api/emails/scheduled)\" = 401 ]"
check "queue dashboard sends signed-out visitors to login (302)" "[ \"\$(code -H 'Accept: text/html' $BASE/admin/queues)\" = 302 ]"

echo "- email + password account"
EMAIL="smoke-$(date +%s)-$RANDOM@example.com"
REG=$("${CURL[@]}" -c "$JAR" -D - -o /dev/null -X POST "$BASE/api/auth/register" -H 'content-type: application/json' \
  -d "{\"name\":\"Smoke Test\",\"email\":\"$EMAIL\",\"password\":\"smoke-test-pass-1\"}")
check "sign-up returns 201" "echo \"\$REG\" | head -1 | grep -q ' 201'"
check "session cookie is HttpOnly + Secure + SameSite=Lax" "echo \"\$REG\" | grep -i 'set-cookie: session=' | grep -qi httponly && echo \"\$REG\" | grep -i 'set-cookie: session=' | grep -qi secure && echo \"\$REG\" | grep -i 'set-cookie: session=' | grep -qi 'samesite=lax'"
check "/api/auth/me returns the new user" "[ \"\$(\"\${CURL[@]}\" -b \"$JAR\" $BASE/api/auth/me | json 'd[\"email\"]')\" = '$EMAIL' ]"
check "wrong password is rejected (401)" "[ \"\$(code -X POST $BASE/api/auth/login -H 'content-type: application/json' -d '{\"email\":\"$EMAIL\",\"password\":\"wrong-password\"}')\" = 401 ]"
check "correct password logs in (200)" "[ \"\$(code -X POST $BASE/api/auth/login -H 'content-type: application/json' -d '{\"email\":\"$EMAIL\",\"password\":\"smoke-test-pass-1\"}')\" = 200 ]"
check "signed-in user can open the queue dashboard, read-only" "[ \"\$(code -b \"$JAR\" -H 'Accept: text/html' $BASE/admin/queues)\" = 200 ] && \"\${CURL[@]}\" -b \"$JAR\" $BASE/admin/queues/api/queues | json 'all(q[\"readOnlyMode\"] for q in d[\"queues\"])' | grep -q True"

echo "- OAuth redirects point at this host"
G=$("${CURL[@]}" -o /dev/null -w '%{redirect_url}' "$BASE/api/auth/google")
check "Google login redirects to Google with this host's callback" "echo \"\$G\" | grep -q 'accounts.google.com' && python3 -c \"import sys,urllib.parse as u; q=u.parse_qs(u.urlparse(sys.argv[1]).query); sys.exit(0 if q['redirect_uri'][0]=='$BASE/api/auth/google/callback' else 1)\" \"\$G\""
S=$("${CURL[@]}" -b "$JAR" -o /dev/null -w '%{redirect_url}' "$BASE/api/slack/connect")
check "Slack connect redirects to Slack with this host's callback" "echo \"\$S\" | grep -q 'slack.com/oauth/v2/authorize' && python3 -c \"import sys,urllib.parse as u; q=u.parse_qs(u.urlparse(sys.argv[1]).query); sys.exit(0 if q['redirect_uri'][0]=='$BASE/api/slack/callback' else 1)\" \"\$S\""

echo "- schedule, send through Ethereal, search"
KEY=$(python3 -c 'import uuid; print(uuid.uuid4())')
BODY="{\"subject\":\"Smoke test $RANDOM\",\"body\":\"Deployed smoke test\",\"recipients\":[\"s1@example.com\",\"s2@example.com\",\"s3@example.com\",\"S1@example.com\",\"bad\"],\"startAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"delayMs\":2000,\"hourlyLimit\":200}"
C1=$("${CURL[@]}" -b "$JAR" -X POST "$BASE/api/campaigns" -H 'content-type: application/json' -H "Idempotency-Key: $KEY" -d "$BODY")
CID=$(echo "$C1" | json 'd["campaign"]["id"]')
check "campaign created: 3 scheduled, 1 duplicate removed, 1 invalid" "[ \"\$(echo '$C1' | json '(d[\"scheduledCount\"],d[\"duplicatesRemoved\"],d[\"invalidCount\"])')\" = '(3, 1, 1)' ]"
check "same Idempotency-Key again returns 200 and the same campaign" "[ \"\$(\"\${CURL[@]}\" -b \"$JAR\" -o /dev/null -w '%{http_code}' -X POST $BASE/api/campaigns -H 'content-type: application/json' -H 'Idempotency-Key: $KEY' -d '$BODY')\" = 200 ]"
SENT=0
for _ in $(seq 1 30); do
  SENT=$("${CURL[@]}" -b "$JAR" "$BASE/api/emails/sent" | json 'sum(1 for i in d["items"] if i["status"]=="sent" and i["previewUrl"])')
  [ "$SENT" -ge 3 ] && break
  sleep 3
done
check "all 3 emails sent through Ethereal, each with a preview link" "[ $SENT -eq 3 ]"
check "scheduled list is empty again" "[ \"\$(\"\${CURL[@]}\" -b \"$JAR\" $BASE/api/emails/scheduled | json 'd[\"total\"]')\" = 0 ]"
FIRST=$("${CURL[@]}" -b "$JAR" "$BASE/api/emails/sent" | json 'd["items"][0]["id"]')
check "email detail has a Message-ID and 1 attempt" "[ \"\$(\"\${CURL[@]}\" -b \"$JAR\" $BASE/api/emails/$FIRST | json 'bool(d[\"messageId\"]) and d[\"attemptCount\"]==1')\" = True ]"
HITS=0
for _ in $(seq 1 10); do
  HITS=$("${CURL[@]}" -b "$JAR" "$BASE/api/emails/search?q=deployed&status=sent" | json 'd["total"]')
  [ "$HITS" -ge 3 ] && break
  sleep 2
done
check "Elasticsearch search finds the 3 emails" "[ $HITS -ge 3 ]"
check "search is scoped to the user (a fresh account sees 0)" "[ \"\$(\"\${CURL[@]}\" -X POST $BASE/api/auth/register -H 'content-type: application/json' -c $JAR.2 -d '{\"name\":\"Other\",\"email\":\"other-$EMAIL\",\"password\":\"smoke-test-pass-1\"}' -o /dev/null -w '%{http_code}')\" = 201 ] && [ \"\$(\"\${CURL[@]}\" -b $JAR.2 '$BASE/api/emails/search?q=deployed' | json 'd[\"total\"]')\" = 0 ] && [ \"\$(code -b $JAR.2 $BASE/api/emails/$FIRST)\" = 404 ]"
rm -f "$JAR.2"
echo "  (campaign $CID)"

echo
echo "Smoke test: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
