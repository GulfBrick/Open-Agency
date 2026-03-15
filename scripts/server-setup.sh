#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  Open Agency — Server Setup Script
#  Run: curl -fsSL https://raw.githubusercontent.com/GulfBrick/Open-Agency/main/scripts/server-setup.sh | bash
# ═══════════════════════════════════════════════════════════════

echo ""
echo "════════════════════════════════════════════"
echo "  Open Agency — Server Setup"
echo "════════════════════════════════════════════"
echo ""

APP_DIR="/opt/open-agency"
APP_USER="openagency"
REPO="https://github.com/GulfBrick/Open-Agency.git"
NODE_VERSION="22"

# ─── 1. System Updates ────────────────────────────────────────

echo "[1/8] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git build-essential

# ─── 2. Install Node.js ──────────────────────────────────────

echo "[2/8] Installing Node.js ${NODE_VERSION}..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi
echo "  Node: $(node -v)"
echo "  npm:  $(npm -v)"

# ─── 3. Create app user ──────────────────────────────────────

echo "[3/8] Creating app user..."
if ! id "$APP_USER" &>/dev/null; then
  useradd -r -m -s /bin/bash "$APP_USER"
  echo "  Created user: $APP_USER"
else
  echo "  User $APP_USER already exists"
fi

# ─── 4. Clone the repo ───────────────────────────────────────

echo "[4/8] Cloning repository..."
if [ -d "$APP_DIR" ]; then
  echo "  Directory exists — pulling latest..."
  cd "$APP_DIR"
  git fetch origin
  git reset --hard origin/main
else
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# ─── 5. Install dependencies ─────────────────────────────────

echo "[5/8] Installing npm dependencies..."
cd "$APP_DIR"
sudo -u "$APP_USER" npm install --production

# ─── 6. Set up .env ──────────────────────────────────────────

echo "[6/8] Setting up environment..."
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo ""
  echo "  ╔══════════════════════════════════════════════╗"
  echo "  ║  IMPORTANT: Edit your .env file!             ║"
  echo "  ║  nano /opt/open-agency/.env                  ║"
  echo "  ║                                              ║"
  echo "  ║  Required keys:                              ║"
  echo "  ║    - ANTHROPIC_API_KEY                       ║"
  echo "  ║    - NIKITA_TELEGRAM_TOKEN                   ║"
  echo "  ║    - HARRY_TELEGRAM_ID                       ║"
  echo "  ║    - OPEN_AGENCY_API_KEY                     ║"
  echo "  ╚══════════════════════════════════════════════╝"
  echo ""
else
  echo "  .env already exists — keeping existing config"
fi

# ─── 7. Create data directories ──────────────────────────────

echo "[7/8] Creating data directories..."
mkdir -p "$APP_DIR/data/state"
mkdir -p "$APP_DIR/data/workflows"
mkdir -p "$APP_DIR/data/conversations"
mkdir -p "$APP_DIR/data/clients"
mkdir -p "$APP_DIR/data/agent-experience"
mkdir -p "$APP_DIR/data/business-knowledge"
mkdir -p "$APP_DIR/logs"
chown -R "$APP_USER":"$APP_USER" "$APP_DIR/data" "$APP_DIR/logs"

# ─── 8. Create systemd service ───────────────────────────────

echo "[8/8] Creating systemd service..."
cat > /etc/systemd/system/open-agency.service << 'UNIT'
[Unit]
Description=Open Agency — AI-powered business agency
After=network.target

[Service]
Type=simple
User=openagency
Group=openagency
WorkingDirectory=/opt/open-agency
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

# Load env vars from .env file
EnvironmentFile=/opt/open-agency/.env

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=open-agency

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/opt/open-agency/data /opt/open-agency/logs

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable open-agency

echo ""
echo "════════════════════════════════════════════"
echo "  Setup Complete!"
echo "════════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Edit your environment variables:"
echo "     nano /opt/open-agency/.env"
echo ""
echo "  2. Start the agency:"
echo "     systemctl start open-agency"
echo ""
echo "  3. Check status:"
echo "     systemctl status open-agency"
echo ""
echo "  4. View logs:"
echo "     journalctl -u open-agency -f"
echo ""
echo "  Dashboard will be at http://$(hostname -I | awk '{print $1}'):3001"
echo ""
