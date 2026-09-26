#!/bin/bash
# ==============================================================================
# QuantumAI Automated Production VPS Setup Script (Ubuntu 24.04 / 22.04 LTS)
# Installs: Node.js 22 LTS, Git, PostgreSQL 16, PM2, Build Tools & Firewall
# ==============================================================================

set -e

echo "=========================================================="
echo "🚀 Memulakan Pemasangan Persekitaran Pelayan QuantumAI..."
echo "=========================================================="

# 1. Update OS packages
echo "📦 Mengemaskini pakej sistem Ubuntu..."
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential ufw software-properties-common

# 2. Install Node.js 22.x LTS
echo "📦 Memasang Node.js 22 LTS & npm..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
echo "✅ Node.js: $(node -v) | npm: $(npm -v)"

# 3. Install PM2 Globally
echo "📦 Memasang PM2 Process Manager..."
sudo npm install -g pm2 tsx typescript

# 4. Install & Configure PostgreSQL
echo "📦 Memasang PostgreSQL..."
sudo apt install -y postgresql postgresql-contrib

echo "🔧 Mengkonfigurasi pangkalan data 'quantumai'..."
sudo -u postgres psql -c "CREATE USER quantum_user WITH PASSWORD 'quantum_secure_pass';" || true
sudo -u postgres psql -c "CREATE DATABASE quantumai OWNER quantum_user;" || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE quantumai TO quantum_user;" || true

# 5. Configure Firewall (UFW)
echo "🛡️ Menetapkan Firewall (UFW)..."
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH'
sudo ufw allow 3000/tcp comment 'QuantumAI API'
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'
echo "y" | sudo ufw enable

echo "=========================================================="
echo "🎉 Pemasangan Selesai! Persekitaran VPS sedia untuk QuantumAI."
echo "=========================================================="
