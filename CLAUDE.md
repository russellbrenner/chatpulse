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

## Deploying to k3s

### Architecture overview

```
Two repos, two roles:

chatpulse/k8s/          — TEMPLATE manifests (placeholders, public)
homelab/k8s/chatpulse/  — PRODUCTION manifests (real values, private) + deploy.sh
```

The `k8s/` directory in **this repo** contains template manifests with `REGISTRY` and `chatpulse.example.com` placeholders. The homelab repo (`~/git/homelab/k8s/chatpulse/`) contains production manifests with actual values and a deploy script. When changing k8s architecture (adding resources, changing probes, updating limits), **update both repos** — templates here, production values in homelab.

### Quick deploy (after code changes)

```bash
# Full deploy: build, import, apply
~/git/homelab/k8s/chatpulse/deploy.sh

# Or individual steps:
~/git/homelab/k8s/chatpulse/deploy.sh --build-only    # just rebuild images
~/git/homelab/k8s/chatpulse/deploy.sh --import-only   # just import to k3s
~/git/homelab/k8s/chatpulse/deploy.sh --apply-only    # just apply manifests + restart
```

### Image build pipeline

The k3s cluster uses pre-imported images (no registry pull at deploy time):

1. **Build** Docker images locally with `--platform linux/amd64`
2. **Save** to tar: `docker save image:tag > image.tar`
3. **Transfer** to k3s nodes: scp to Proxmox hosts, `pct push` into LXC containers
4. **Import** into containerd: `k3s ctr images import image.tar`

**Images must be imported to ALL k3s nodes.** Pods can schedule on any node — if an image is only on one node and the pod lands on the other, you get `ImagePullBackOff`. The deploy script handles this automatically.

### Build quirk: esbuild on Apple Silicon

esbuild crashes under QEMU amd64 emulation on Apple Silicon Macs. The deploy script works around this by:

1. Building `dist/` locally (native arm64): `cd services/web && npm run build`
2. Creating a production-only amd64 image that just copies the pre-built dist:
   ```dockerfile
   FROM node:20-slim
   WORKDIR /app
   COPY package*.json ./
   RUN npm ci --omit=dev
   COPY dist/ dist/
   EXPOSE 3000
   CMD ["node", "dist/server/index.js"]
   ```

On x86 machines, the standard multi-stage `docker build --platform linux/amd64` works fine.

### Resource sizing

The web service requires **2Gi memory limit** because the upload endpoint buffers the entire chat.db file in memory. A typical Apple Messages database is 500-700 MB. With the default 512Mi limit, the container gets OOMKilled during upload (exit code 137). The extraction service is fine at 1Gi.

The Ingress needs `traefik.ingress.kubernetes.io/buffering-maxrequestbodybytes: "1073741824"` to allow 1 GB uploads — without this annotation, Traefik rejects the upload before it reaches the web service.

### PVC access mode

The PVC uses `ReadWriteOnce` because the `local-path` provisioner does not support `ReadWriteMany`. This means both web and extraction pods must schedule on the same node. If you switch to a network-backed StorageClass (NFS, Longhorn, etc.), you can change to `ReadWriteMany` and run pods on different nodes.

### Database

PostgreSQL database `chatpulse` (user `chatpulse`) on the homelab PostgreSQL cluster. Schema is managed via `migrations/`. The `DATABASE_URL` is injected as a k8s Secret.

### Secret setup (one-time)

The `chatpulse-secrets` k8s Secret must exist with a `DATABASE_URL` key. Created outside of version control:

```bash
kubectl -n chatpulse create secret generic chatpulse-secrets \
  --from-literal=DATABASE_URL='postgresql://user:pass@db-host:5432/chatpulse'
```

### TLS

TLS is automated via cert-manager with a `letsencrypt-prod` ClusterIssuer (ACME + Cloudflare DNS-01). The Ingress annotation `cert-manager.io/cluster-issuer: letsencrypt-prod` triggers automatic certificate creation and renewal. Certs are stored as k8s Secrets and picked up by Traefik automatically.

### Apple Messages attributedBody decoding

Modern macOS (post-High Sierra) stores message text in the `attributedBody` column as an NSKeyedArchiver/typedstream blob, not in the `text` column. The extraction service's `db.py` handles this transparently — it queries both columns and falls back to decoding the typedstream blob when `text` is null. The decoder handles variable-length encoding (short, 2-byte, and 4-byte length prefixes) and different NSString marker byte variants.

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
