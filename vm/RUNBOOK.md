# OpenClaw VM Runbook

> OpenClaw gateway and Sentinel run as native systemd services inside the OrbStack VM `aisquad` (Ubuntu 25.10, arm64). No Docker involved for these services. Optional telemetry collector runs as a separate Docker container.

## Quick Reference

| Action                 | Command                 |
| ---------------------- | ----------------------- |
| Start all services     | `make up`               |
| Stop all services      | `make down`             |
| Restart gateway        | `make restart`          |
| Restart sentinel       | `make restart-sentinel` |
| Restart everything     | `make restart-all`      |
| Service status         | `make ps`               |
| Gateway logs           | `make logs`             |
| Sentinel logs          | `make logs-sentinel`    |
| All logs               | `make logs-all`         |
| Health check           | `make health`           |
| Full diagnostics       | `make full-check`       |
| Monthly maintenance    | `make monthly`          |
| Backup state           | `make backup`           |
| Validate latest backup | `make restore-latest`   |

---

## Architecture

Two systemd units run inside the VM as the `filipefernandes` user (non-root):

| Unit                        | Command                                              | Working Directory                | Env File                     |
| --------------------------- | ---------------------------------------------------- | -------------------------------- | ---------------------------- |
| `openclaw-gateway.service`  | `node dist/index.js gateway --bind lan --port 18789` | `/home/filipefernandes/openclaw` | `/etc/openclaw/openclaw.env` |
| `openclaw-sentinel.service` | `node dist/index.js`                                 | `/home/filipefernandes/sentinel` | `/etc/openclaw/sentinel.env` |

**Resource limits:**

| Service  | MemoryMax | CPUQuota | TasksMax |
| -------- | --------- | -------- | -------- |
| Gateway  | 2G        | 200%     | 256      |
| Sentinel | 512M      | 100%     | 64       |

**systemd hardening (both units):** `NoNewPrivileges=true`, `ProtectSystem=strict`, `ProtectKernelTunables=true`, `ProtectKernelModules=true`, `ProtectControlGroups=true`, `PrivateTmp=true`

**Network endpoint:** `aisquad.orb.local:18789` (LAN-only, not externally exposed)

---

## VM Lifecycle

```bash
make vm-start      # orb start aisquad
make vm-stop       # orb stop aisquad (stops all services)
make vm-restart    # orb restart aisquad
make vm-info       # orb info aisquad (IP, disk, resource usage)
make vm-ssh        # orb -m aisquad bash
```

---

## Service Lifecycle

```bash
make up                # systemctl start openclaw-gateway openclaw-sentinel
make down              # systemctl stop openclaw-gateway openclaw-sentinel
make restart           # systemctl restart openclaw-gateway
make restart-sentinel  # systemctl restart openclaw-sentinel
make restart-all       # systemctl restart openclaw-gateway openclaw-sentinel
make ps                # systemctl status openclaw-gateway openclaw-sentinel
make logs              # journalctl -u openclaw-gateway --no-pager -n 200
make logs-sentinel     # journalctl -u openclaw-sentinel --no-pager -n 200
make logs-all          # journalctl -u 'openclaw-*' --no-pager -n 200
```

---

## Build and Update

```bash
make pull    # git pull origin main + pnpm install --frozen-lockfile + pnpm run build
make build   # pnpm run build only (no pull, uses existing source)
```

> **Neither `pull` nor `build` auto-restarts services.** Run `make restart` or `make restart-all` after building.

Standard update flow:

```bash
make pull
make restart-all
make ps
```

---

## Health and Diagnostics

```bash
make health        # node dist/index.js health --json
                   # Expected: JSON with "ok": true

make status        # node dist/index.js status --all

make doctor        # node dist/index.js doctor

make audit         # node dist/index.js security audit --deep
                   # Expected: 0 critical findings

make verify-local  # (1) ss -tlnp | grep 18789 — port must appear
                   # (2) curl http://127.0.0.1:18789/ — expected HTTP 200
```

### Telemetry collector (OTLP/HTTP)

Tier 1 diagnostics export expects an OTLP/HTTP listener on `127.0.0.1:4318`.

Required OpenClaw config in `/home/filipefernandes/.openclaw/openclaw.json`:

- `diagnostics.enabled: true`
- `diagnostics.otel.enabled: true`
- `diagnostics.otel.endpoint: "http://127.0.0.1:4318"`
- `plugins.entries["diagnostics-otel"].enabled: true` (bundled, but disabled by default unless explicitly enabled)

Current VM deployment:

- Container: `otel-collector`
- Image: `otel/opentelemetry-collector:0.123.0`
- Config: `/home/filipefernandes/openclaw/ops/otel-collector-config.yaml`
- Port: `0.0.0.0:4318 -> 4318/tcp`

Verification:

```bash
orb -m aisquad bash -lc 'docker ps --format "{{.Names}} {{.Status}} {{.Ports}}"'
orb -m aisquad bash -lc 'curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4318/'
```

Expected: collector container is `Up` and endpoint responds (typically `404` at root path is OK; listener is reachable).

### Composite checks

```bash
make full-check    # ps → status → health → audit → verify-local

make monthly       # pull → restart → ps → status → doctor → audit → health
```

---

## Auth and UI

```bash
make token-copy                        # Copies OPENCLAW_GATEWAY_TOKEN to macOS clipboard
make token-sync                        # Writes token from env file into ~/.openclaw/openclaw.json
make dashboard-url                     # Prints tokenized Control UI URL (no browser launch)
make devices-list                      # node dist/index.js devices list
make devices-approve REQUEST_ID=<id>   # node dist/index.js devices approve "<id>"
make devices-revoke DEVICE_ID=<id>     # node dist/index.js devices revoke "<id>"
make codex-auth-sync                   # Sync ~/.codex/auth.json from Mac to VM (see below)
```

> **`token-copy` vs `token-sync`:** `token-copy` puts the token on the clipboard for browser use. `token-sync` writes the token from the env file into `~/.openclaw/openclaw.json` — required when the two diverge (e.g. after rotating the token in the env file).

### Codex OAuth credentials

The `openai-codex` model provider authenticates via OAuth rather than an API key. Credentials are stored by the Codex CLI in `~/.codex/auth.json` on the macOS host. The gateway on the VM reads the same file from `~/.codex/auth.json` inside the VM.

Because the Codex CLI only runs on macOS, every time it refreshes the OAuth token the VM copy goes stale, causing `refresh_token_reused` errors in the gateway logs and model failures for any agent using `openai-codex/*` models.

**Sync the credentials manually:**

```bash
make codex-auth-sync
```

The script:
1. Reads `~/.codex/auth.json` on the Mac
2. Compares the refresh token with what is on the VM
3. Skips silently if they are already identical
4. Copies the file to the VM via `orb push` if they differ
5. Verifies the copy landed correctly
6. Restarts the gateway to pick up the new credentials

**`make monthly` runs this automatically** as part of the routine maintenance sequence.

---

## Agent Management

```bash
make agents-list
make agents-list-bindings

# Add agent (WORKSPACE defaults to ~/.openclaw/workspace-<AGENT_ID>)
make agent-add AGENT_ID=work
make agent-add AGENT_ID=coding WORKSPACE=coding MODEL="openai/gpt-4o" BINDS="discord:coding,telegram:ops"

# Bindings — BINDS is comma-separated channel:account pairs
make agent-bind AGENT_ID=coding BINDS="discord:coding,telegram:ops"
make agent-unbind AGENT_ID=coding BINDS="discord:coding"
make agent-unbind-all AGENT_ID=coding

make agent-delete AGENT_ID=coding

# Identity — all params optional: NAME, THEME, EMOJI, AVATAR
make agent-identity AGENT_ID=coding NAME="Coding" THEME="dark" EMOJI="robot" AVATAR="https://..."
```

`BINDS` format: `channel:account` pairs separated by commas, e.g. `discord:coding,telegram:ops`. Each pair becomes a `--bind` flag on the underlying `node dist/index.js agents` command.

---

## Backup and Restore

### Create a backup

```bash
make backup
# Saves: vm/backups/openclaw-state-YYYYMMDD-HHMMSS.tar.gz
```

What the backup contains:

- Full tar of `/home/filipefernandes/.openclaw/` (state, config, agents, sessions)
- Git snapshot commits in any `workspace*` directories that have uncommitted changes

### Validate a backup

```bash
make restore-latest                                              # validates most recent archive
make restore ARCHIVE=backups/openclaw-state-20260303-114045.tar.gz
```

The restore script extracts the archive to `/tmp/openclaw-restore-test/` on the macOS host and checks:

1. `openclaw.json` exists
2. `agents/` directory exists
3. At least one `agents/*/sessions/sessions.json` exists

> This is a **local validation only** — it does not perform a live restore into the VM.

---

## Environment Variables

Located at `/etc/openclaw/openclaw.env` inside the VM. `chmod 600`, owned by `filipefernandes`. Template: `vm/.env.example`.

| Variable                 | Purpose                                         | Default / Example              |
| ------------------------ | ----------------------------------------------- | ------------------------------ |
| `OPENCLAW_GATEWAY_TOKEN` | Auth token required for all gateway connections | 64-char URL-safe base64 string |
| `OPENCLAW_GATEWAY_BIND`  | Network bind mode                               | `lan`                          |
| `OPENCLAW_GATEWAY_PORT`  | Gateway listen port                             | `18789`                        |
| `HOME`                   | Home directory for state resolution             | `/home/filipefernandes`        |
| `TZ`                     | Timezone                                        | `America/Sao_Paulo`            |
| `OPENAI_API_KEY`         | OpenAI provider credential                      | optional                       |
| `ANTHROPIC_API_KEY`      | Anthropic provider credential                   | optional                       |
| `PERPLEXITY_API_KEY`     | Perplexity provider credential                  | optional                       |
| `GEMINI_API_KEY`         | Gemini provider credential                      | optional                       |
| `BRAVE_API_KEY`          | Brave Search credential                         | optional                       |
| `GH_TOKEN`               | GitHub token                                    | optional                       |
| `LINEAR_API_KEY`         | Linear API credential                           | optional                       |
| `DISCORD_BOT_TOKEN`      | Discord bot token (also used by sentinel)       | optional                       |

Edit env files from macOS:

```bash
orb -m aisquad -u root vim /etc/openclaw/openclaw.env
orb -m aisquad -u root vim /etc/openclaw/sentinel.env
# Then restart the affected service
make restart        # gateway
make restart-sentinel  # sentinel
```

---

## VM Internal Layout

| Path (inside VM)                                  | Purpose                                                      |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `/home/filipefernandes/openclaw/`                 | OpenClaw source repo (git clone, built with pnpm)            |
| `/home/filipefernandes/openclaw/dist/index.js`    | Built binary — all `node dist/index.js` commands target this |
| `/home/filipefernandes/.openclaw/`                | OpenClaw state directory                                     |
| `/home/filipefernandes/.openclaw/openclaw.json`   | Primary config (gateway auth, agent registry)                |
| `/home/filipefernandes/.openclaw/agents/`         | Per-agent state                                              |
| `/home/filipefernandes/.openclaw/workspace-<id>/` | Default agent workspace directories                          |
| `/home/filipefernandes/sentinel/`                 | Sentinel bot working directory                               |
| `/etc/openclaw/openclaw.env`                      | Gateway secrets and config — `chmod 600`                     |
| `/etc/openclaw/sentinel.env`                      | Sentinel secrets — `chmod 600`                               |
| `/etc/systemd/system/openclaw-gateway.service`    | Gateway systemd unit                                         |
| `/etc/systemd/system/openclaw-sentinel.service`   | Sentinel systemd unit                                        |

---

## Token Rotation

```bash
# 1. Generate a new token
python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# 2. Update the env file inside the VM
orb -m aisquad -u root vim /etc/openclaw/openclaw.env
# Set: OPENCLAW_GATEWAY_TOKEN=<new-token>

# 3. Sync config file to match env file
make token-sync

# 4. Restart the gateway
make restart

# 5. Verify
make verify-local
make health
```

---

## Emergency Lockout Response

Use when token leakage is suspected or repeated unauthorized access attempts occur.

```bash
# 1. Restart gateway to clear any temporary auth lockouts
make restart

# 2. List all paired/pending devices
make devices-list

# 3. Revoke untrusted devices
make devices-revoke DEVICE_ID=<id>

# 4. Rotate the token (full procedure above)

# 5. Re-approve known devices
make devices-approve REQUEST_ID=<id>

# 6. Verify clean state
make full-check
```

---

## Common Issues

### Gateway not listening after VM restart

Services are `systemctl enable`d and start automatically with the VM. If not:

```bash
make up
make verify-local
```

### Token mismatch

Symptom: UI can't connect; `make health` returns an auth error. The token in the env file and `~/.openclaw/openclaw.json` have diverged.

```bash
make token-sync
make restart
make verify-local
```

### Bonjour name conflicts

Repeated `[bonjour] gateway name conflict resolved` in gateway logs. Harmless — mDNS name negotiation. No action needed.

### Sentinel not starting

```bash
make logs-sentinel    # check for errors
make restart-sentinel
```

### openai-codex OAuth token stale (`refresh_token_reused`)

Symptom: Gateway logs show repeated `OAuth token refresh failed for openai-codex` with `refresh_token_reused`. Agents using `openai-codex/*` models fail with "All models failed".

Cause: The Codex CLI on macOS rotated the OAuth token, but the VM's `~/.codex/auth.json` was not updated.

```bash
make codex-auth-sync
```

This syncs the current token from `~/.codex/auth.json` on the Mac to the VM and restarts the gateway. If `~/.codex/auth.json` is missing on the Mac, sign in via the Codex CLI first.
