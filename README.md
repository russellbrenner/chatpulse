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

## Deployment

ChatPulse is designed to run as a containerised application on Kubernetes (k3s). See `k8s/` for deployment manifests.

## Licence

MIT
