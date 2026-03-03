SHELL := /bin/bash

AUTO_VM := $(shell orb list 2>/dev/null | sed -n '1s/[[:space:]].*//p')
VM ?= $(if $(AUTO_VM),$(AUTO_VM),openclaw-vm)
ORB ?= orb -m $(VM)
ORB_ROOT ?= orb -m $(VM) -u root
OPENCLAW_DIR ?= /home/filipefernandes/openclaw
STATE_DIR ?= /home/filipefernandes/.openclaw
BACKUP_DIR ?= ./backups
RESTORE_DIR ?= /tmp/openclaw-restore-test

.DEFAULT_GOAL := help

.PHONY: help
help:
	@printf "\nOpenClaw VM Operations (OrbStack Linux Machine)\n"
	@printf "================================================\n\n"
	@printf "VM Lifecycle\n"
	@printf "  make vm-start              Start the VM\n"
	@printf "  make vm-stop               Stop the VM\n"
	@printf "  make vm-restart            Restart the VM\n"
	@printf "  make vm-info               Show VM info\n"
	@printf "  make vm-ssh                Open SSH session to VM\n\n"
	@printf "Service Lifecycle\n"
	@printf "  make up                    Start gateway + sentinel services\n"
	@printf "  make down                  Stop gateway + sentinel services\n"
	@printf "  make restart               Restart gateway service\n"
	@printf "  make restart-sentinel      Restart sentinel service\n"
	@printf "  make restart-all           Restart all services\n"
	@printf "  make ps                    Show service status\n"
	@printf "  make logs                  Tail gateway logs\n"
	@printf "  make logs-sentinel         Tail sentinel logs\n"
	@printf "  make logs-all              Tail all OpenClaw logs\n\n"
	@printf "Update & Build\n"
	@printf "  make pull                  Git pull latest and rebuild\n"
	@printf "  make build                 Rebuild OpenClaw from source\n\n"
	@printf "Health & Security\n"
	@printf "  make status                OpenClaw status --all\n"
	@printf "  make health                OpenClaw health --json\n"
	@printf "  make doctor                OpenClaw doctor\n"
	@printf "  make audit                 OpenClaw security audit --deep\n"
	@printf "  make verify-local          Verify gateway HTTP from inside VM\n\n"
	@printf "UI & Auth\n"
	@printf "  make dashboard-url         Print tokenized Control UI URL\n"
	@printf "  make devices-list          List pairing requests/devices\n"
	@printf "  make devices-approve REQUEST_ID=<id>\n"
	@printf "                            Approve pairing request\n"
	@printf "  make devices-revoke DEVICE_ID=<id>\n"
	@printf "                            Revoke paired device\n"
	@printf "  make token-copy            Copy gateway token to macOS clipboard\n"
	@printf "  make token-sync            Sync config token from env\n\n"
	@printf "Multi-Agent\n"
	@printf "  make agents-list           List agents\n"
	@printf "  make agents-list-bindings  List agents with bindings\n"
	@printf "  make agent-add AGENT_ID=<id> [WORKSPACE=...] [MODEL=...] [BINDS=ch:acct,...]\n"
	@printf "                            Add a new isolated agent\n"
	@printf "  make agent-bind AGENT_ID=<id> BINDS=ch:acct[,ch:acct]\n"
	@printf "                            Add routing bindings\n"
	@printf "  make agent-unbind AGENT_ID=<id> BINDS=ch:acct[,ch:acct]\n"
	@printf "                            Remove selected bindings\n"
	@printf "  make agent-unbind-all AGENT_ID=<id>\n"
	@printf "                            Remove all bindings for agent\n"
	@printf "  make agent-delete AGENT_ID=<id>\n"
	@printf "                            Delete an agent and its state/workspace\n"
	@printf "  make agent-identity AGENT_ID=<id> [NAME=...] [THEME=...] [EMOJI=...] [AVATAR=...]\n"
	@printf "                            Set agent identity fields\n\n"
	@printf "Backup & Restore\n"
	@printf "  make backup                Create state backup archive\n"
	@printf "  make restore-latest        Validate restore using latest archive\n"
	@printf "  make restore ARCHIVE=<file>\n"
	@printf "                            Validate restore for specified archive\n\n"
	@printf "Maintenance\n"
	@printf "  make monthly               Pull, rebuild, restart, status, doctor, audit, health\n"
	@printf "  make full-check            ps, status, health, audit, verify-local\n\n"
	@printf "Variables (override if needed):\n"
	@printf "  VM=%s\n" "$(VM)"
	@printf "  OPENCLAW_DIR=%s\n\n" "$(OPENCLAW_DIR)"

# ─── VM Lifecycle ────────────────────────────────────────────────────────────

.PHONY: vm-start
vm-start:
	@orb start $(VM)
	@echo "VM $(VM) started"

.PHONY: vm-stop
vm-stop:
	@orb stop $(VM)
	@echo "VM $(VM) stopped"

.PHONY: vm-restart
vm-restart:
	@orb restart $(VM)
	@echo "VM $(VM) restarted"

.PHONY: vm-info
vm-info:
	@orb info $(VM)

.PHONY: vm-ssh
vm-ssh:
	@orb -m $(VM) bash

# ─── Service Lifecycle ───────────────────────────────────────────────────────

.PHONY: up
up:
	@$(ORB_ROOT) systemctl start openclaw-gateway openclaw-sentinel
	@echo "Services started"

.PHONY: down
down:
	@$(ORB_ROOT) systemctl stop openclaw-gateway openclaw-sentinel
	@echo "Services stopped"

.PHONY: restart
restart:
	@$(ORB_ROOT) systemctl restart openclaw-gateway
	@echo "Gateway restarted"

.PHONY: restart-sentinel
restart-sentinel:
	@$(ORB_ROOT) systemctl restart openclaw-sentinel
	@echo "Sentinel restarted"

.PHONY: restart-all
restart-all:
	@$(ORB_ROOT) systemctl restart openclaw-gateway openclaw-sentinel
	@echo "All services restarted"

.PHONY: ps
ps:
	@$(ORB) systemctl status openclaw-gateway openclaw-sentinel --no-pager 2>/dev/null || true

.PHONY: logs
logs:
	@$(ORB_ROOT) journalctl -u openclaw-gateway --no-pager -n 200

.PHONY: logs-sentinel
logs-sentinel:
	@$(ORB_ROOT) journalctl -u openclaw-sentinel --no-pager -n 200

.PHONY: logs-all
logs-all:
	@$(ORB_ROOT) journalctl -u 'openclaw-*' --no-pager -n 200

# ─── Update & Build ─────────────────────────────────────────────────────────

.PHONY: pull
pull:
	@echo "Pulling latest OpenClaw..."
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && git pull origin main'
	@echo "Installing dependencies..."
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && pnpm install --frozen-lockfile'
	@echo "Building..."
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && pnpm run build'
	@echo "Pull and build complete. Run 'make restart' to apply."

.PHONY: build
build:
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && pnpm run build'
	@echo "Build complete. Run 'make restart' to apply."

# ─── Health & Security ───────────────────────────────────────────────────────

.PHONY: status
status:
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && node dist/index.js status --all'

.PHONY: health
health:
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && node dist/index.js health --json'

.PHONY: doctor
doctor:
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && node dist/index.js doctor'

.PHONY: audit
audit:
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && node dist/index.js security audit --deep'

.PHONY: verify-local
verify-local:
	@$(ORB) ss -tlnp | grep 18789 || echo "Port 18789 not listening"
	@$(ORB) curl -sS -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:18789/ || true

# ─── UI & Auth ───────────────────────────────────────────────────────────────

.PHONY: dashboard-url
dashboard-url:
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && node dist/index.js dashboard --no-open'

.PHONY: devices-list
devices-list:
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && node dist/index.js devices list'

.PHONY: devices-approve
devices-approve:
	@if [ -z "$(REQUEST_ID)" ]; then \
		echo "Usage: make devices-approve REQUEST_ID=<request-id>" >&2; \
		exit 1; \
	fi
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && node dist/index.js devices approve "$(REQUEST_ID)"'

.PHONY: devices-revoke
devices-revoke:
	@if [ -z "$(DEVICE_ID)" ]; then \
		echo "Usage: make devices-revoke DEVICE_ID=<device-id>" >&2; \
		exit 1; \
	fi
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && node dist/index.js devices revoke "$(DEVICE_ID)"'

.PHONY: token-copy
token-copy:
	@$(ORB_ROOT) bash -c 'grep "^OPENCLAW_GATEWAY_TOKEN=" /etc/openclaw/openclaw.env | cut -d= -f2-' | tr -d '\n' | pbcopy
	@echo "Gateway token copied to clipboard."

.PHONY: token-sync
token-sync:
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && node -e "const fs=require(\"fs\");const p=\"$(STATE_DIR)/openclaw.json\";const c=JSON.parse(fs.readFileSync(p,\"utf8\"));c.gateway=c.gateway||{};c.gateway.auth=c.gateway.auth||{};c.gateway.auth.mode=\"token\";c.gateway.auth.token=process.env.OPENCLAW_GATEWAY_TOKEN;fs.writeFileSync(p,JSON.stringify(c,null,2)+\"\\n\");console.log(\"gateway token synced\")"'

# ─── Multi-Agent ─────────────────────────────────────────────────────────────

.PHONY: agents-list
agents-list:
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && node dist/index.js agents list'

.PHONY: agents-list-bindings
agents-list-bindings:
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && node dist/index.js agents list --bindings'

.PHONY: agent-add
agent-add:
	@if [ -z "$(AGENT_ID)" ]; then \
		echo "Usage: make agent-add AGENT_ID=<id> [WORKSPACE=...] [MODEL=...] [BINDS=ch:acct,...]" >&2; \
		exit 1; \
	fi
	@VM="$(VM)" WORKSPACE="$(WORKSPACE)" MODEL="$(MODEL)" BINDS="$(BINDS)" NON_INTERACTIVE=1 ./scripts/agent_add.sh "$(AGENT_ID)"

.PHONY: agent-bind
agent-bind:
	@if [ -z "$(AGENT_ID)" ] || [ -z "$(BINDS)" ]; then \
		echo "Usage: make agent-bind AGENT_ID=<id> BINDS=channel:account[,channel:account]" >&2; \
		exit 1; \
	fi
	@bash -lc 'set -euo pipefail; cmd=(orb -m "$(VM)" bash -c "cd $(OPENCLAW_DIR) && node dist/index.js agents bind --agent $(AGENT_ID)"); IFS="," read -r -a binds <<< "$(BINDS)"; bind_args=""; for bind in "$${binds[@]}"; do [ -n "$$bind" ] && bind_args+=" --bind $$bind"; done; orb -m "$(VM)" bash -c "cd $(OPENCLAW_DIR) && node dist/index.js agents bind --agent $(AGENT_ID) $$bind_args"'

.PHONY: agent-unbind
agent-unbind:
	@if [ -z "$(AGENT_ID)" ] || [ -z "$(BINDS)" ]; then \
		echo "Usage: make agent-unbind AGENT_ID=<id> BINDS=channel:account[,channel:account]" >&2; \
		exit 1; \
	fi
	@bash -lc 'set -euo pipefail; IFS="," read -r -a binds <<< "$(BINDS)"; bind_args=""; for bind in "$${binds[@]}"; do [ -n "$$bind" ] && bind_args+=" --bind $$bind"; done; orb -m "$(VM)" bash -c "cd $(OPENCLAW_DIR) && node dist/index.js agents unbind --agent $(AGENT_ID) $$bind_args"'

.PHONY: agent-unbind-all
agent-unbind-all:
	@if [ -z "$(AGENT_ID)" ]; then \
		echo "Usage: make agent-unbind-all AGENT_ID=<id>" >&2; \
		exit 1; \
	fi
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && node dist/index.js agents unbind --agent "$(AGENT_ID)" --all'

.PHONY: agent-delete
agent-delete:
	@if [ -z "$(AGENT_ID)" ]; then \
		echo "Usage: make agent-delete AGENT_ID=<id>" >&2; \
		exit 1; \
	fi
	@$(ORB) bash -c 'cd $(OPENCLAW_DIR) && node dist/index.js agents delete "$(AGENT_ID)"'

.PHONY: agent-identity
agent-identity:
	@if [ -z "$(AGENT_ID)" ]; then \
		echo "Usage: make agent-identity AGENT_ID=<id> [NAME=...] [THEME=...] [EMOJI=...] [AVATAR=...]" >&2; \
		exit 1; \
	fi
	@bash -lc 'set -euo pipefail; args="--agent $(AGENT_ID)"; [ -n "$(NAME)" ] && args+=" --name \"$(NAME)\""; [ -n "$(THEME)" ] && args+=" --theme \"$(THEME)\""; [ -n "$(EMOJI)" ] && args+=" --emoji \"$(EMOJI)\""; [ -n "$(AVATAR)" ] && args+=" --avatar \"$(AVATAR)\""; orb -m "$(VM)" bash -c "cd $(OPENCLAW_DIR) && node dist/index.js agents set-identity $$args"'

# ─── Backup & Restore ───────────────────────────────────────────────────────

.PHONY: backup
backup:
	@./scripts/backup_openclaw.sh "$(BACKUP_DIR)"

.PHONY: restore-latest
restore-latest:
	@LATEST="$$(ls -t $(BACKUP_DIR)/openclaw-state-*.tar.gz 2>/dev/null | head -n 1)"; \
	if [ -z "$$LATEST" ]; then \
		echo "No backup archives found in $(BACKUP_DIR)" >&2; \
		exit 1; \
	fi; \
	./scripts/restore_verify_openclaw.sh "$$LATEST" "$(RESTORE_DIR)"

.PHONY: restore
restore:
	@if [ -z "$(ARCHIVE)" ]; then \
		echo "Usage: make restore ARCHIVE=<backup-archive.tar.gz>" >&2; \
		exit 1; \
	fi
	@./scripts/restore_verify_openclaw.sh "$(ARCHIVE)" "$(RESTORE_DIR)"

# ─── Maintenance ─────────────────────────────────────────────────────────────

.PHONY: monthly
monthly: pull restart ps status doctor audit health
	@echo "Monthly maintenance sequence complete."

.PHONY: full-check
full-check: ps status health audit verify-local
	@echo "Full verification complete."
