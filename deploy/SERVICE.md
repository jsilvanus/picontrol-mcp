# systemd user unit

`picontrol-mcp.service` runs the MCP server as a systemd user service.

Expected layout (relative to the service user's home, `%h`):

- app checkout (built, with `dist/`): `~/apps/picontrol-mcp`
- environment file: `~/apps/picontrol-mcp.env` (all settings and secrets live here, never in git)
- Node.js: `~/.local/bin/node`

Install:

```sh
mkdir -p ~/.config/systemd/user
cp deploy/picontrol-mcp.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now picontrol-mcp
loginctl enable-linger "$USER"   # once, so it runs without a login session
```

Status and logs: `systemctl --user status picontrol-mcp`, `journalctl --user -u picontrol-mcp -f`.
