#!/usr/bin/env bash
# One-time server preparation for Ubuntu 22.04/24.04 (e.g. Oracle Cloud Always Free, Ampere A1).
# Opens ports 80/443 in the host firewall, installs Docker, and checks outbound access to Ethereal.
#   ssh -i <key> ubuntu@<server-ip> 'bash -s' < deploy/server-setup.sh
set -euo pipefail

echo "== 1/4 Host firewall (iptables)"
# Oracle's Ubuntu images end the INPUT and FORWARD chains with a catch-all REJECT.
# ACCEPT rules must sit *before* that REJECT, so insert at the REJECT's current position.
reject_pos() { sudo iptables -L "$1" --line-numbers -n | awk '$2=="REJECT"{print $1; exit}'; }
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null; then
    pos=$(reject_pos INPUT)
    if [ -n "$pos" ]; then
      sudo iptables -I INPUT "$pos" -p tcp -m state --state NEW --dport "$port" -j ACCEPT
    else
      sudo iptables -A INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT
    fi
  fi
done
# Save NOW, before Docker exists: Docker adds its own rules at every start, and saving them
# would restore stale Docker rules on reboot.
if command -v netfilter-persistent >/dev/null 2>&1; then
  sudo netfilter-persistent save >/dev/null 2>&1 && echo "   rules saved (survive reboot)"
fi
sudo iptables -L INPUT --line-numbers -n | sed 's/^/   /'

echo "== 2/4 Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh >/dev/null
fi
sudo systemctl enable --now docker >/dev/null 2>&1 || true
sudo usermod -aG docker "$USER" || true
docker_ver=$(sudo docker --version)
echo "   $docker_ver"
# Docker inserts its FORWARD jumps at the top of the chain, ahead of Oracle's FORWARD REJECT.
first_fwd=$(sudo iptables -L FORWARD -n | awk 'NR==3{print $1" "$2}')
echo "   first FORWARD rule: $first_fwd (should be a DOCKER jump, not REJECT)"

echo "== 3/4 Kernel setting for Elasticsearch"
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-elasticsearch.conf >/dev/null
sudo sysctl -q --system
echo "   vm.max_map_count=$(sysctl -n vm.max_map_count)"

echo "== 4/4 Outbound access the app needs"
probe() {
  if timeout 8 bash -c "exec 3<>/dev/tcp/$1/$2" 2>/dev/null; then echo "   OK    $1:$2  ($3)"; else echo "   FAIL  $1:$2  ($3)"; return 1; fi
}
ok=0
probe smtp.ethereal.email 587 "Ethereal SMTP: sending email" || ok=1
probe api.nodemailer.com 443 "Ethereal account creation" || ok=1
probe slack.com 443 "Slack OAuth and alerts" || ok=1
probe oauth2.googleapis.com 443 "Google sign-in" || ok=1

mkdir -p ~/reachinbox
if [ "$ok" -eq 0 ]; then
  echo "Server ready. Next: allow TCP 80,443 in the Oracle VCN Security List (if not done), then run deploy/deploy.sh."
else
  echo "Server prepared, but some outbound checks FAILED (see above). If port 587 failed, Ethereal cannot send:"
  echo "upgrade the tenancy to Pay As You Go or open an Oracle support request to allow outbound 587."
  exit 2
fi
