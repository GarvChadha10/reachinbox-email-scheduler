#!/usr/bin/env bash
# One-time server preparation for Ubuntu 22.04/24.04 (e.g. Oracle Cloud Always Free, Ampere A1).
# Installs Docker and opens ports 80/443 in the host firewall.
#   ssh ubuntu@<server-ip> 'bash -s' < deploy/server-setup.sh
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER" || true

# Oracle's Ubuntu images ship iptables rules that reject everything except SSH.
# Insert ACCEPT rules for HTTP/HTTPS before the final REJECT and persist them.
for port in 80 443; do
  if ! sudo iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null; then
    sudo iptables -I INPUT 6 -p tcp -m state --state NEW --dport "$port" -j ACCEPT
  fi
done
if command -v netfilter-persistent >/dev/null 2>&1; then
  sudo netfilter-persistent save
fi

# Elasticsearch needs a higher mmap count.
echo 'vm.max_map_count=262144' | sudo tee /etc/sysctl.d/99-elasticsearch.conf >/dev/null
sudo sysctl -q --system

mkdir -p ~/reachinbox
echo "Server ready: Docker $(docker --version 2>/dev/null | cut -d' ' -f3 | tr -d ,) installed, ports 80/443 open in iptables."
echo "Remember to also allow 80/443 in the Oracle Cloud VCN security list (see README)."
