# OpenClaw Operations Runbook

> Architecture: Native process inside OrbStack Linux VM (`aisquad`), managed by systemd.

## Quick Reference

| Action | Command |
|---|---|
| Service status | `make ps` |
| Gateway logs | `make logs` |
| Sentinel logs | `make logs-sentinel` |
| Restart gateway | `make restart` |
| Restart sentinel | `make restart-sentinel` |
| Backup | `make backup` |
| Restore latest | `make restore-latest` |
| Build from source | `make build` |
| Update + rebuild | `make pull` |
| SSH into VM | `make vm-ssh` |

## Monthly Maintenance Checklist

1. Pull latest source and rebuild.
2. Verify health and auth connectivity.
3. Run diagnostics and audit.
4. Confirm LAN-only exposure.
5. Create backup and test restore.

Commands:

```bash
make pull            # git pull + pnpm install + build + restart
make ps              # check service status
make verify-local    # run openclaw health, status, doctor
make backup          # create timestamped backup
make restore-latest  # restore and verify latest backup
```

Expected checks:
- `openclaw-gateway.service` is `active (running)`.
- `openclaw health --json` returns `"ok": true`.
- Security audit has `0 critical`.
- Port `18789` is listening inside the VM.
- Backup archive is created and restore validation passes.

## Token Rotation Procedure

1. Generate a new token.
2. Update the env file inside the VM.
3. Restart the gateway service.
4. Reconnect UI with the new tokenized URL.

Commands:

```bash
# Generate a new token
python3 -c "import secrets; print(secrets.token_urlsafe(48))"

# Edit the gateway env file inside the VM
orb -m aisquad sudo nano /etc/openclaw/openclaw.env
# Update OPENCLAW_GATEWAY_TOKEN=<new-token>

# Restart the gateway to pick up the new token
make restart

# Verify health
make verify-local
```

## Emergency Lockout Response

Use this when token leakage is suspected or there are repeated unauthorized attempts.

1. Restart gateway to clear temporary auth lockouts.
2. Rotate gateway token immediately (see above).
3. Remove untrusted paired devices.
4. Approve only known devices again.
5. Verify healthy state and audit output.

Commands:

```bash
make restart

# List and revoke devices
orb -m aisquad -- openclaw devices list
orb -m aisquad -- openclaw devices revoke <device-id>

# Perform token rotation steps above

# Verify
orb -m aisquad -- openclaw devices list
orb -m aisquad -- openclaw security audit --deep
orb -m aisquad -- openclaw health --json
```

## Service Management

Both services are managed by systemd inside the VM.

```bash
# Gateway
orb -m aisquad sudo systemctl status openclaw-gateway
orb -m aisquad sudo systemctl restart openclaw-gateway
orb -m aisquad sudo journalctl -u openclaw-gateway -f

# Sentinel
orb -m aisquad sudo systemctl status openclaw-sentinel
orb -m aisquad sudo systemctl restart openclaw-sentinel
orb -m aisquad sudo journalctl -u openclaw-sentinel -f
```

## Env File Locations (inside VM)

| File | Purpose |
|---|---|
| `/etc/openclaw/openclaw.env` | Gateway API keys, tokens, config |
| `/etc/openclaw/sentinel.env` | Sentinel bot tokens |

Both are `chmod 600` and owned by `filipefernandes`. Never commit these to git.

## VM Lifecycle

```bash
make vm-start       # Start the VM
make vm-stop        # Stop the VM (stops all services)
make vm-restart     # Restart the VM
make vm-info        # Show VM resource usage
make vm-ssh         # SSH into the VM
```
