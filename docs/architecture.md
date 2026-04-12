# Architecture Overview

## The Big Picture

```
Browser                          Nhost (local / cloud)         GitHub
─────────────────────────────    ──────────────────────────    ──────────────────
Clerk Login (email OTP) ◄── (update 2026APR12 - we no longer use clerk)
  │
  └─► /nhost-fn/auth/session ──► Mint long-lived Nhost JWT
                                   │
                                   └─► Store in nhost.auth context
                                         │
                                         ▼
                                   Authenticated user
                                         │
                        ┌────────────────┘
                        │
                        ▼
              VaultDashboard (React)
              ┌─────────────────────────────────────────┐
              │  1. On load → read from local SQLite     │
              │     (instant, no network)                │
              │                                          │
              │  2. Background → GET /vault/list         │──► GitHub repo
              │     merge entries list                   │    entries/*.md
              │                                          │
              │  3. Type → auto-save to local SQLite     │
              │     (debounced 200ms)                    │
              │                                          │
              │  4. Push → PUT /vault/entry              │──► GitHub commit
              │     (manual)                             │
              │                                          │
              │  5. Pull → POST /vault/entry             │◄── GitHub content
              │     (manual)                             │
              └─────────────────────────────────────────┘
```

## Key Components

### Frontend (`src/`)

| File | Role |
|---|---|
| `App.tsx` | Root — mounts `AuthSync` and routes |
| `AuthSync` (in App.tsx) | Exchanges Clerk JWT → Nhost JWT on login |
| `pages/Home.tsx` | Main page layout |
| `components/VaultDashboard.tsx` | Journal editor + file tree + sync actions |
| `components/SqliteDebugPanel.tsx` | Dev-only drawer: SQLite browser + network inspector |
| `lib/localDb.ts` | SQLite WASM init via `sqlocal` (OPFS storage) |
| `lib/devFetchInterceptor.ts` | Patches `window.fetch` to capture all network calls in dev |

### Backend (`functions/`)

Nhost Serverless Functions — plain Express handlers, deployed as `/nhost-fn/*`.

| Function | Method | Role |
|---|---|---|
| `auth/session` | POST | Exchanges Clerk JWT for a Nhost-compatible JWT |
| `github/callback` | GET | OAuth callback — stores GitHub access token in Postgres |
| `vault/provision` | POST | Creates the `aspire-vault` GitHub repo if it doesn't exist |
| `vault/list` | GET | Lists all entries from the `entries/` directory on GitHub |
| `vault/entry` | POST / PUT / DELETE | Fetch / write / delete a single `entries/{date}.md` |

### Data Layer

**Browser SQLite (OPFS)**
- Powered by `sqlocal` — runs SQLite entirely in the browser via WASM
- Stored in the browser's Origin Private File System (sandboxed, persistent)
- Schema: single `entries` table with `date`, `content`, `sha`, `updated_at`, `last_synced_at`

**GitHub Repository (`aspire-vault`)**
- Private repo owned by the user
- Each journal entry is a markdown file at `entries/YYYY-MM-DD.md`
- The `sha` field from GitHub is used to track the current version for conflict-free updates

**Nhost Postgres**
- Only stores the GitHub OAuth access token (`github_connections` table)
- User identity flows from Clerk → Nhost JWT → Hasura claims

## Auth Flow in Detail

```
1. User signs in with Clerk (email OTP)
2. App calls POST /nhost-fn/auth/session with Clerk JWT
3. Function decodes Clerk payload, mints a 30-day Nhost JWT signed with NHOST_JWT_SECRET
4. Frontend loads this token into nhost.auth via initWithSession()
5. All subsequent API calls use this token in Authorization: Bearer headers
6. Functions decode the JWT to get the userId, then look up the GitHub token in Postgres
```

## Sync Strategy

| Action | Trigger | Target |
|---|---|---|
| Auto-save | Keystroke (debounced 200ms) | Local SQLite only |
| List sync | App load / token available | GitHub → merge into local list |
| Pull | Manual button | GitHub → overwrite local SQLite entry |
| Push | Manual button | Local SQLite → GitHub commit |
| Delete | Manual (confirm) | Local SQLite + GitHub file deletion |

The local SQLite is always the immediate source of truth for rendering. GitHub is the durable backup.
