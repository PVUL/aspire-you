# Aspire You — Local-First GitHub Vault Journal

A journaling app where you truly own your data. Entries are saved instantly to a local SQLite database in your browser, and you can manually push them to your own private GitHub repository when you're ready.

## How It Works

1. **Type** → auto-saved to browser SQLite immediately (no network required)
2. **Push** → manually syncs your entries to GitHub as markdown files in `entries/`
3. **Pull** → fetches the latest from GitHub into your local SQLite

Your data lives in your browser and your GitHub. No third-party servers hold your journal content.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vite + React + TypeScript |
| Styling | Tailwind CSS v4 |
| Auth | Nhost |
| Client DB | `sqlocal` — SQLite WASM via OPFS |
| Backend | Nhost Serverless Functions (Express) |
| GitHub Sync | Octokit (`@octokit/rest`) |

## Running Locally

### Prerequisites
- [Nhost CLI](https://docs.nhost.io/local-development) installed
- A GitHub OAuth App (callback: `http://localhost:3000/callback`)

### Setup

1. Copy the environment template:
   ```bash
   cp .env.local.example .env.local
   ```

2. Fill in your `.env.local`:
   ```bash
   VITE_NHOST_SUBDOMAIN="local"
   VITE_NHOST_REGION="local"
   VITE_GITHUB_CLIENT_ID="..."
   ```

3. Fill in `.secrets` (for Nhost functions):
   ```bash
   GITHUB_CLIENT_SECRET="..."
   NHOST_JWT_SECRET='{"type":"RS256","key":"..."}'
   ```

4. Start Nhost backend:
   ```bash
   nhost up
   ```

5. Start the frontend:
   ```bash
   bun run dev
   ```

The app runs at `http://localhost:5173`, the Nhost backend at `http://localhost:1337`.

## Docs

- [Architecture Overview](docs/architecture.md)
- [Next.js → Vite + Nhost Migration](docs/nhost-migration.md)
