#!/bin/bash
set -euo pipefail

# iKopilot deployment script
# Usage: ./deploy.sh [server_ip]

SERVER="${1:-37.27.31.70}"
USER="robustidps"
REMOTE_DIR="/home/$USER/ikopilot"

echo "=== iKopilot Deployment ==="
echo "Target: $USER@$SERVER:$REMOTE_DIR"
echo ""

# Sync files to server (exclude dev files)
echo "[1/4] Syncing files..."
rsync -avz --delete \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude '__pycache__' \
    --exclude '.env' \
    --exclude 'venv' \
    --exclude '.venv' \
    --exclude '*.pyc' \
    --exclude 'deploy/ssl/*.pem' \
    --exclude 'deploy/ssl/*.key' \
    ./ "$USER@$SERVER:$REMOTE_DIR/"

# Build and restart containers
echo "[2/4] Building containers..."
ssh "$USER@$SERVER" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml build"

echo "[3/4] Starting containers..."
ssh "$USER@$SERVER" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d"

echo "[4/4] Checking status..."
ssh "$USER@$SERVER" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml ps"

echo ""
echo "=== Deployment complete ==="
echo "Site: https://ikopilot.com"
