# ChatPulse — Architecture Plan

## 1. Language & Framework

The core question: Node.js, Python, or hybrid?

### Backend

- [ ] **A) Node.js (Fastify)** — Fast, TypeScript-friendly, single language stack with frontend. Use `better-sqlite3` for chat.db access. Most natural fit for a web app with real-time features.
- [ ] **B) Node.js (Express)** — More ecosystem support and middleware, slightly heavier than Fastify. Same `better-sqlite3` approach.
- [ ] **C) Python (FastAPI) + Node frontend** — Leverage yortos' existing ETL/analysis code directly. Two runtimes to manage. FastAPI is async-capable and fast.
- [ ] **D) Hybrid microservice** — Python service for data extraction/analysis, Node.js service for web frontend and API gateway. More complex but cleanest separation. Two containers in k8s.

### Frontend

- [ ] **A) React + Vite** — Fast builds, large ecosystem, straightforward SPA. Pairs well with any backend.
- [ ] **B) Next.js** — SSR/SSG capabilities, API routes built-in (could eliminate separate backend for simple cases). Heavier.
- [ ] **C) SvelteKit** — Smaller bundle, less boilerplate, good DX. Smaller ecosystem.
- [ ] **D) Vue 3 + Vite** — Simpler mental model than React, good ecosystem. Less common in the Node.js analytics space.

---

## 2. Database Access Strategy

How to read macOS `chat.db` (`~/Library/Messages/chat.db`):

- [ ] **A) Direct read-only access** — Open chat.db directly with `SQLITE_OPEN_READONLY`. Simplest. Requires Full Disk Access. Only works on the Mac where Messages lives.
- [ ] **B) Copy-then-read** — Copy chat.db to a working directory, then operate on the copy. Safer (no risk of locking). Enables backup snapshots naturally.
- [ ] **C) Upload workflow** — User uploads/provides a chat.db file through the web UI. Works on any machine. Required for containerised deployment where the host DB isn't mounted.

> **Note:** For k3s deployment, option C is likely necessary since the container won't have access to the host's Messages database. For local development, A or B work fine. We should support both pathways.

---

## 3. Visualisation Library

- [ ] **A) Recharts** — React-native charting, declarative, good defaults. Limited customisation for complex visuals.
- [ ] **B) Chart.js (via react-chartjs-2)** — Mature, well-documented, good performance. Canvas-based.
- [ ] **C) D3.js** — Maximum flexibility and control. Steeper learning curve. Best for custom/novel visualisations.
- [ ] **D) Observable Plot** — D3 team's higher-level API. Simpler than raw D3, still powerful. Newer, smaller community.
- [ ] **E) Plotly.js** — Interactive charts out of the box, good for dashboards. Heavier bundle.

---

## 4. Analysis Features

Which analyses to implement (inspired by yortos/imessage-analysis):

### Phase 1 — Core
- [ ] Message count per contact/group (total, sent, received)
- [ ] Messages over time (daily/weekly/monthly histograms)
- [ ] Top contacts by volume
- [ ] Average response time per contact
- [ ] Busiest hours/days of week heatmap

### Phase 2 — Enriched
- [ ] Reaction analysis (tapbacks per contact, most reacted messages)
- [ ] Message effects usage (slam, loud, gentle, etc.)
- [ ] Link sharing patterns
- [ ] Group chat dynamics (who talks most, conversation starters)
- [ ] Emoji/word frequency analysis

### Phase 3 — Advanced
- [ ] Sentiment analysis (basic, using a lightweight NLP library)
- [ ] Conversation topic clustering
- [ ] Relationship activity trends over time
- [ ] Export reports (PDF/PNG)

---

## 5. Python Code Reuse Strategy

The [yortos/imessage-analysis](https://github.com/yortos/imessage-analysis) repo (CC BY-NC 4.0) contains useful ETL logic and SQL queries for extracting data from chat.db.

- [ ] **A) Port to JavaScript/TypeScript** — Translate the SQL queries and transformation logic. Credit the author. Single runtime. Most maintainable long-term.
- [ ] **B) Wrap as Python microservice** — Run yortos' code (or adapted version) as a FastAPI service alongside the Node app. Two containers. More complex deployment.
- [ ] **C) One-time extraction script** — Use Python to dump processed data to JSON/CSV, then load into the Node app. Simple but doesn't support live/updated analysis.
- [ ] **D) Don't reuse** — Write extraction logic from scratch based on the chat.db schema. More work but no licence concerns and tailored to our needs.

> **Licence note:** CC BY-NC 4.0 requires attribution and prohibits commercial use. Since ChatPulse is MIT-licensed and non-commercial, attribution is sufficient. If commercialisation is ever considered, option D avoids the constraint.

---

## 6. Backup Strategy

- [ ] **A) SQLite snapshot** — Copy the entire chat.db file with timestamp. Simple, complete, but large (~1-4 GB for heavy users).
- [ ] **B) Incremental export** — Track last-seen message ROWID, export only new messages to JSON/CSV. Smaller, but requires state tracking.
- [ ] **C) Both** — Full snapshots on demand, incremental exports on schedule.

---

## 7. Containerisation & Deployment

### Container Build
- [ ] **A) Single-stage Dockerfile** — Simple, larger image.
- [ ] **B) Multi-stage Dockerfile** — Build stage (compile TypeScript, bundle frontend) + production stage (slim Node runtime). Smaller image.

### CI/CD
- [ ] **A) Gitea Actions only** — Build and push to `git.itsa.house/rbrenner/chatpulse`. Matches existing homelab patterns.
- [ ] **B) Gitea Actions + GitHub Actions** — Gitea for deployment builds, GitHub for CI checks on PRs.
- [ ] **C) GitHub Actions only** — Push to `ghcr.io/russellbrenner/chatpulse`. Simpler if not self-hosting registry.

### k3s Deployment
- Plain YAML manifests in `k8s/` directory
- Traefik Ingress with cert-manager TLS
- OPNsense Relayd annotations for VIP allocation
- ConfigMap for app settings, Secret for any credentials
- PersistentVolumeClaim for uploaded/backed-up databases

---

## 8. Message Archival & Sync Pipeline

The primary motivation: permanently archive all iMessages before setting macOS message expiry to 365 days. Tens of thousands of messages slow down all Apple devices; pruning them from iCloud while retaining a searchable archive in PostgreSQL solves this.

### Architecture

```
Mac (launchd plist, daily)
  │
  │  sqlite3 ~/Library/Messages/chat.db
  │    ".backup ~/mnt/smb/users/chatpulse/chat.db"
  │
  ▼
fileshare1 (10.0.50.11)
  SMB: //fileshare1/users/chatpulse/chat.db
  NFS: exported to 10.0.4.0/23 (k3s VLAN)
  │
  ▼
k3s CronJob (chatpulse-ingest)
  │  Mount fileshare1 via NFS
  │  Read chat.db
  │  Extract messages WHERE ROWID > last_ingested
  │  Insert into PostgreSQL (CT 112, 10.0.6.112)
  │  Update watermark
  │  Keep .db file as file-level backup
  │
  ▼
PostgreSQL (CT 112 primary)
  Permanent, queryable message archive
  Serves ChatPulse web UI analytics
```

### Mac-side Sync Job

- [ ] **A) launchd plist** — Native macOS scheduler. Runs `sqlite3 .backup` to SMB share. Simple, reliable, no dependencies.
- [ ] **B) cron job** — Works but launchd is preferred on macOS (handles sleep/wake, power management).

> **Safety note:** `sqlite3 .backup` uses SQLite's online backup API — safe to run while Messages.app is using the database. Do NOT use `cp` directly as this risks WAL corruption.

### k3s Ingest Job

- [ ] **A) CronJob (dedicated container)** — Lightweight image with `better-sqlite3` and `pg` client. Runs on schedule (e.g. daily, 1 hour after Mac sync). Mounts fileshare1 NFS.
- [ ] **B) ChatPulse app endpoint** — The main ChatPulse web app exposes an `/api/ingest` endpoint. A k3s CronJob curls it to trigger processing. Simpler image but couples ingest to app availability.

### Database Backend

- [ ] **A) PostgreSQL (CT 112)** — Already running in the homelab on VLAN 6 (10.0.6.112). Streaming replication to CT 223 standby. Production-grade, supports full-text search.
- [ ] **B) SQLite (in-app)** — Simpler, no external dependency, but less suitable for a web app with concurrent access and long-term archival.

### Watermark / Deduplication Strategy

- [ ] **A) ROWID tracking** — Store the highest ingested ROWID. Simple, works for append-only data. Misses edits/deletes (rare in Messages).
- [ ] **B) Timestamp-based** — Use `message.date` column. Handles out-of-order delivery. Slightly more complex.
- [ ] **C) Hash-based dedup** — Hash each message row, skip if already ingested. Most robust but slower.

### File Retention on fileshare1

- [ ] **A) Keep latest only** — Overwrite `chat.db` each sync. Minimal storage. File-level backup is just "latest snapshot".
- [ ] **B) Rolling copies** — Keep timestamped copies (e.g. `chat-2026-02-03.db`). Uses more storage but provides point-in-time recovery. Prune after N days.
- [ ] **C) Keep latest + weekly snapshots** — Overwrite daily, but keep one copy per week for 12 weeks. Balance of storage and recovery.

### Future Enhancement: API Push

> As a v2 improvement, the Mac-side job could also POST new messages directly to the ChatPulse API over HTTPS (via Traefik ingress), enabling near-real-time ingest without waiting for the CronJob schedule. The SMB copy would remain as a backup safety net.

---

## 9. Project Structure (Proposed)

```
chatpulse/
├── CLAUDE.md
├── README.md
├── PLAN.md
├── Dockerfile                  # Web app container
├── Dockerfile.ingest           # Ingest job container
├── package.json
├── tsconfig.json
├── src/
│   ├── server/                 # Backend API
│   │   ├── index.ts
│   │   ├── routes/
│   │   ├── services/
│   │   │   ├── db.ts           # SQLite access layer
│   │   │   ├── extraction.ts   # ETL from chat.db
│   │   │   ├── analysis.ts     # Statistical analysis
│   │   │   └── backup.ts       # Backup management
│   │   └── types/
│   ├── ingest/                 # Ingest CronJob entry point
│   │   ├── index.ts            # Read chat.db → PostgreSQL
│   │   └── watermark.ts        # Track last-ingested ROWID
│   └── client/                 # Frontend
│       ├── index.html
│       ├── App.tsx
│       ├── components/
│       │   ├── Explorer/       # Message browser
│       │   ├── Analytics/      # Charts and stats
│       │   └── Backup/         # Backup management UI
│       └── lib/
├── k8s/
│   ├── namespace.yaml
│   ├── deployment.yaml         # Web app
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── pvc.yaml
│   └── cronjob-ingest.yaml    # Ingest CronJob (NFS mount + PostgreSQL)
├── launchd/
│   └── com.chatpulse.sync.plist  # macOS LaunchAgent for sqlite3 backup to SMB
└── .gitea/
    └── workflows/
        └── build.yaml
```

---

## Decisions Log

| # | Decision | Choice | Date | Rationale |
|---|----------|--------|------|-----------|
| — | — | — | — | Awaiting selection |
