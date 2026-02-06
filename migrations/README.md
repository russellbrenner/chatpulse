# ChatPulse — Database Migrations

PostgreSQL schema migrations for ChatPulse, managed by [node-pg-migrate](https://github.com/salsita/node-pg-migrate).

## Prerequisites

- Node.js 18+
- A running PostgreSQL instance

## Setup

```bash
cd migrations
npm install
```

## Configuration

Migrations connect via the `DATABASE_URL` environment variable. If unset, the default is `postgresql://localhost:5432/chatpulse`.

```bash
# Example: set the connection string
export DATABASE_URL="postgresql://user:password@db-host:5432/chatpulse"
```

The connection config lives in `database.json`.

## Running Migrations

```bash
# Apply all pending migrations
npm run migrate

# Roll back the last applied migration
npm run migrate:down

# Create a new migration file
npm run migrate:create -- my-migration-name
```

## Migration Files

SQL migration files live alongside `package.json` in this directory. Each migration has an up file (`<name>.sql`) and a corresponding down file (`<name>_down.sql`).

| File | Description |
|------|-------------|
| `001_initial-schema.sql` | Creates core tables: handles, chats, messages, attachments, join tables, ingest watermark, and analytics indexes |
| `001_initial-schema_down.sql` | Drops all tables in reverse dependency order |
