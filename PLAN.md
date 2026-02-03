# ChatPulse — Architecture Plan

<!-- 
==========================================================================================
REVIEW NOTES (2026-02-03): PLAN.md Review Against CLAUDE.md Conventions
==========================================================================================

This document has been reviewed for security, consistency, completeness, and licensing concerns.
Detailed findings are documented inline using HTML comments throughout this file.

EXECUTIVE SUMMARY:

1. SECURITY (✓ PASS):
   - No hardcoded infrastructure details found (IPs, hostnames, domain names, credentials, etc.)
   - All sensitive values properly abstracted using environment variables and Kubernetes Secrets
   - Variables correctly referenced: $NAS_HOST, $DATABASE_URL, $NFS_SERVER, $NFS_PATH, etc.
   - Scanner patterns in scripts/infra-scan.sh should catch any accidental leaks

2. INTERNAL CONSISTENCY (⚠ MINOR ISSUES):
   - Section 7 mentions "OPNsense Relayd annotations" without explanation - marked for clarification
   - Section 8 introduces PostgreSQL as backend, but Section 2 only mentions SQLite - added clarification
   - CLAUDE.md referenced "§ Required Secrets" incorrectly - fixed to "§ 8 → Required Secrets table"
   - Terminology is mostly consistent (chat.db / Messages database used interchangeably - acceptable)

3. COMPLETENESS (⚠ GAPS ADDRESSED):
   Added new sections covering previously missing architectural decisions:
   - § 9: Authentication & Authorization (5 options with recommendation)
   - § 10: Error Handling & Logging (structured approach)
   - § 11: Testing Strategy (unit, integration, E2E options)
   - § 12: Performance & Scalability (scale expectations, optimization strategies)
   - § 13: Migration & Upgrade Strategy (schema evolution)
   
   Enhanced existing sections with additional options:
   - § 1: Added Bun and Deno runtime options, Solid.js frontend option
   - § 7: Added Alpine and distroless container options
   - § 8: Added SQLite with migration path option

4. LICENSING (⚠ LEGAL CONSIDERATIONS):
   - CC BY-NC 4.0 reuse approach is legally sound for non-commercial use
   - MIT license for ChatPulse is compatible with attribution requirement
   - CONCERN: Non-Commercial clause creates "mixed license" situation if code is substantially reused
   - RISK: Could prevent SaaS, commercial support, enterprise licensing, acquisition
   - RECOMMENDATION: Use Option A (port to JS/TS) or D (write from scratch) for clearest legal footing
   - If porting: Document exact adaptations and add NOTICE file with proper attribution
   - Alternative: Request dual-licensing from yortos for commercial permission
   - Added detailed analysis in § 5 comments

5. ARCHITECTURAL SOUNDNESS (✓ GOOD):
   - Options are well-structured and cover reasonable alternatives
   - Justifications are clear and practical
   - Trade-offs are explained
   - Modern alternatives added (Bun, Deno, Solid.js, distroless containers)
   - PostgreSQL vs SQLite decision enhanced with "start simple, migrate if needed" option
   - Recommendations provided where appropriate

6. STRUCTURE:
   - Maintained existing checklist format convention
   - All new options follow [ ] **X) Description** — Explanation pattern
   - Section numbering corrected (9-16 instead of 9, "Planned", "Decisions Log")
   - HTML comments used exclusively to avoid polluting rendered document

For implementation, prioritize decisions in this order:
1. Backend language/framework (§ 1) - affects all downstream choices
2. License strategy (§ 5) - legal implications must be resolved early
3. Database backend (§ 8) - affects data model and deployment
4. Authentication (§ 9) - security requirement for production deployment
5. Remaining sections can be decided incrementally during development
==========================================================================================
-->

## 1. Language & Framework

<!-- REVIEW: Consider adding modern alternatives like Bun (faster Node.js replacement) or Deno (built-in TypeScript, security sandbox). Both could simplify the stack. -->

The core question: Node.js, Python, or hybrid?

### Backend

- [ ] **A) Node.js (Fastify)** — Fast, TypeScript-friendly, single language stack with frontend. Use `better-sqlite3` for chat.db access. Most natural fit for a web app with real-time features.
- [ ] **B) Node.js (Express)** — More ecosystem support and middleware, slightly heavier than Fastify. Same `better-sqlite3` approach.
- [ ] **C) Python (FastAPI) + Node frontend** — Leverage yortos' existing ETL/analysis code directly. Two runtimes to manage. FastAPI is async-capable and fast.
- [ ] **D) Hybrid microservice** — Python service for data extraction/analysis, Node.js service for web frontend and API gateway. More complex but cleanest separation. Two containers in k8s.
- [ ] **E) Bun (Fastify or Hono)** — Modern JavaScript runtime, 3-4x faster than Node.js, drop-in replacement with native TypeScript support. Use `bun:sqlite` for database access. Single binary, simpler deployment.
- [ ] **F) Deno (Fresh or Oak)** — Secure-by-default runtime with built-in TypeScript. Requires explicit permissions (filesystem, network). Good for security-conscious deployments. Smaller ecosystem than Node.js.

### Frontend

- [ ] **A) React + Vite** — Fast builds, large ecosystem, straightforward SPA. Pairs well with any backend.
- [ ] **B) Next.js** — SSR/SSG capabilities, API routes built-in (could eliminate separate backend for simple cases). Heavier.
- [ ] **C) SvelteKit** — Smaller bundle, less boilerplate, good DX. Smaller ecosystem.
- [ ] **D) Vue 3 + Vite** — Simpler mental model than React, good ecosystem. Less common in the Node.js analytics space.
- [ ] **E) Solid.js + Vite** — Reactive performance similar to Svelte but with JSX syntax like React. Fine-grained reactivity without VDOM overhead. Smaller but growing ecosystem.

---

## 2. Database Access Strategy

<!-- REVIEW: This section should clarify that the strategy differs for local dev vs. production deployment. Consider splitting into "Development Strategy" and "Production Strategy" subsections. -->

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

<!-- 
REVIEW (LICENSING): The CC BY-NC 4.0 license analysis is sound for current non-commercial use. However:
- NC (Non-Commercial) clause may be interpreted differently by different parties
- MIT license for ChatPulse is permissive, but incorporating NC-licensed code creates a "mixed license" situation
- If yortos' code is substantially incorporated, derivative work inherits NC restriction
- This could prevent: SaaS offerings, commercial support, enterprise licensing, acquisition potential
- RECOMMENDATION: Option A (port to JS/TS) or D (write from scratch) provide clearest legal footing
- If using A: Document exactly what was adapted and add NOTICE file with attribution
- Consider reaching out to yortos for dual-licensing or explicit permission for commercial use
-->

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

<!-- REVIEW: Consider adding distroless or Alpine-based options for even smaller, more secure images. -->

### Container Build
- [ ] **A) Single-stage Dockerfile** — Simple, larger image.
- [ ] **B) Multi-stage Dockerfile** — Build stage (compile TypeScript, bundle frontend) + production stage (slim Node runtime). Smaller image.
- [ ] **C) Multi-stage with Alpine** — Same as B but use `node:20-alpine` for production stage. Even smaller (~40MB vs ~180MB for slim). May require native module compilation.
- [ ] **D) Distroless** — Google's distroless Node.js base image. Minimal attack surface (no shell, package manager). Best security posture but harder to debug.

### CI/CD
- [ ] **A) Gitea Actions only** — Build and push to self-hosted Gitea OCI registry. Matches existing homelab patterns.
- [ ] **B) Gitea Actions + GitHub Actions** — Gitea for deployment builds, GitHub for CI checks on PRs.
- [ ] **C) GitHub Actions only** — Push to `ghcr.io/russellbrenner/chatpulse`. Simpler if not self-hosting registry.

### k3s Deployment
- Plain YAML manifests in `k8s/` directory
- Traefik Ingress with cert-manager TLS
- OPNsense Relayd annotations for VIP allocation <!-- REVIEW: This is mentioned only here. Consider explaining what Relayd is and why it's needed, or link to homelab documentation. If this is infrastructure-specific, ensure it's properly abstracted. -->
- ConfigMap for app settings, Secret for any credentials
- PersistentVolumeClaim for uploaded/backed-up databases

---

## 8. Message Archival & Sync Pipeline

<!-- 
REVIEW (CONSISTENCY): This section introduces PostgreSQL as the backend, but Section 2 only mentions SQLite. 
The architecture diagram shows both SQLite (for reading chat.db) and PostgreSQL (for archival storage).
This should be clarified earlier in the document to avoid confusion.

SECURITY: ✓ No hardcoded infrastructure details found. Variables properly used: $NAS_HOST, $NAS_SHARE, $DATABASE_URL, $NFS_SERVER, $NFS_PATH
-->

The primary motivation: permanently archive all iMessages before setting macOS message expiry to 365 days. Tens of thousands of messages slow down all Apple devices; pruning them from iCloud while retaining a searchable archive in PostgreSQL solves this.

### Architecture

Infrastructure-specific details (IPs, share paths, hostnames) are kept out of this repo. Connection strings and mount paths are injected via environment variables and Kubernetes Secrets, populated from CI/CD secrets (GitHub Secrets / Gitea Secrets).

```
Mac (launchd plist, daily)
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

- [ ] **A) launchd plist** — Native macOS scheduler. Runs `sqlite3 .backup` to SMB share. Simple, reliable, no dependencies.
- [ ] **B) cron job** — Works but launchd is preferred on macOS (handles sleep/wake, power management).

> **Safety note:** `sqlite3 .backup` uses SQLite's online backup API — safe to run while Messages.app is using the database. Do NOT use `cp` directly as this risks WAL corruption.

### k3s Ingest Job

- [ ] **A) CronJob (dedicated container)** — Lightweight image with `better-sqlite3` and `pg` client. Runs on schedule (e.g. daily, 1 hour after Mac sync). Mounts NAS via NFS.
- [ ] **B) ChatPulse app endpoint** — The main ChatPulse web app exposes an `/api/ingest` endpoint. A k3s CronJob curls it to trigger processing. Simpler image but couples ingest to app availability.

### Database Backend

<!-- 
REVIEW: This is a critical architectural decision that needs more justification:
- PostgreSQL: Better for concurrent access, full-text search, larger datasets, backup/replication
- SQLite: Simpler deployment, no external dependency, sufficient for personal use
- Consider adding: How much data are we talking about? (message count estimates)
- Consider adding: Expected concurrent user count (1 user? family? team?)
- Consider adding: SQLite with WAL mode can handle ~10K writes/sec, likely sufficient for this use case
- Consider adding: Option C - Start with SQLite, migrate to PostgreSQL if needed (simpler MVP)
-->

- [ ] **A) PostgreSQL** — Existing homelab instance with streaming replication. Production-grade, supports full-text search. Connection via `DATABASE_URL` secret.
- [ ] **B) SQLite (in-app)** — Simpler, no external dependency, but less suitable for a web app with concurrent access and long-term archival.
- [ ] **C) SQLite with migration path** — Start with SQLite for MVP. WAL mode handles concurrent reads well. Migrate to PostgreSQL if scaling needs arise. Use an ORM/query builder (Prisma, Drizzle) to ease future migration.

### Watermark / Deduplication Strategy

- [ ] **A) ROWID tracking** — Store the highest ingested ROWID. Simple, works for append-only data. Misses edits/deletes (rare in Messages).
- [ ] **B) Timestamp-based** — Use `message.date` column. Handles out-of-order delivery. Slightly more complex.
- [ ] **C) Hash-based dedup** — Hash each message row, skip if already ingested. Most robust but slower.

### File Retention on NAS

- [ ] **A) Keep latest only** — Overwrite `chat.db` each sync. Minimal storage. File-level backup is just "latest snapshot".
- [ ] **B) Rolling copies** — Keep timestamped copies (e.g. `chat-2026-02-03.db`). Uses more storage but provides point-in-time recovery. Prune after N days.
- [ ] **C) Keep latest + weekly snapshots** — Overwrite daily, but keep one copy per week for 12 weeks. Balance of storage and recovery.

### Future Enhancement: API Push

> As a v2 improvement, the Mac-side job could also POST new messages directly to the ChatPulse API over HTTPS (via Traefik ingress), enabling near-real-time ingest without waiting for the CronJob schedule. The SMB copy would remain as a backup safety net.

---

## 9. Authentication & Authorization

<!-- 
REVIEW (COMPLETENESS): This is a critical missing architectural decision.
The app will have access to private message data - how is it protected?
-->

- [ ] **A) None (localhost-only)** — App binds to 127.0.0.1, accessible only from the local machine. Simplest for personal use. No auth overhead.
- [ ] **B) Basic Auth (Traefik middleware)** — Single username/password at the ingress level. Simple, but shared credential and no user-specific permissions.
- [ ] **C) OAuth2 / OIDC** — Integrate with existing identity provider (Google, GitHub, self-hosted Authelia/Keycloak). Enterprise-grade but complex setup.
- [ ] **D) Client Certificate (mTLS)** — Certificate-based authentication at Traefik ingress. Very secure, no password management, but requires PKI infrastructure.
- [ ] **E) Wireguard/Tailscale only** — Rely on network-level access control. App has no auth, but only accessible via VPN. Simple and secure for personal/homelab use.

> **Recommendation:** For personal homelab deployment, options A (dev) or E (production) are sufficient. For multi-user scenarios, consider C or D.

---

## 10. Error Handling & Logging

<!-- REVIEW (COMPLETENESS): Missing error handling and observability strategy. -->

### Error Handling
- [ ] **A) Basic try/catch with console.error** — Minimal approach. Errors logged to stdout/stderr.
- [ ] **B) Structured error responses** — Standardised error format with error codes, HTTP status codes, and user-friendly messages. Separate technical details from user-facing errors.
- [ ] **C) Error tracking service** — Integrate Sentry, Rollbar, or self-hosted error tracker. Captures stack traces, context, and frequency.

### Logging
- [ ] **A) Console logs (stdout/stderr)** — Default Node.js approach. Works with container logs (`kubectl logs`).
- [ ] **B) Structured logging (Pino, Winston)** — JSON-formatted logs with correlation IDs, timestamps, severity levels. Easy to parse and aggregate.
- [ ] **C) Centralized logging** — Ship logs to Loki/Grafana, ELK stack, or similar. Enables search, alerting, and long-term retention.

> **Recommendation:** Start with B (structured logging) for both. Add C (centralized) as homelab monitoring evolves.

---

## 11. Testing Strategy

<!-- REVIEW (COMPLETENESS): No testing approach defined. -->

- [ ] **A) Manual testing only** — Simplest, suitable for personal projects. High risk of regressions.
- [ ] **B) Unit tests (Vitest/Jest)** — Test business logic, data extraction, transformations. Fast feedback loop.
- [ ] **C) Integration tests** — Test API endpoints, database interactions. Slower but catches more issues.
- [ ] **D) E2E tests (Playwright)** — Test full user workflows in a browser. Most comprehensive but slowest.
- [ ] **E) Combination approach** — Unit tests for core logic, integration tests for API, E2E for critical paths. Balanced coverage.

### CI Testing
- [ ] Run tests on every PR (GitHub Actions / Gitea Actions)
- [ ] Block merges if tests fail
- [ ] Generate coverage reports

> **Recommendation:** Start with B (unit tests for extraction/analysis logic). Add C (API integration tests) once backend is stable.

---

## 12. Performance & Scalability

<!-- REVIEW (COMPLETENESS): No performance considerations defined. -->

### Expected Scale
- **Message volume:** 10K–1M+ messages (depending on chat.db size)
- **Concurrent users:** 1–5 (personal/family use)
- **Query patterns:** Read-heavy (analytics), occasional writes (backups, ingests)

### Performance Considerations
- [ ] **Database indexing** — Index frequently queried fields (contact ID, date, thread ID)
- [ ] **Query optimization** — Use EXPLAIN to optimize complex analytics queries
- [ ] **Caching** — Cache expensive aggregations (daily stats, contact lists) with Redis or in-memory cache
- [ ] **Pagination** — Limit result sets for message lists and threads
- [ ] **Background jobs** — Run heavy analytics as background tasks, not inline with HTTP requests
- [ ] **Read replicas** — For PostgreSQL option, use replica for analytics queries to offload primary

> **Recommendation:** Start with basic indexing and pagination. Add caching if analytics queries become slow (>1s).

---

## 13. Migration & Upgrade Strategy

<!-- REVIEW (COMPLETENESS): Missing strategy for schema changes and data migrations. -->

- [ ] **A) Manual SQL migrations** — Hand-written migration files, applied via `psql` or SQLite CLI. Simple but error-prone.
- [ ] **B) Migration tool (node-pg-migrate, sqlite-migrations)** — Track applied migrations, rollback support. Standard approach.
- [ ] **C) ORM migrations (Prisma, Drizzle)** — Auto-generate migrations from schema changes. Convenient but opinionated.

### Version Compatibility
- [ ] Document breaking changes in CHANGELOG.md
- [ ] Use semantic versioning (MAJOR.MINOR.PATCH)
- [ ] Support in-place upgrades (apply migrations on startup or via CLI command)
- [ ] Provide rollback scripts for critical migrations

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

<!-- REVIEW: This section number was previously "## Planned" without a number. Updated to maintain consistent numbering. -->

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

<!-- REVIEW: Track architectural decisions here as they're made. Consider using ADR (Architecture Decision Records) format for more detailed rationale. -->

| # | Decision | Choice | Date | Rationale |
|---|----------|--------|------|-----------|
| — | — | — | — | Awaiting selection |
