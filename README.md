# ChatPulse

Explore, back up, and visually analyse your Apple Messages (iMessage) database through a web interface.

## Features

- **Message Explorer** — Browse conversations, search messages, view threads
- **Visual Analytics** — Interactive Plotly.js charts: messaging patterns, frequency heatmaps, top contacts, response times, reaction breakdowns
- **Message Archive** — Automatic backup and permanent archival of messages into PostgreSQL, independent of iCloud storage
- **Upload Workflow** — Upload a chat.db file via the web interface for instant analysis

## Architecture

ChatPulse is a hybrid microservice with two backend components:

| Service | Stack | Port | Role |
|---------|-------|------|------|
| **Web** | Node.js Fastify + React | 3000 | API gateway, frontend, file upload |
| **Extraction** | Python FastAPI | 8001 | SQLite reader, analytics engine |

The web service proxies analysis requests to the extraction service. A daily CronJob ingests new messages from chat.db into PostgreSQL for permanent archival.

```
macOS LaunchAgent (WatchPaths)
  └─ sqlite3 .backup ─→ SMB share ─→ NFS mount
                                        │
k3s cluster:                            ▼
  CronJob (daily) ─→ ingest ─→ PostgreSQL
  Extraction (FastAPI) ←── proxy ←── Web (Fastify) ←── Browser
```

## Quick Start

### Prerequisites

- macOS with **Full Disk Access** for your terminal (to read `~/Library/Messages/chat.db`)
- Python 3.12+
- Node.js 20+

### Run Locally

```bash
# 1. Start the extraction service
cd services/extraction
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn chatpulse_extraction.main:app --port 8001

# 2. Start the web service (in another terminal)
cd services/web
npm install
npm run dev
```

Open http://localhost:5173 (Vite dev server) — API requests proxy to the Fastify server on port 3000.

### Test the API

```bash
# Health checks
curl http://localhost:8001/health
curl http://localhost:3000/api/health

# Top contacts (direct)
curl "http://localhost:8001/analysis/top-contacts?db_path=$HOME/Library/Messages/chat.db&limit=5"

# Top contacts (via proxy)
curl "http://localhost:3000/api/analysis/top-contacts?db_path=$HOME/Library/Messages/chat.db&limit=5"
```

### Run Tests

```bash
# Python tests (27 tests)
cd services/extraction && source .venv/bin/activate && pytest

# Node.js build check
cd services/web && npm run build
```

## Deployment

ChatPulse runs as containerised services on k3s. See `k8s/` for plain YAML manifests (no Helm/Kustomize).

```bash
# Build Docker images
docker build -t chatpulse-extraction services/extraction
docker build -t chatpulse-web services/web

# Apply k8s manifests (after populating secrets and NFS PV)
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/
```

Infrastructure-specific values (database URL, NFS server, registry) are injected via k8s Secrets — never committed to the repo.

## Database Schema

PostgreSQL schema mirrors chat.db structure using `original_rowid` as primary keys (no SERIAL auto-increment). Migrations managed by [node-pg-migrate](https://github.com/salsita/node-pg-migrate).

```bash
cd migrations && npm install
export DATABASE_URL="postgresql://user:password@host:5432/chatpulse"
npm run migrate
```

## Security

This is a public repository. Automated scanning prevents accidental commits of infrastructure details (IPs, hostnames, credentials) at three levels:

1. **Pre-commit hook** — blocks locally before commit
2. **GitHub Actions** — scans on every push and PR
3. **Claude Code hook** — scans during AI-assisted development

See `scripts/infra-scan.sh` for the pattern list.

## Attribution

Inspired by [imessage-analysis](https://github.com/yortos/imessage-analysis) by Yorgos Askalidis. Analysis concepts adapted with credit under CC BY-NC 4.0.

## Licence

MIT
