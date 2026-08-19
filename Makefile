SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help
.NOTPARALLEL: deploy

REPO_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
OPENCLAW_PLUGIN_SPEC ?= @openclaw/codex
OPENCLAW_CONFIG_PATCH := $(REPO_ROOT)/config/openclaw.patch.json5
COMPOSE_FILE := $(REPO_ROOT)/compose.yaml
RUNTIME_ENV_FILE := $(REPO_ROOT)/.env
AI_SDLC_PLUGIN_DIR := $(REPO_ROOT)/plugins/ai-sdlc
CODEX_AGENT_SOURCE := $(REPO_ROOT)/codex/agents
OPENCLAW_WORKSPACE_SOURCE := $(REPO_ROOT)/openclaw/workspace
CODEX_HOME_DIR ?= $(HOME)/.codex
OPENCLAW_HOME_DIR ?= $(HOME)/.openclaw
OPENCLAW_WORKSPACE_DIR ?= $(OPENCLAW_HOME_DIR)/workspace
FORCE ?= 0

export PATH := $(HOME)/.local/bin:$(HOME)/.npm-global/bin:$(HOME)/.openclaw/bin:$(PATH)

.PHONY: help status install-tools install-openclaw install-codex \
	install-openclaw-plugin install-codex-agents install-openclaw-workspace \
	prepare-runtime data-up data-down data-logs migrate-data validate-data \
	install-ai-sdlc-deps build-ai-sdlc-plugin install-ai-sdlc-plugin \
	sync-openclaw-env configure-openclaw install-daemon start-daemon deploy \
	validate-package validate-runtime validate

help:
	@echo "AI SDLC runtime bundle"
	@echo
	@echo "  make status                    Inspect tool, auth, plugin, and config state"
	@echo "  make install-tools             Install OpenClaw/Codex only when missing"
	@echo "  make install-openclaw-plugin   Install official @openclaw/codex plugin"
	@echo "  make data-up                  Start PostgreSQL and Qdrant containers"
	@echo "  make data-down                Stop containers without deleting volumes"
	@echo "  make data-logs                Follow PostgreSQL and Qdrant logs"
	@echo "  make migrate-data             Apply idempotent PostgreSQL migrations"
	@echo "  make install-ai-sdlc-plugin   Build and link the packaged AI-SDLC plugin"
	@echo "  make install-codex-agents      Sync packaged agents into $(CODEX_HOME_DIR)/agents"
	@echo "  make configure-openclaw        Merge packaged config into global OpenClaw"
	@echo "  make install-daemon            Install the OpenClaw Gateway user service"
	@echo "  make deploy                    Full install, global config, daemon, validation"
	@echo "  make validate                  Validate package and deployed runtime"
	@echo
	@echo "Conflicting managed files stop by default. Use FORCE=1 to back up and replace."

status:
	@$(REPO_ROOT)/scripts/status.sh

install-tools: install-openclaw install-codex

install-openclaw:
	@if command -v openclaw >/dev/null 2>&1; then \
		echo "OpenClaw already installed: $$(openclaw --version)"; \
	else \
		echo "Installing OpenClaw with the official installer..."; \
		curl -fsSL https://openclaw.ai/install.sh | bash -s -- --no-onboard; \
		command -v openclaw >/dev/null 2>&1 || { echo "OpenClaw installed but is not on PATH" >&2; exit 1; }; \
	fi

install-codex:
	@if command -v codex >/dev/null 2>&1; then \
		echo "Codex already installed: $$(codex --version)"; \
	else \
		echo "Installing Codex with the official installer..."; \
		curl -fsSL https://chatgpt.com/codex/install.sh | sh; \
		command -v codex >/dev/null 2>&1 || { echo "Codex installed but is not on PATH" >&2; exit 1; }; \
	fi

install-openclaw-plugin: install-openclaw
	@if openclaw plugins inspect codex >/dev/null 2>&1; then \
		echo "OpenClaw Codex plugin already installed; skipping."; \
	else \
		echo "Installing $(OPENCLAW_PLUGIN_SPEC)..."; \
		openclaw plugins install "$(OPENCLAW_PLUGIN_SPEC)"; \
	fi
	@openclaw plugins inspect codex >/dev/null

prepare-runtime:
	@$(REPO_ROOT)/scripts/prepare-runtime-env.sh "$(REPO_ROOT)"
	@docker compose --project-directory "$(REPO_ROOT)" --env-file "$(RUNTIME_ENV_FILE)" -f "$(COMPOSE_FILE)" config --quiet

data-up: prepare-runtime
	@docker compose --project-directory "$(REPO_ROOT)" --env-file "$(RUNTIME_ENV_FILE)" -f "$(COMPOSE_FILE)" up -d --wait postgres qdrant

data-down:
	@docker compose --project-directory "$(REPO_ROOT)" --env-file "$(RUNTIME_ENV_FILE)" -f "$(COMPOSE_FILE)" down

data-logs:
	@docker compose --project-directory "$(REPO_ROOT)" --env-file "$(RUNTIME_ENV_FILE)" -f "$(COMPOSE_FILE)" logs --follow postgres qdrant

migrate-data: data-up
	@$(REPO_ROOT)/scripts/migrate-postgres.sh "$(REPO_ROOT)"

validate-data: migrate-data
	@$(REPO_ROOT)/scripts/validate-data-plane.sh "$(REPO_ROOT)"

install-ai-sdlc-deps:
	@npm --prefix "$(AI_SDLC_PLUGIN_DIR)" install --ignore-scripts

build-ai-sdlc-plugin: install-ai-sdlc-deps
	@npm --prefix "$(AI_SDLC_PLUGIN_DIR)" run plugin:build
	@npm --prefix "$(AI_SDLC_PLUGIN_DIR)" test
	@npm --prefix "$(AI_SDLC_PLUGIN_DIR)" run plugin:validate

install-ai-sdlc-plugin: install-openclaw build-ai-sdlc-plugin
	@$(REPO_ROOT)/scripts/ensure-openclaw-plugin-link.sh \
		ai-sdlc "$(AI_SDLC_PLUGIN_DIR)" "$(FORCE)"

sync-openclaw-env: prepare-runtime
	@$(REPO_ROOT)/scripts/sync-openclaw-env.sh "$(RUNTIME_ENV_FILE)" "$(OPENCLAW_HOME_DIR)/.env"

install-codex-agents: install-codex
	@AI_SDLC_FORCE="$(FORCE)" $(REPO_ROOT)/scripts/sync-managed-files.sh \
		"$(CODEX_AGENT_SOURCE)" "$(CODEX_HOME_DIR)/agents" "Codex agents"

install-openclaw-workspace: install-openclaw
	@AI_SDLC_FORCE="$(FORCE)" $(REPO_ROOT)/scripts/sync-managed-files.sh \
		"$(OPENCLAW_WORKSPACE_SOURCE)" "$(OPENCLAW_WORKSPACE_DIR)" "OpenClaw workspace"

configure-openclaw: install-openclaw-plugin install-ai-sdlc-plugin install-openclaw-workspace sync-openclaw-env
	@$(REPO_ROOT)/scripts/apply-openclaw-config.sh "$(OPENCLAW_CONFIG_PATCH)"

install-daemon: configure-openclaw
	@if openclaw daemon status --json 2>/dev/null | grep -Eq '"loaded"[[:space:]]*:[[:space:]]*true'; then \
		echo "OpenClaw Gateway service already installed; skipping."; \
	else \
		openclaw daemon install; \
	fi

start-daemon: install-daemon
	@openclaw daemon restart

deploy: install-tools install-codex-agents validate-data configure-openclaw start-daemon validate

validate-package: build-ai-sdlc-plugin
	@python3 $(REPO_ROOT)/scripts/validate-codex-agents.py "$(CODEX_AGENT_SOURCE)"

validate-runtime: validate-package
	@command -v openclaw >/dev/null
	@command -v codex >/dev/null
	@codex login status
	@openclaw config validate
	@openclaw plugins inspect codex >/dev/null
	@openclaw plugins inspect ai-sdlc --runtime >/dev/null
	@openclaw plugins doctor
	@openclaw daemon status

validate: validate-data validate-runtime
