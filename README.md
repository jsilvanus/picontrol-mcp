# picontrol-mcp

MCP server for the Pi stack (`pimatrix`, `pipgm`, `pivoice`, `pitube`, `pilight`, `radio-relay`). Streamable HTTP, stateless, Node 24, ESM, bare metal (systemd), one port (default 3200).

---

## What it exposes

Tools are grouped by task, not one per REST endpoint; state is in `pi://` resources. Read `pi://help/domains` first.

| Group | Tools | Main resources |
|---|---|---|
| routing | `routing_set_output_source`, `routing_request_route`, `routing_set_multiview`, `routing_set_lock`, `source_set_framing`, `output_set_crop`, `source_set_blackout_mute`, `rtsp_output_control` | `pi://routing/matrix`, `/outputs[/{id}]`, `/multiview`, `/sources[/{id}]` |
| cameras | `camera_move`, `camera_zoom`, `camera_preset`, `camera_set_smartframe`, `camera_privacy_blur`, `camera_stream` | `pi://cameras[/{id}]` |
| atem | `atem_switch` | `pi://atem` |
| program | `program_control`, `program_set_fade_to_black`, `program_set_audio`, `program_playlist`, `program_create_item`, `program_configure_pipeline`, `slides_canva_control`, `slides_canva_push` | `pi://program/pipelines[/{id}]`, `pi://program/items[/{id}]` |
| composites | `composite_set_slide`, `composite_control` | `pi://composites[/{id}[/preview]]` |
| voice | `voice_set_radio_mode`, `voice_set_transcription_mode`, `voice_set_captions_mode` (relay, YouTube), `voice_capture`, `voice_configure` | `pi://voice/status`, `/radio`, `/captions`, `/devices`, `/config` |
| youtube | `youtube_broadcast_list`, `youtube_broadcast_select`, `youtube_broadcast_create`, `youtube_broadcast_start`, `youtube_broadcast_stop`, `youtube_status` | `pi://youtube/status`, `/broadcasts` |
| tally | `tally_list`, `tally_set_state`, `tally_cue`, `tally_call`, `tally_hold`, `tally_brightness`, `tally_set_segments`, `tally_cycle` | `pi://tally/lights[/{id}]` |
| radio | `radio_status`, `radio_start`, `radio_stop` | `pi://radio/status` |
| rundown | `rundown_cue_next`, `rundown_cue_prev`, `rundown_goto`, `rundown_action_exec`, `rundown_create_or_update` | `pi://rundown/current`, `pi://schema/rundown-v2`, `pi://schema/actions`, `pi://help/rundown`, `pi://help/actions` |
| system | `system_whoami` | `pi://status`, `pi://help/domains` |

Secrets (stream keys, passwords, tokens) are masked in every result and audit entry.

---

## Rights

Permissions are `domain:level` (`routing cameras atem program composites voice youtube tally radio system`, or `*`; levels `read < write < admin`).

| Role | Gets |
|---|---|
| viewer | `*:read` |
| operator | `*:write` (everything needed during a service) |
| admin | `*:admin` (also preset save, pipeline config, matrix lock, voice config, tally segment config) |

A user can have extra grants and denies (`--grant program:write`, `--deny atem:write`; a deny removes that level and above). Tools a user may not call are not listed and are refused if called by name. Rights are read from the users file on every request: removing or disabling a user cuts access at once, also for OAuth tokens already issued. Custom roles: add `"roles": {"slides": ["program:write", "composites:write", "*:read"]}` to `users.json`.

---

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

---

## Signing in

`AUTH_MODE=both` (default):
- **Personal access token** (`pcm_...`): `Authorization: Bearer ...`. Works over plain http on the LAN. For Claude Code, MCP Inspector, scripts: `claude mcp add --transport http pi http://kirkonpi.local:3200/mcp --header "Authorization: Bearer pcm_..."`.
- **OAuth**: authorization code + PKCE S256, CIMD client ids, user name + password sign-in, consent page, refresh tokens. Put a TLS proxy in front for public access.

`AUTH_MODE=token` turns the OAuth endpoints off.

---

## Testing & Build

```sh
npm test      # Runs all 38 tests (users, permissions, CLI, OAuth, upstreams)
npm run build # Generates upstream clients & compiles TypeScript
```

---

## Pi Ecosystem Integration & Status Updates

This project is an integral component of the [Pi Production Ecosystem](file:///d:/piecosystem).

> [!IMPORTANT]
> Any changes to this repository's architectural role, API routes, communication protocols, exposed ports, dependencies, or runtime status **must be documented in the central `piecosystem` coordination repository** (`docs/projects-catalog.md` and `docs/inter-service-matrix.md`).
> Always verify cross-system health with `npm run status` in `D:\piecosystem`.
