SHELL := /bin/bash

.DEFAULT_GOAL := help

.PHONY: help
help:
	@printf "\nSquadai Monorepo Commands\n"
	@printf "========================\n\n"
	@printf "Core\n"
	@printf "  make up                 Start VM + Mission Control\n"
	@printf "  make down               Stop Mission Control\n"
	@printf "  make status             Show VM and Mission Control status\n\n"
	@printf "Mission Control\n"
	@printf "  make mc-up              Start Mission Control stack\n"
	@printf "  make mc-up-openclaw     Start Mission Control with openclaw profile\n"
	@printf "  make mc-down            Stop Mission Control stack\n"
	@printf "  make mc-ps              Show Mission Control containers\n"
	@printf "  make mc-logs            Tail Mission Control logs\n\n"
	@printf "Sentinel\n"
	@printf "  make sentinel-deploy    Build + sync + restart sentinel\n"
	@printf "  make sentinel-commands  Register sentinel slash commands\n\n"
	@printf "VM\n"
	@printf "  make vm-up              Start OpenClaw + Sentinel services in VM\n"
	@printf "  make vm-down            Stop OpenClaw + Sentinel services in VM\n"
	@printf "  make vm-ps              Show VM service status\n\n"

.PHONY: up
up: vm-up mc-up

.PHONY: down
down: mc-down

.PHONY: status
status: vm-ps mc-ps

.PHONY: mc-up
mc-up:
	@docker compose -f mission-control/docker-compose.yml up -d

.PHONY: mc-up-openclaw
mc-up-openclaw:
	@docker compose -f mission-control/docker-compose.yml --profile openclaw up -d

.PHONY: mc-down
mc-down:
	@docker compose -f mission-control/docker-compose.yml down

.PHONY: mc-ps
mc-ps:
	@docker compose -f mission-control/docker-compose.yml ps

.PHONY: mc-logs
mc-logs:
	@docker compose -f mission-control/docker-compose.yml logs -f

.PHONY: sentinel-deploy
sentinel-deploy:
	@bash sentinel/deploy.sh

.PHONY: sentinel-commands
sentinel-commands:
	@bash sentinel/deploy.sh commands

.PHONY: vm-up
vm-up:
	@$(MAKE) -C vm up

.PHONY: vm-down
vm-down:
	@$(MAKE) -C vm down

.PHONY: vm-ps
vm-ps:
	@$(MAKE) -C vm ps
