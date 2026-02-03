# ChatPulse

Explore, back up, and visually analyse your Apple Messages (iMessage) database through a web interface.

## Features (Planned)

- **Message Explorer** — Browse conversations, search messages, view threads
- **Backup Manager** — Create and manage snapshots of your Messages database
- **Visual Analytics** — Charts and breakdowns of messaging patterns, frequency, contacts, reactions
- **Thread Analysis** — Deep-dive into individual conversations with statistics and timeline views

## Quick Start

> Project is in early development. See [PLAN.md](PLAN.md) for architectural decisions and roadmap.

## Requirements

- macOS (for local Messages database access)
- Full Disk Access permission for your terminal
- Node.js 20+

## How It Works

ChatPulse reads your local macOS Messages database (`~/Library/Messages/chat.db`) in read-only mode. It extracts conversations, contacts, and message metadata to provide visual analytics and a browsable interface.

## Attribution

Inspired by [imessage-analysis](https://github.com/yortos/imessage-analysis) by Yorgos Askalidis. Analysis concepts adapted with credit under CC BY-NC 4.0.

## Security

This is a public repository. Infrastructure-specific details (IP addresses, hostnames, domain names, VLAN IDs, credentials) are never committed. All such values are injected at runtime via Kubernetes Secrets and CI/CD secret stores.

Automated scanning enforces this at three levels:
- **Pre-commit hook** — blocks commits containing infrastructure patterns locally
- **GitHub Actions** — scans changed files on every push and PR
- **Claude Code hook** — scans files during AI-assisted development

See `scripts/infra-scan.sh` for the pattern list. False positives can be excluded by adding files to the `SKIP_FILES` array.

## Deployment

ChatPulse is designed to run as a containerised application on Kubernetes (k3s). See `k8s/` for deployment manifests.

## Licence

MIT
