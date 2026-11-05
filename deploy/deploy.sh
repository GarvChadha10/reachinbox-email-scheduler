#!/usr/bin/env bash
# Deploy (or update) the app on a server prepared with deploy/server-setup.sh.
# Ships the committed code (git archive) plus your local .env.production over SSH, then
# builds and (re)starts the stack. Data volumes survive redeploys.
#   deploy/deploy.sh ubuntu@<server-ip> [path/to/ssh-key]
set -euo pipefail

TARGET="${1:?usage: deploy/deploy.sh user@host [ssh-key]}"
KEY="${2:-}"
SSH=(ssh -o StrictHostKeyChecking=accept-new)
[ -n "$KEY" ] && SSH+=(-i "$KEY")

cd "$(git rev-parse --show-toplevel)"
[ -f .env.production ] || { echo "Missing .env.production (copy .env.production.example and fill it in)."; exit 1; }
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Warning: uncommitted changes are NOT deployed (git archive ships HEAD)."
fi

echo "Uploading $(git rev-parse --short HEAD) to $TARGET ..."
git archive --format=tar HEAD | "${SSH[@]}" "$TARGET" 'mkdir -p ~/reachinbox && tar -x -C ~/reachinbox'
"${SSH[@]}" "$TARGET" 'umask 077 && cat > ~/reachinbox/.env.production' < .env.production

echo "Building and starting containers (first build takes a few minutes) ..."
"${SSH[@]}" "$TARGET" 'cd ~/reachinbox && sudo docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build --remove-orphans && sudo docker image prune -f >/dev/null'

SITE=$(grep -E '^SITE_ADDRESS=' .env.production | cut -d= -f2)
echo "Waiting for https://$SITE/health ..."
for _ in $(seq 1 60); do
  if curl -fsS "https://$SITE/health" >/dev/null 2>&1; then
    echo "Live: https://$SITE"
    exit 0
  fi
  sleep 5
done
echo "Not healthy yet. Check: ssh $TARGET 'cd ~/reachinbox && sudo docker compose -f docker-compose.prod.yml logs --tail 50'"
exit 1
