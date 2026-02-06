# ChatPulse — Architecture Plan

## 1. Language & Framework

The core question: Node.js, Python, or hybrid?

### Backend

- [ ] **A) Node.js (Fastify)** — Fast, TypeScript-friendly, single language stack with frontend. Use `better-sqlite3` for chat.db access. Most natural fit for a web app with real-time features.
- [ ] **B) Node.js (Express)** — More ecosystem support and middleware, slightly heavier than Fastify. Same `better-sqlite3` approach.
- [ ] **C) Python (FastAPI) + Node frontend** — Leverage yortos' existing ETL/analysis code directly. Two runtimes to manage. FastAPI is async-capable and fast.
- [x] **D) Hybrid microservice** — Python service for data extraction/analysis, Node.js service for web frontend and API gateway. More complex but cleanest separation. Two containers in k8s.
- [ ] **E) Bun (Fastify or Hono)** — Modern JavaScript runtime, 3-4x faster than Node.js, drop-in replacement with native TypeScript support. Use `bun:sqlite` for database access. Single binary, simpler deployment.
- [ ] **F) Deno (Fresh or Oak)** — Secure-by-default runtime with built-in TypeScript. Requires explicit permissions (filesystem, network). Good for security-conscious deployments. Smaller ecosystem than Node.js.

### Frontend

- [x] **A) React + Vite** — Fast builds, large ecosystem, straightforward SPA. Pairs well with any backend.
- [ ] **B) Next.js** — SSR/SSG capabilities, API routes built-in (could eliminate separate backend for simple cases). Heavier.
- [ ] **C) SvelteKit** — Smaller bundle, less boilerplate, good DX. Smaller ecosystem.
- [ ] **D) Vue 3 + Vite** — Simpler mental model than React, good ecosystem. Less common in the Node.js analytics space.
- [ ] **E) Solid.js + Vite** — Reactive performance similar to Svelte but with JSX syntax like React. Fine-grained reactivity without VDOM overhead. Smaller but growing ecosystem.

---

## 2. Database Access Strategy

How to read macOS `chat.db` (`~/Library/Messages/chat.db`):

- [ ] **A) Direct read-only access** — Open chat.db directly with `SQLITE_OPEN_READONLY`. Simplest. Requires Full Disk Access. Only works on the Mac where Messages lives.
- [ ] **B) Copy-then-read** — Copy chat.db to a working directory, then operate on the copy. Safer (no risk of locking). Enables backup snapshots naturally.
- [x] **C) Upload workflow** — User uploads/provides a chat.db file through the web UI. Works on any machine. Required for containerised deployment where the host DB isn't mounted.

> **Note:** For k3s deployment, option C is likely necessary since the container won't have access to the host's Messages database. For local development, A or B work fine. We should support both pathways.

---

## 3. Visualisation Library

- [ ] **A) Recharts** — React-native charting, declarative, good defaults. Limited customisation for complex visuals.
- [ ] **B) Chart.js (via react-chartjs-2)** — Mature, well-documented, good performance. Canvas-based.
- [ ] **C) D3.js** — Maximum flexibility and control. Steeper learning curve. Best for custom/novel visualisations.
- [ ] **D) Observable Plot** — D3 team's higher-level API. Simpler than raw D3, still powerful. Newer, smaller community.
- [x] **E) Plotly.js** — Interactive charts out of the box, good for dashboards. Heavier bundle.

---

## 4. Analysis Features

Which analyses to implement (inspired by yortos/imessage-analysis):

### Phase 1 — Core
- [x] Message count per contact/group (total, sent, received)
- [x] Messages over time (daily/weekly/monthly histograms)
- [x] Top contacts by volume
- [x] Average response time per contact
- [x] Busiest hours/days of week heatmap

### Phase 2 — Enriched
- [x] Reaction analysis (tapbacks per contact, most reacted messages)
- [x] Message effects usage (slam, loud, gentle, etc.)
- [x] Link sharing patterns
- [x] Group chat dynamics (who talks most, conversation starters)
- [x] Emoji/word frequency analysis

### Phase 3 — Advanced
- [x] Sentiment analysis (basic, using a lightweight NLP library)
- [x] Conversation topic clustering
- [x] Relationship activity trends over time
- [x] Export reports (PDF/PNG)

---

## 5. Python Code Reuse Strategy

The [yortos/imessage-analysis](https://github.com/yortos/imessage-analysis) repo (CC BY-NC 4.0) contains useful ETL logic and SQL queries for extracting data from chat.db.

- [ ] **A) Port to JavaScript/TypeScript** — Translate the SQL queries and transformation logic. Credit the author. Single runtime. Most maintainable long-term.
- [ ] **B) Wrap as Python microservice** — Run yortos' code (or adapted version) as a FastAPI service alongside the Node app. Two containers. More complex deployment.
- [ ] **C) One-time extraction script** — Use Python to dump processed data to JSON/CSV, then load into the Node app. Simple but doesn't support live/updated analysis.
- [x] **D) Don't reuse** — Write extraction logic from scratch based on the chat.db schema. More work but no licence concerns and tailored to our needs.

> **Note:** If yortos' code is used even as a reference during implementation, attribute the author in README.md.

> **Licence note:** CC BY-NC 4.0 requires attribution and prohibits commercial use. Since ChatPulse is MIT-licensed and non-commercial, attribution is sufficient. If commercialisation is ever considered, option D avoids the constraint.

---

## 6. Backup Strategy

- [ ] **A) SQLite snapshot** — Copy the entire chat.db file with timestamp. Simple, complete, but large (~1-4 GB for heavy users).
- [ ] **B) Incremental export** — Track last-seen message ROWID, export only new messages to JSON/CSV. Smaller, but requires state tracking.
- [x] **C) Both** — Full snapshots on demand, incremental exports on schedule.

> **Implementation:** LaunchAgent plist runs `sqlite3 .backup` to SMB share, triggered by `WatchPaths` on `~/Library/Messages/chat.db` with `ThrottleInterval` to avoid excessive runs. See `launchd/com.chatpulse.sync.plist`.

---

## 7. Containerisation & Deployment

### Container Build
- [ ] **A) Single-stage Dockerfile** — Simple, larger image.
- [x] **B) Multi-stage Dockerfile** — Build stage (compile TypeScript, bundle frontend) + production stage (slim Node runtime). Smaller image.
- [ ] **C) Multi-stage with Alpine** — Same as B but use `node:20-alpine` for production stage. Even smaller (~40MB vs ~180MB for slim). May require native module compilation.
- [ ] **D) Distroless** — Google's distroless Node.js base image. Minimal attack surface (no shell, package manager). Best security posture but harder to debug.

### CI/CD
- [ ] **A) Gitea Actions only** — Build and push to self-hosted Gitea OCI registry. Matches existing homelab patterns.
- [x] **B) Gitea Actions + GitHub Actions** — Gitea for deployment builds, GitHub for CI checks on PRs.
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

> **Implementation:** LaunchAgent watches `~/Library/Messages/chat.db` for changes and runs `sqlite3 .backup` to the SMB share. Throttled to avoid excessive runs during active conversations.

### Architecture

Infrastructure-specific details (IPs, share paths, hostnames) are kept out of this repo. Connection strings and mount paths are injected via environment variables and Kubernetes Secrets, populated from CI/CD secrets (GitHub Secrets / Gitea Secrets).

```
Mac (launchd plist, WatchPaths + ThrottleInterval)
  │
  │  sqlite3 ~/Library/Messages/chat.db
  │    ".backup $CHATPULSE_SMB_MOUNT/chat.db"
  │
  ▼
NAS file server (SMB share)
  SMB: //$NAS_HOST/$NAS_SHARE/chatpulse/chat.db
  NFS: exported to k3s VLAN
  │
  ▼
k3s CronJob (chatpulse-ingest)
  │  Mount NAS via NFS (server + path from Secret)
  │  Read chat.db
  │  Extract messages WHERE ROWID > last_ingested
  │  Insert into PostgreSQL ($DATABASE_URL from Secret)
  │  Update watermark
  │  Keep .db file as file-level backup
  │
  ▼
PostgreSQL
  Permanent, queryable message archive
  Serves ChatPulse web UI analytics
```

### Required Secrets

| Secret Key | Description | Used By |
|------------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Ingest job, web app |
| `NFS_SERVER` | NAS IP address for NFS mount | k8s CronJob volume |
| `NFS_PATH` | NFS export path | k8s CronJob volume |
| `NAS_SMB_HOST` | NAS hostname/IP for SMB | macOS LaunchAgent |
| `NAS_SMB_SHARE` | SMB share name | macOS LaunchAgent |
| `NAS_SMB_USER` | SMB username | macOS LaunchAgent |

### Mac-side Sync Job

- [x] **A) launchd plist** — Native macOS scheduler. Runs `sqlite3 .backup` to SMB share. Uses `WatchPaths` on chat.db with `ThrottleInterval`. Checks SMB mount is available before running (graceful skip if off-network).
- [ ] **B) cron job** — Works but launchd is preferred on macOS (handles sleep/wake, power management).

> **Safety note:** `sqlite3 .backup` uses SQLite's online backup API — safe to run while Messages.app is using the database. Do NOT use `cp` directly as this risks WAL corruption.

### k3s Ingest Job

- [x] **A) CronJob (dedicated container)** — Lightweight image with `better-sqlite3` and `pg` client. Runs on schedule (e.g. daily, 1 hour after Mac sync or when the file changes). Mounts NAS via NFS (storage pool already available to the node so use that)
- [ ] **B) ChatPulse app endpoint** — The main ChatPulse web app exposes an `/api/ingest` endpoint. A k3s CronJob curls it to trigger processing. Simpler image but couples ingest to app availability.

### Database Backend

- [x] **A) PostgreSQL** — Existing homelab instance with streaming replication. Production-grade, supports full-text search. Connection via `DATABASE_URL` secret.
- [ ] **B) SQLite (in-app)** — Simpler, no external dependency, but less suitable for a web app with concurrent access and long-term archival.
- [ ] **C) SQLite with migration path** — Start with SQLite for MVP. WAL mode handles concurrent reads well. Migrate to PostgreSQL if scaling needs arise. Use an ORM/query builder (Prisma, Drizzle) to ease future migration.

### Watermark / Deduplication Strategy

- [ ] **A) ROWID tracking** — Store the highest ingested ROWID. Simple, works for append-only data. Misses edits/deletes (rare in Messages).
- [x] **B) Timestamp-based** — Use `message.date` column. Handles out-of-order delivery. Slightly more complex.
- [ ] **C) Hash-based dedup** — Hash each message row, skip if already ingested. Most robust but slower.

### File Retention on NAS

- [ ] **A) Keep latest only** — Overwrite `chat.db` each sync. Minimal storage. File-level backup is just "latest snapshot".
- [ ] **B) Rolling copies** — Keep timestamped copies (e.g. `chat-2026-02-03.db`). Uses more storage but provides point-in-time recovery. Prune after N days.
- [x] **C) Keep latest + weekly snapshots** — Overwrite daily, but keep one copy per week for 12 weeks. Balance of storage and recovery.

### Future Enhancement: API Push

> As a v2 improvement, the Mac-side job could also POST new messages directly to the ChatPulse API over HTTPS (via Traefik ingress), enabling near-real-time ingest without waiting for the CronJob schedule. The SMB copy would remain as a backup safety net.

---

## 9. Authentication & Authorization

- [ ] **A) None (localhost-only)** — App binds to 127.0.0.1, accessible only from the local machine. Simplest for personal use. No auth overhead.
- [x] **B) Basic Auth (Traefik middleware)** — Single username/password at the ingress level. Simple, but shared credential and no user-specific permissions.
- [ ] **C) OAuth2 / OIDC** — Integrate with existing identity provider (Google, GitHub, self-hosted Authelia/Keycloak). Enterprise-grade but complex setup.
- [ ] **D) Client Certificate (mTLS)** — Certificate-based authentication at Traefik ingress. Very secure, no password management, but requires PKI infrastructure.
- [ ] **E) Wireguard/Tailscale only** — Rely on network-level access control. App has no auth, but only accessible via VPN. Simple and secure for personal/homelab use.

> **Recommendation:** For personal homelab deployment, options A (dev) or E (production) are sufficient. For multi-user scenarios, consider C or D.

---

## 10. Error Handling & Logging

### Error Handling
- [ ] **A) Basic try/catch with console.error** — Minimal approach. Errors logged to stdout/stderr.
- [x] **B) Structured error responses** — Standardised error format with error codes, HTTP status codes, and user-friendly messages. Separate technical details from user-facing errors.
- [ ] **C) Error tracking service** — Integrate Sentry, Rollbar, or self-hosted error tracker. Captures stack traces, context, and frequency.

### Logging
- [ ] **A) Console logs (stdout/stderr)** — Default Node.js approach. Works with container logs (`kubectl logs`).
- [x] **B) Structured logging (Pino, Winston)** — JSON-formatted logs with correlation IDs, timestamps, severity levels. Easy to parse and aggregate.
- [ ] **C) Centralized logging** — Ship logs to Loki/Grafana, ELK stack, or similar. Enables search, alerting, and long-term retention.

> **Recommendation:** Start with B (structured logging) for both. Add C (centralized) as homelab monitoring evolves.

---

## 11. Testing Strategy

- [ ] **A) Manual testing only** — Simplest, suitable for personal projects. High risk of regressions.
- [x] **B) Unit tests (Vitest/Jest)** — Test business logic, data extraction, transformations. Fast feedback loop.
- [ ] **C) Integration tests** — Test API endpoints, database interactions. Slower but catches more issues.
- [ ] **D) E2E tests (Playwright)** — Test full user workflows in a browser. Most comprehensive but slowest.
- [ ] **E) Combination approach** — Unit tests for core logic, integration tests for API, E2E for critical paths. Balanced coverage.

### CI Testing
- [x] Run tests on every PR (GitHub Actions / Gitea Actions)
- [ ] Block merges if tests fail
- [ ] Generate coverage reports

> **Recommendation:** Start with B (unit tests for extraction/analysis logic). Add C (API integration tests) once backend is stable.

---

## 12. Performance & Scalability

### Expected Scale
- **Message volume:** 10K–1M+ messages (depending on chat.db size)
- **Concurrent users:** 1–5 (personal/family use)
- **Query patterns:** Read-heavy (analytics), occasional writes (backups, ingests)

### Performance Considerations
- [x] **Database indexing** — Index frequently queried fields (contact ID, date, thread ID)
- [ ] **Query optimization** — Use EXPLAIN to optimize complex analytics queries
- [ ] **Caching** — Cache expensive aggregations (daily stats, contact lists) with Redis or in-memory cache
- [x] **Pagination** — Limit result sets for message lists and threads
- [ ] **Background jobs** — Run heavy analytics as background tasks, not inline with HTTP requests
- [ ] **Read replicas** — For PostgreSQL option, use replica for analytics queries to offload primary

> **Recommendation:** Start with basic indexing and pagination. Add caching if analytics queries become slow (>1s).

---

## 13. Migration & Upgrade Strategy

- [ ] **A) Manual SQL migrations** — Hand-written migration files, applied via `psql` or SQLite CLI. Simple but error-prone.
- [x] **B) Migration tool (node-pg-migrate, sqlite-migrations)** — Track applied migrations, rollback support. Standard approach.
- [ ] **C) ORM migrations (Prisma, Drizzle)** — Auto-generate migrations from schema changes. Convenient but opinionated.

### Version Compatibility
- [x] Document breaking changes in CHANGELOG.md
- [x] Use semantic versioning (MAJOR.MINOR.PATCH)
- [x] Support in-place upgrades (apply migrations on startup or via CLI command)
- [x] Provide rollback scripts for critical migrations

> **Recommendation:** Option C (ORM migrations) if using Prisma/Drizzle anyway. Otherwise B (migration tool).

---

## 14. Project Structure (Proposed)

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

## 15. Planned — Claude-Assisted PR Review

> **Status:** Not yet implemented. Requires `ANTHROPIC_API_KEY` GitHub secret.

Add a GitHub Actions workflow that uses `anthropics/claude-code-action` with the `prompt` parameter to review PRs for infrastructure leaks that the regex scanner might miss (e.g. network topology described in prose, unconventional IP formats, hardcoded paths that don't match known patterns).

`@claude` mentions only work in issue/PR comments — they can't be triggered from hooks or arbitrary workflows. The `prompt` parameter bypasses this limitation and runs Claude autonomously.

```yaml
# .github/workflows/claude-review.yaml (draft)
name: Claude PR Review

on:
  pull_request:
    branches: [main]

jobs:
  review:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Review this PR for:
            1. Any hardcoded infrastructure details (IPs, hostnames, domain names,
               VLAN IDs, credentials, share paths) — this is a public repo.
            2. General code quality and security concerns.
            Reference CLAUDE.md for project conventions.
```

**Considerations:**
- Costs per-PR based on Anthropic API usage (token-based)
- Regex scanner (`scripts/infra-scan.sh`) remains the primary gate — fast, free, deterministic
- Claude review is a second-pass safety net for things regex can't catch
- Could also be used for general code review on PRs from contributors

---

## 16. Decisions Log

| # | Decision | Choice | Date | Rationale |
|---|----------|--------|------|-----------|
| 1 | Backend framework | D) Hybrid microservice (Python + Node.js) | 2026-02-06 | Cleanest separation of data extraction (Python) and web frontend (Node.js) |
| 2 | Frontend framework | A) React + Vite | 2026-02-06 | Large ecosystem, fast builds, straightforward SPA |
| 3 | Database access | C) Upload workflow | 2026-02-06 | Required for k3s deployment; local dev can use A/B |
| 4 | Visualisation | E) Plotly.js | 2026-02-06 | Interactive charts out of the box, good for dashboards |
| 5 | Analysis features | All phases (1–3) | 2026-02-06 | Full feature set planned from the start |
| 6 | Python code reuse | D) Don't reuse | 2026-02-06 | Write from scratch; attribute yortos if used as reference |
| 7 | Backup strategy | C) Both (snapshots + incremental) | 2026-02-06 | LaunchAgent sqlite3 .backup on file change; incremental for efficiency |
| 8 | Container build | B) Multi-stage Dockerfile | 2026-02-06 | Smaller production image with slim Node runtime |
| 9 | CI/CD | B) Gitea Actions + GitHub Actions | 2026-02-06 | Gitea for deployment, GitHub for PR checks |
| 10 | Mac-side sync | A) launchd plist | 2026-02-06 | WatchPaths on chat.db + ThrottleInterval; sqlite3 .backup to SMB |
| 11 | k3s ingest job | A) CronJob (dedicated container) | 2026-02-06 | Lightweight, NFS via existing storage pool on node |
| 12 | Database backend | A) PostgreSQL | 2026-02-06 | Existing instance with replication, full-text search |
| 13 | Watermark strategy | B) Timestamp-based | 2026-02-06 | Handles out-of-order delivery |
| 14 | File retention | C) Latest + weekly snapshots | 2026-02-06 | 12-week rolling retention balances storage and recovery |
| 15 | Authentication | B) Basic Auth (Traefik) | 2026-02-06 | Simple ingress-level auth for personal deployment |
| 16 | Error handling | B) Structured responses | 2026-02-06 | Standardised error format with codes |
| 17 | Logging | B) Structured (Pino/Winston) | 2026-02-06 | JSON logs, correlation IDs, kubectl-friendly |
| 18 | Testing | B) Unit tests (Vitest/Jest) | 2026-02-06 | Fast feedback on extraction/analysis logic |
| 19 | Performance | Indexing + pagination | 2026-02-06 | Start simple, add caching if needed |
| 20 | Migrations | B) Migration tool (node-pg-migrate) | 2026-02-06 | Rollback support, tracks applied migrations |
