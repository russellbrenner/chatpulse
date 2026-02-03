# ChatPulse - Claude Code Instructions

## Project Overview

ChatPulse is a web application for exploring, backing up, and visually analysing Apple Messages (iMessage) databases. It provides a web frontend for browsing message threads, generating statistics, and producing visual breakdowns of messaging patterns.

## Tech Stack

- **Backend:** Node.js (see PLAN.md for framework decision)
- **Frontend:** Web-based (see PLAN.md for framework decision)
- **Database:** SQLite (read-only access to macOS `chat.db`)
- **Deployment:** Docker container on k3s cluster (Traefik ingress, cert-manager TLS)
- **CI/CD:** Gitea Actions (primary), GitHub Actions (secondary)
- **Container Registry:** Gitea OCI (`git.itsa.house/rbrenner/chatpulse`)

## Development Guidelines

- Australian English for all user-facing text and documentation
- Use Mermaid for diagrams in markdown files
- Follow existing k3s deployment patterns from `~/git/homelab/k8s/`
- Plain YAML manifests for Kubernetes resources (no Helm/Kustomize)

## Database Access

The macOS Messages database is located at:
```
~/Library/Messages/chat.db
```

Accessing it requires **Full Disk Access** permission for the terminal application. The database is SQLite and should be opened in **read-only mode** to avoid corruption.

## Attribution

This project draws inspiration from [yortos/imessage-analysis](https://github.com/yortos/imessage-analysis) by Yorgos Askalidis, licensed under CC BY-NC 4.0. Any reused analysis logic is credited accordingly.

## Git Conventions

All commits by Claude must include:
```
Co-Authored-By: Claude <noreply@anthropic.com>
AI-Generated: true
```

## Key Paths

| Path | Purpose |
|------|---------|
| `PLAN.md` | Architectural decisions and roadmap |
| `src/` | Application source code |
| `k8s/` | Kubernetes manifests for deployment |
| `Dockerfile` | Container build definition |
