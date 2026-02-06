# ChatPulse - Claude Code Instructions

## Project Overview

ChatPulse is a web application for exploring, backing up, and visually analysing Apple Messages (iMessage) databases. It provides a web frontend for browsing message threads, generating statistics, and producing visual breakdowns of messaging patterns.

## Tech Stack

- **API Gateway + Frontend:** Node.js Fastify + React (Vite) — `services/web/`
- **Extraction + Analysis:** Python FastAPI — `services/extraction/`
- **Database:** PostgreSQL (permanent archive), SQLite (read-only source `chat.db`)
- **Visualisation:** Plotly.js (interactive charts)
- **Deployment:** Docker containers on k3s (Traefik ingress, cert-manager TLS)
- **CI/CD:** Gitea Actions (primary), GitHub Actions (secondary)
- **Container Registry:** Gitea OCI (self-hosted) or `ghcr.io` — configured via CI/CD secrets

## Architecture

```
macOS LaunchAgent (WatchPaths)
  └─ sqlite3 .backup ─→ SMB share ─→ NFS mount
                                        │
k3s cluster:                            ▼
  CronJob (daily) ─→ ingest.ts ─→ PostgreSQL
  Extraction (FastAPI :8001) ←─ proxy ←─ Web (Fastify :3000) ←─ Browser
```

- **Web service** proxies `/api/analysis/*` and `/api/extract/*` to the extraction service
- **Extraction service** reads chat.db directly via SQLite (read-only)
- **Ingest CronJob** reads chat.db from NFS, upserts into PostgreSQL with timestamp watermarking

## Development Guidelines

- Australian English for all user-facing text and documentation
- Use Mermaid for diagrams in markdown files
- Follow existing k3s deployment patterns from `~/git/homelab/k8s/`
- Plain YAML manifests for Kubernetes resources (no Helm/Kustomize)

## Running Locally

```bash
# Extraction service (Python)
cd services/extraction
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn chatpulse_extraction.main:app --port 8001

# Web service (Node.js) — in another terminal
cd services/web
npm install
npm run dev    # dev mode: tsx watch + vite dev server
npm run build  # production build: tsc + tsc-alias + vite
npm start      # run production build
```

## Database Access

The macOS Messages database is located at:
```
~/Library/Messages/chat.db
```

Accessing it requires **Full Disk Access** permission for the terminal application. The database is SQLite and should be opened in **read-only mode** to avoid corruption.

## Schema

PostgreSQL uses `original_rowid INTEGER PRIMARY KEY` — preserving the chat.db ROWID as the primary key. No SERIAL auto-increment. Foreign keys reference `original_rowid` directly. See `migrations/001_initial-schema.sql` for full schema.

## Build Pipeline

```bash
# Web service build (3 steps):
tsc -p tsconfig.server.json      # Compile TypeScript
tsc-alias -p tsconfig.server.json # Rewrite @server/* path aliases
vite build                         # Bundle React frontend
```

Key notes:
- `tsc-alias` is required to rewrite `@server/*` path aliases to relative imports in compiled JS
- `pino-pretty` is a devDependency (only loaded when `NODE_ENV !== 'production'`)
- `tsconfig.server.json` rootDir is `src` (includes both `src/server/` and `src/ingest.ts`)

## Attribution

This project draws inspiration from [yortos/imessage-analysis](https://github.com/yortos/imessage-analysis) by Yorgos Askalidis, licensed under CC BY-NC 4.0. Any reused analysis logic is credited accordingly.

## Git Conventions

All commits by Claude must include:
```
Co-Authored-By: Claude <noreply@anthropic.com>
AI-Generated: true
```

## Secrets & Configuration

**Any local hostnames, network information (IP addresses, subnet CIDRs, VLAN IDs), credentials, share paths, or domain names whatsoever must NEVER be committed to this repo.** This is a public repository. All infrastructure-specific values are injected at runtime via:

- **k8s Secrets** — `DATABASE_URL`, NFS server/path (via PV)
- **GitHub Secrets** — CI/CD registry credentials, deployment targets
- **Gitea Secrets** — Same as above for Gitea Actions
- **macOS Keychain** — SMB credentials for the LaunchAgent

A pre-commit hook and GitHub Actions workflow scan for accidental leaks (see `.github/workflows/infra-scan.yaml`). Even example IPs in comments will be rejected — use `nfs.example.com` style placeholders instead. See PLAN.md § 8 for the full secrets table.

## Key Paths

| Path | Purpose |
|------|---------|
| `PLAN.md` | Architectural decisions and roadmap |
| `services/web/` | Node.js Fastify API gateway + React frontend |
| `services/extraction/` | Python FastAPI extraction + analysis service |
| `services/web/src/ingest.ts` | CronJob CLI entry point |
| `migrations/` | PostgreSQL schema (node-pg-migrate) |
| `k8s/` | Kubernetes manifests (namespace, deployments, services, ingress, PVC, CronJob) |
| `launchd/` | macOS LaunchAgent for chat.db backup |
| `scripts/infra-scan.sh` | Infrastructure leak scanner |
| `.github/workflows/` | GitHub Actions CI (lint, test, infra-scan) |
| `.gitea/workflows/` | Gitea Actions (Docker build + push) |
