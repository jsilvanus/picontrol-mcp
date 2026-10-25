#!/bin/sh
# Idempotent install of picontrol-mcp as a systemd user service. Run on the Pi as the service user, from the repo.
# Untested on the Pi.
set -eu
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="${PICONTROL_MCP_ENV:-$HOME/apps/picontrol-mcp.env}"
NODE="${NODE:-$HOME/.local/bin/node}"

cd "$APP_DIR"
npm ci
npm run build

if [ ! -f "$ENV_FILE" ]; then
  cp .env.example "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  SECRET="$("$NODE" dist/cli/user.js secret)"
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" "$ENV_FILE"
  echo "Created $ENV_FILE with a new JWT_SECRET. Edit the placeholders (PIMATRIX_API_KEY, PIVOICE_API_TOKEN, MCP_PUBLIC_URL)."
fi
chmod 600 "$ENV_FILE"

mkdir -p "$HOME/.config/systemd/user" "$HOME/.config/picontrol-mcp" "$HOME/.local/state/picontrol-mcp"
chmod 700 "$HOME/.config/picontrol-mcp" "$HOME/.local/state/picontrol-mcp"
sed "s|/home/pi/apps/picontrol-mcp.env|$ENV_FILE|; s|/home/pi/apps/picontrol-mcp|$APP_DIR|; s|/home/pi/.local/bin/node|$NODE|" \
  deploy/pi/picontrol-mcp.service > "$HOME/.config/systemd/user/picontrol-mcp.service"
systemctl --user daemon-reload
systemctl --user enable picontrol-mcp.service
echo "Create the first user:  USERS_PATH=... $NODE dist/cli/user.js add <name> --role admin"
echo "Then start:             systemctl --user restart picontrol-mcp"
