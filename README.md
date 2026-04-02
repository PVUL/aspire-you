# Aspire You - Local-First GitHub Vault Journal

A decentralized journaling application that ensures you truly own your data by syncing locally authored entries to a private GitHub repository (`aspire-vault`). 

## Key Features

1. **Local-First SQLite Database**: 
   - Powered by [sqlocal](https://sqlocal.dallashoff.com/) (SQLite WASM utilizing the Origin Private File System).
   - As you type, entries are auto-saved locally in real-time within your browser context. No network latency, and works completely offline.
2. **True Data Ownership**:
   - Behind the scenes, the ultimate source-of-truth is your own private GitHub Repository.
   - Pushing your local SQLite changes to become GitHub Commits is an intentional, manual sync action.
3. **Decentralized Provisioning**:
   - Uses `better-auth` and `octokit` to securely manage authentication tokens in a proxy SQLite server.
   - Automatically provisions an encrypted, CRDT-ready `.md` structure inside a private `aspire-vault` repository upon account creation.

## Stack
- Framework: Next.js App Router (Bun)
- Database (Client): `sqlocal` (SQLite WASM)
- Database (Server Config): `better-sqlite3`
- Auth: `better-auth`
- External Sync: GitHub API (`octokit`)
- Styling: Tailwind CSS v4

---

### Run Locally

1. Create a GitHub OAuth App and grab your credentials. Set your Callback URL to `http://localhost:3000/api/auth/callback/github`
2. Configure `.env.local`:
   ```bash
   GITHUB_CLIENT_ID="..."
   GITHUB_CLIENT_SECRET="..."
   BETTER_AUTH_SECRET="..."
   BETTER_AUTH_URL="http://localhost:3000"
   ```
3. Run the setup:
   ```bash
   bun run dev
   ```
