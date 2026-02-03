# ChatPulse - Claude Code Instructions

## Project Overview

ChatPulse is a web application for exploring, backing up, and visually analysing Apple Messages (iMessage) databases. It provides a web frontend for browsing message threads, generating statistics, and producing visual breakdowns of messaging patterns.

## Tech Stack

- **Backend:** Node.js (see PLAN.md for framework decision)
- **Frontend:** Web-based (see PLAN.md for framework decision)
- **Database:** SQLite (read-only access to macOS `chat.db`)
- **Deployment:** Docker container on k3s cluster (Traefik ingress, cert-manager TLS)
- **CI/CD:** Gitea Actions (primary), GitHub Actions (secondary)
- **Container Registry:** Gitea OCI (self-hosted) or `ghcr.io` — configured via CI/CD secrets

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

## Secrets & Configuration

**Any local hostnames, network information (IP addresses, subnet CIDRs, VLAN IDs), credentials, share paths, or domain names whatsoever must NEVER be committed to this repo.** This is a public repository. All infrastructure-specific values are injected at runtime via:

- **k8s Secrets** — `DATABASE_URL`, `NFS_SERVER`, `NFS_PATH`
- **GitHub Secrets** — CI/CD registry credentials, deployment targets
- **Gitea Secrets** — Same as above for Gitea Actions
- **macOS Keychain** — SMB credentials for the LaunchAgent

A pre-commit hook and GitHub Actions workflow scan for accidental leaks (see `.github/workflows/infra-scan.yaml`). See PLAN.md § "Required Secrets" for the full list.

## Key Paths

| Path | Purpose |
|------|---------|
| `PLAN.md` | Architectural decisions and roadmap |
| `src/` | Application source code |
| `k8s/` | Kubernetes manifests for deployment |
| `Dockerfile` | Container build definition |
