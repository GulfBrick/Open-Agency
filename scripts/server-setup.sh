#!/bin/bash
set -e

echo "========================================="
echo "  Open Agency — Server Setup"
echo "========================================="

# Update system
apt-get update -y
apt-get upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git

# Install PM2
npm install -g pm2

# Clone repo
cd /opt
git clone https://github.com/GulfBrick/Open-Agency.git open-agency
cd open-agency

# Install dependencies
npm install

# Create .env from example
cp .env.example .env

# Write real values we know
cat >> .env << 'EOF'
OPEN_AGENCY_API_KEY=oa_live_b051d6501b9db536e386e19539659a93b9bbf98a5401523b50ca49fd859d86cb
EOF

echo ""
echo "========================================="
echo "  IMPORTANT: Edit .env with your API keys"
echo "  nano /opt/open-agency/.env"
echo "========================================="
echo ""
echo "Keys needed:"
echo "  ANTHROPIC_API_KEY"
echo "  ELEVENLABS_API_KEY"
echo "  TELEGRAM_BOT_TOKEN"
echo "  TELEGRAM_CHAT_ID"
echo ""

# Start with PM2
pm2 start src/index.js --name open-agency
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash

echo ""
echo "========================================="
echo "  Open Agency is running!"
echo "  Dashboard: http://$(curl -s ifconfig.me):3001"
echo "========================================="
