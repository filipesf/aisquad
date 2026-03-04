# Sentinel Runbook

> Discord infrastructure bot for the Flare server. Runs as a systemd service (`openclaw-sentinel`) inside the OrbStack VM `aisquad`.

## Quick Reference

| Action                               | Command                                                         |
| ------------------------------------ | --------------------------------------------------------------- |
| Full deploy (build + sync + restart) | `npm start` or `make sentinel-deploy` from repo root            |
| Register slash commands              | `npm run deploy` or `make sentinel-commands` from repo root     |
| Sync files only (no restart)         | `./deploy.sh sync`                                              |
| Restart service                      | `npm run restart`                                               |
| Stop service                         | `npm run stop`                                                  |
| Tail live logs                       | `npm run logs`                                                  |
| Check service status                 | `orb run -m aisquad -u root systemctl status openclaw-sentinel` |

---

## Configuration

### `config.json` (required, gitignored)

Located at `/home/filipefernandes/sentinel/config.json` on the VM. Template: `config.example.json`.

```json
{
  "token": "YOUR_BOT_TOKEN",
  "clientId": "YOUR_APPLICATION_ID",
  "guildId": "YOUR_SERVER_ID"
}
```

All three fields are required. Missing `config.json` crashes the process at startup before any Discord connection is made.

`config.json` is explicitly included in the rsync sync step — it is **not** auto-generated.

### Environment Variables (`sentinel.env` on VM)

| Variable                  | Required                | Default               | Purpose                                                                                      |
| ------------------------- | ----------------------- | --------------------- | -------------------------------------------------------------------------------------------- |
| `OPENCLAW_GATEWAY_TOKEN`  | Yes (for WS)            | `''`                  | Auth token for OpenClaw Gateway WebSocket RPC. Empty = WS disabled entirely, HTTP-only mode. |
| `OPENCLAW_HOOKS_TOKEN`    | Yes (for HTTP fallback) | `''`                  | Bearer token for `POST /hooks/agent`. Empty = HTTP fallback unavailable.                     |
| `OPENCLAW_GATEWAY_PORT`   | No                      | `18789`               | Port for both WS and HTTP connections to OpenClaw.                                           |
| `OPENCLAW_DISCORD_BOT_ID` | No                      | `1475916909647233208` | Corven bot's Discord user ID, used for message deduplication.                                |

> **Important:** `OPENCLAW_GATEWAY_TOKEN` and `OPENCLAW_HOOKS_TOKEN` must be **different** values. OpenClaw enforces this at its own startup.

### Env File Location on VM

```bash
# Edit from macOS via orb
orb -m aisquad -u root vim /etc/openclaw/sentinel.env

# Then restart the service
npm run restart
```

---

## Deployment

### Full Deploy

Builds TypeScript, rsyncs to VM, restarts service, and shows last 15 log lines:

```bash
npm start
# or from monorepo root:
make sentinel-deploy
```

Steps performed by `deploy.sh`:

1. `npm run build` — `rm -rf dist && tsc` (compiles `src/` → `dist/`)
2. `rsync -az --delete` — syncs `dist/`, `node_modules/`, `config.json`, `package.json` to `aisquad@orb:/home/filipefernandes/sentinel/`
3. `systemctl restart openclaw-sentinel` on VM
4. Waits 3 seconds, prints last 15 journal lines

### Sync Only (no restart)

Use when you need to push files without bouncing the service:

```bash
./deploy.sh sync
```

### Register Slash Commands

Must be run after any change to command definitions, options, subcommands, or `activeAgents`:

```bash
npm run deploy
# or from monorepo root:
make sentinel-commands
```

This runs `node dist/deploy-commands.js` on the VM (not locally). Commands are guild-scoped — they propagate instantly. The build must be synced first.

---

## Service Management

The service runs under systemd on the OrbStack VM `aisquad`. Unit name: **`openclaw-sentinel`**.

```bash
# Status
orb run -m aisquad -u root systemctl status openclaw-sentinel

# Restart
npm run restart
# or:
orb run -m aisquad -u root systemctl restart openclaw-sentinel

# Stop
npm run stop
# or:
orb run -m aisquad -u root systemctl stop openclaw-sentinel
```

---

## Logs

```bash
# Tail live logs (npm shortcut)
npm run logs

# Last 50 lines, no follow
orb run -m aisquad -u root journalctl -u openclaw-sentinel --no-pager -n 50

# Follow live
orb run -m aisquad -u root journalctl -u openclaw-sentinel -f
```

### Log Prefixes

| Prefix            | Meaning                                                               |
| ----------------- | --------------------------------------------------------------------- |
| `[INIT]`          | Startup: command loading, WS connect result                           |
| `[READY]`         | Discord client ready, bot tag, guild count                            |
| `[COMMAND]`       | Every slash command invocation (`user.tag used /command in #channel`) |
| `[COMMAND] Error` | Command execution errors                                              |
| `[OPENCLAW-WS]`   | WS lifecycle: connect, disconnect, reconnect, timeout                 |
| `[OPENCLAW]`      | Agent trigger result (RPC or HTTP)                                    |
| `[THREAD]`        | Thread creation, agent bot resolution                                 |
| `[AUDIT]`         | Every `logAction()` call (also written to `#audit-log`)               |
| `[SETUP]`         | Step-by-step setup progress                                           |
| `[UPDATE]`        | Reconciliation steps                                                  |
| `[DEDUPE]`        | Corven duplicate message deduplication events                         |

---

## Health Check

There is no HTTP health endpoint. To verify the bot is alive:

```bash
# Check systemd status
orb run -m aisquad -u root systemctl status openclaw-sentinel

# Tail logs and look for [READY] on last restart
npm run logs
```

From inside Discord, run `/status` in any channel — returns bot tag, uptime, WS ping, server name, role count, channel count. No permission required.

---

## OpenClaw Integration

Sentinel connects to the OpenClaw gateway running at `ws://127.0.0.1:18789` (same VM, loopback).

### Connection Behaviour

- Connects on startup; failure is non-fatal — bot continues in HTTP-only mode
- Auto-reconnects on disconnect with exponential backoff: 1s → 2s → 4s … 30s max
- Handshake: server sends challenge nonce → sentinel sends `connect` request with `role: 'operator'`, `scopes: ['operator.write']`, and `OPENCLAW_GATEWAY_TOKEN`
- All in-flight RPC calls are rejected immediately on disconnect

### Agent Trigger (Dual-Path)

When a session command fires:

1. **Primary — WebSocket RPC:** calls `request('agent', { message, agentId, sessionKey, channel: 'discord', to: 'channel:<threadId>', deliver: true })`. 30s timeout.
2. **Fallback — HTTP POST:** `POST http://127.0.0.1:18789/hooks/agent` with `Authorization: Bearer OPENCLAW_HOOKS_TOKEN`. Used when WS is disconnected or RPC fails.

The thread is always created regardless of whether the trigger succeeds. If both paths fail, the agent simply won't auto-respond in the thread.

### Checking WS Status

```bash
# Look for [OPENCLAW-WS] lines in logs
npm run logs

# Or use /status in Discord — WS ping reflects Discord gateway RTT (not OpenClaw)
```

---

## Common Operations

### After Adding or Changing Slash Commands

```bash
npm start          # rebuild + sync + restart
npm run deploy     # re-register commands with Discord
```

### After Changing Only Bot Logic (No Command Definition Changes)

```bash
npm start          # rebuild + sync + restart (no need to re-register)
```

### After Changing Only `sentinel.env` on VM

```bash
npm run restart    # pick up new env vars (no rebuild needed)
```

### Re-run Server Setup

```bash
# From Discord:
/setup full          # full idempotent bootstrap
/setup full clean:True   # delete extras first, then rebuild
/setup update        # reconcile only (no deletions)
/setup verify        # read-only drift detection report
```

---

## Troubleshooting

### Bot not responding to commands

```bash
# 1. Check service is running
orb run -m aisquad -u root systemctl status openclaw-sentinel

# 2. Check logs for errors
npm run logs

# 3. If crashed, restart
npm run restart

# 4. If commands are missing from Discord UI
npm run deploy     # re-register with Discord API
```

### Commands not appearing in Discord

Commands are guild-scoped. Check:

- `guildId` in `config.json` matches the target server
- `deploy.sh commands` was run after any command definition change
- The build was synced to VM before registering: `npm start` then `npm run deploy`

### Agent not responding in thread

```bash
# Check OpenClaw WS status in logs
npm run logs
# Look for [OPENCLAW-WS] connect/disconnect and [OPENCLAW] trigger lines

# If OPENCLAW_GATEWAY_TOKEN is empty, WS is disabled — check sentinel.env
orb -m aisquad -u root cat /etc/openclaw/sentinel.env

# Verify OpenClaw gateway is reachable
orb run -m aisquad -u root curl -s http://127.0.0.1:18789/health
```

### Thread creation failing ("Channel #X not found")

The target channel doesn't exist. Run `/setup full` from Discord to create the server structure, then retry the session command.

### `config.json` missing after VM rebuild

```bash
# Sync config.json to VM
./deploy.sh sync

# Or full deploy
npm start
```

### Corven posting duplicate messages

The deduplication handler in `events/message-create.ts` uses a 30-second window. If duplicates persist beyond that window, check the `OPENCLAW_DISCORD_BOT_ID` env var matches Corven's actual Discord user ID.

### Bot permissions error during `/setup full`

The `Setup Bot` role needs Administrator for initial setup. If the role has already been demoted and you need to run `/setup full` again on a fresh server, temporarily restore Administrator to the bot role via Discord Server Settings → Roles.
