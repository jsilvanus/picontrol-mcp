# picontrol-mcp

MCP server for the Pi stack (pimatrix, PiPGM, pivoice). Streamable HTTP, stateless, Node 24, ESM, bare metal (systemd), one port (default 3200). Plan: `pi/picontrol-mcp-plan-2026-10-25.md` in the project files.

Not run on the Pi or against a real MCP client yet. Tested with fake pimatrix and pivoice servers (`npm test`).

## What it exposes

Tools are grouped by task, not one per REST endpoint; state is in `pi://` resources. Read `pi://help/domains` first (the server also tells clients to).

| Group | Tools | Main resources |
|---|---|---|
| routing | `routing_set_output_source`, `routing_request_route`, `routing_set_multiview`, `routing_set_lock`, `source_set_framing`, `output_set_crop`, `source_set_blackout_mute`, `rtsp_output_control` | `pi://routing/matrix`, `/outputs[/{id}]`, `/multiview`, `/sources[/{id}]` |
| cameras | `camera_move`, `camera_zoom`, `camera_preset`, `camera_set_smartframe`, `camera_privacy_blur`, `camera_stream` | `pi://cameras[/{id}]` |
| atem | `atem_switch` | `pi://atem` |
| program | `program_control`, `program_set_fade_to_black`, `program_set_audio`, `program_playlist`, `program_create_item`, `program_configure_pipeline`, `slides_canva_control`, `slides_canva_push` | `pi://program/pipelines[/{id}]`, `pi://program/items[/{id}]` |
| composites | `composite_set_slide`, `composite_control` | `pi://composites[/{id}[/preview]]` |
| voice | `voice_set_radio_mode`, `voice_set_transcription_mode`, `voice_set_captions_mode` (relay, YouTube), `voice_capture`, `voice_configure` | `pi://voice/status`, `/radio`, `/captions`, `/devices`, `/config` |
| system | `system_whoami` | `pi://status`, `pi://help/domains` |

Secrets (stream keys, passwords, tokens) are masked in every result and audit entry. The live event streams of pimatrix and pivoice are not exposed (a stateless request cannot hold them).

## Rights

Permissions are `domain:level` (`routing cameras atem program composites voice system`, or `*`; levels `read < write < admin`).

| Role | Gets |
|---|---|
| viewer | `*:read` |
| operator | `*:write` (everything needed during a service) |
| admin | `*:admin` (also preset save, pipeline config, matrix lock, voice config) |

A user can have extra grants and denies (`--grant program:write`, `--deny atem:write`; a deny removes that level and above). Tools a user may not call are not listed and are refused if called by name. Rights are read from the users file on every request: removing or disabling a user cuts access at once, also for OAuth tokens already issued. Custom roles: add `"roles": {"slides": ["program:write", "composites:write", "*:read"]}` to `users.json`.

## Users (CLI)

```sh
npm run build
npm run user -- add anna --role operator          # password asked twice, hidden; or --password-stdin
npm run user -- update anna --role viewer --grant program:write --disable
npm run user -- list
npm run user -- show anna
npm run user -- remove anna
npm run user -- token create anna --label claude-code --days 90   # printed once
npm run user -- token list anna | token revoke anna <id>
npm run user -- roles
npm run user -- secret                            # new JWT_SECRET
```

Users live in `~/.config/picontrol-mcp/users.json` (`USERS_PATH`), mode 0600; the server refuses to start if group or others can read it. Passwords: scrypt (N=32768), at least 12 characters, never accepted as an argument. Tokens: stored as SHA-256 only.

## Signing in

`AUTH_MODE=both` (default):
- **Personal access token** (`pcm_...`): `Authorization: Bearer ...`. Works over plain http on the LAN. For Claude Code, MCP Inspector, scripts: `claude mcp add --transport http pi http://kirkonpi.local:3200/mcp --header "Authorization: Bearer pcm_..."`.
- **OAuth** (from the codestash template): authorization code + PKCE S256, CIMD client ids, user name + password sign-in, consent page, refresh tokens. Needs `MCP_PUBLIC_URL` to be the address clients really use; clients such as Claude and ChatGPT want https and, for the web versions, a public address. Put a TLS proxy in front for that (not part of this repo). Login attempts are rate limited per client address and user name.

`AUTH_MODE=token` turns the OAuth endpoints off.

`/mcp` checks `Host` and `Origin` against `MCP_PUBLIC_URL` and `MCP_ALLOWED_HOSTS` (DNS-rebinding protection); add the address clients use, with port.

## Upstream credentials

The server calls pimatrix with `PIMATRIX_API_KEY` and pivoice with `PIVOICE_API_TOKEN` (Bearer), kept in the env file (mode 0600), never returned by any tool. Do not rely on pimatrix's localhost whitelist. Set a URL to `off` to drop that tool group. Every tool call and login is written to the audit log (`~/.local/state/picontrol-mcp/audit.log`, JSON lines, rotated at 5 MB).

## Generated clients

`openapi/pimatrix.yaml` and `openapi/pivoice.yaml` are pinned copies of the upstream specs. `npm run generate` (also run before build and test) makes typed fetch clients in `src/generated/` with `openapi-typescript-codegen`, as pimatrix does. To update: `npm run spec:sync -- --pimatrix ../pimatrix --pivoice ../pivoice`, then build; a breaking spec change fails the type check. The generator cannot read one `$ref` in pivoice's spec (`Status.radio`); `scripts/generate-clients.mjs` patches that.

## Install on the Pi

```sh
git clone https://github.com/jsilvanus/picontrol-mcp ~/apps/picontrol-mcp && cd ~/apps/picontrol-mcp
deploy/pi/install.sh        # build, env file with a new JWT_SECRET, systemd user unit
nano ~/apps/picontrol-mcp.env
node dist/cli/user.js add <name> --role admin
systemctl --user restart picontrol-mcp
```

Development: `npm test` (31+ tests: users, permissions, CLI, OAuth flow, tools against fake upstreams), `npm run dev`.

## Not built / known limits

No password reset or self-service password change (an admin uses the CLI). No push notifications or resource subscriptions. Untested on hardware: everything here, and pivoice itself (no sound card yet).
