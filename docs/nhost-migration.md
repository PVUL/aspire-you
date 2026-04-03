# Migration: Next.js + better-auth → Vite + Nhost

A detailed account of what changed, what broke, and what we learned.

---

## Why We Migrated

The original stack was **Next.js (App Router) + better-auth + bun:sqlite**. The problems that forced the migration:

1. **`bun:sqlite` doesn't work in Node.js** — Next.js API routes run in the Node.js runtime, not Bun. Using `bun:sqlite` in API routes produced a TypeScript compilation error at build time.
2. **better-auth session complexity** — better-auth manages its own SQLite `auth.db` on the server. This was an additional stateful dependency that complicated local dev and didn't integrate cleanly with the GitHub OAuth flow we needed.
3. **Next.js + sqlocal (WASM) incompatibility** — `sqlocal` uses Web Workers and OPFS, which require browser-only APIs. Next.js SSR would attempt to import these on the server and crash.
4. **No easy way to deploy serverless functions separately** — We needed isolated, lightweight backend functions for GitHub API calls. Next.js API routes work, but Nhost gives us a cleaner deployment model with a local emulator.

---

## What Changed

### Framework: Next.js → Vite

**Before:**
```
src/app/
  layout.tsx
  page.tsx
  api/
    auth/[...all]/route.ts
    vault/entry/route.ts
    vault/list/route.ts
    vault/provision/route.ts
```

**After:**
```
src/
  main.tsx          ← Vite entry point
  App.tsx           ← React root with routing
  pages/Home.tsx
  components/
  lib/

functions/          ← Nhost Serverless Functions (separate Express server)
  auth/session.ts
  vault/entry.ts
  vault/list.ts
  vault/provision.ts
```

Key change: API routes are no longer colocated with the frontend. They run as a separate Express-based functions server managed by Nhost, proxied through `/nhost-fn/*` in dev.

**`vite.config.ts` proxy setup:**
```ts
server: {
  proxy: {
    '/nhost-fn': {
      target: 'http://localhost:1337',
      rewrite: (path) => path.replace(/^\/nhost-fn/, '/functions'),
    }
  }
}
```

---

### Auth: better-auth → Clerk + Nhost JWT

This was the most complex part of the migration.

**The problem with Clerk alone:** Clerk issues JWTs that expire in 7 days maximum. Our Nhost backend (Hasura) needs JWTs that contain Hasura-compatible claims (`x-hasura-user-id`, roles). Clerk doesn't produce those.

**The solution — a custom session exchange:**

```
Clerk (handles login UI + email OTP)
  │
  │  POST /nhost-fn/auth/session  { Authorization: Bearer <clerk-jwt> }
  ▼
session.ts (Nhost function)
  │  - Decode Clerk JWT to get userId (no external verification needed in dev)
  │  - Mint a new JWT with Hasura claims using NHOST_JWT_SECRET
  │  - Return { accessToken, refreshToken }
  ▼
Frontend: nhost.auth.initWithSession({ session: { accessToken, refreshToken, ... } })
```

The minted token looks like:
```json
{
  "sub": "user_clerk_xxxx",
  "https://hasura.io/jwt/claims": {
    "x-hasura-allowed-roles": ["user"],
    "x-hasura-default-role": "user",
    "x-hasura-user-id": "user_clerk_xxxx"
  }
}
```

**`AuthSync` component** (in `App.tsx`) handles this transparently on every login:
```tsx
async function syncSession() {
  if (!isLoaded) return;
  if (isSignedIn) {
    const clerkToken = await getToken();
    const res = await fetch('/nhost-fn/auth/session', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clerkToken}` }
    });
    const { accessToken, refreshToken } = await res.json();
    await nhost.auth.initWithSession({
      session: { accessToken, refreshToken, accessTokenExpiresIn: 30 * 24 * 3600, user: { id: 'unknown' } as any }
    });
  }
}
```

**Lesson:** `nhost.auth.getAccessToken()` called inline inside a component callback will return `undefined` if the `initWithSession` async operation hasn't fully propagated into Nhost's internal state machine yet. Always use the `useAccessToken()` React hook for reactive token access, and fall back to Clerk's `getToken()` for one-off imperative calls:

```ts
const token = accessToken || await getToken();
if (!token) return;
```

---

### Database: better-sqlite3 (server) → sqlocal (browser WASM)

**Before:** A server-side `auth.db` file managed by better-auth. Journal data was also intended to go here.

**After:** All journal data lives in the browser via `sqlocal` — SQLite compiled to WASM, stored in the browser's Origin Private File System (OPFS).

```ts
// src/lib/localDb.ts
import { SQLocal } from 'sqlocal';

const { sql, execRaw } = new SQLocal('journal.db');
export { sql, execRaw };
```

**Key vite.config.ts requirement** — `sqlocal` uses Web Workers internally. Without this, Vite's dependency pre-bundling breaks the Worker:
```ts
optimizeDeps: {
  exclude: ['sqlocal'],
}
```

**OPFS gotcha:** The OPFS sandbox is per-origin. In dev with `localhost:5173`, the database persists across reloads. But if you change the origin (e.g., deploy to a different domain), the database is gone. The GitHub sync is the durability layer for this reason.

---

### API Routes: Next.js Route Handlers → Nhost Functions (Express)

**Before (Next.js):**
```ts
// src/app/api/vault/list/route.ts
export async function GET(request: Request) {
  const auth = await betterAuth.api.getSession({ headers: request.headers });
  // ...
}
```

**After (Nhost):**
```ts
// functions/vault/list.ts
export default async function listVault(req: Request, res: Response) {
  const token = req.headers.authorization?.replace(/^Bearer\s/i, '').trim();
  // decode JWT manually to get userId
  // use userId to fetch GitHub token from Postgres via GraphQL
  // ...
}
```

The Nhost functions are plain Express handlers. No framework magic — you get `req` and `res` and that's it. Authentication is done manually by decoding the JWT and looking up the user's GitHub token from Postgres via Hasura's GraphQL endpoint using the admin secret.

**GraphQL lookup pattern used across all vault functions:**
```ts
const gqlRes = await fetch(process.env.NHOST_GRAPHQL_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET,
  },
  body: JSON.stringify({
    query: `query GetGithubConnection($userId: String!) {
      github_connections_by_pk(user_id: $userId) { access_token }
    }`,
    variables: { userId },
  }),
});
const { data } = await gqlRes.json();
const githubToken = data?.github_connections_by_pk?.access_token;
```

---

## Key Lessons

### 1. JWT timing is tricky
`nhost.auth.getAccessToken()` is synchronous and reads from an internal cache. If called before `initWithSession()` resolves, it returns `null`. This caused "Not authenticated" false positives on all GitHub sync actions. Fix: use `useAccessToken()` hook (reactive) or `await getToken()` from Clerk as a fallback.

### 2. GitHub API sha conflicts (409)
The GitHub Contents API requires the current `sha` of a file to update it. If a file moves paths (e.g., from root `2026-04-03.md` to `entries/2026-04-03.md`), the stored sha becomes invalid. Fix: always fetch the live `sha` immediately before a PUT:

```ts
let liveSha: string | undefined;
try {
  const existing = await octokit.rest.repos.getContent({ owner, repo, path });
  liveSha = (existing.data as any).sha;
} catch (err: any) {
  if (err.status !== 404) throw err;
  // new file — no sha needed
}
await octokit.rest.repos.createOrUpdateFileContents({ ..., sha: liveSha });
```

### 3. sqlocal Web Worker isolation
`sqlocal` spins up a Worker thread. If Vite bundles it normally, the Worker loses its module context. `optimizeDeps.exclude: ['sqlocal']` is required.

### 4. Nhost functions need a Docker restart to pick up new routes
Adding a new function file doesn't hot-reload. You must `nhost down && nhost up` or restart the functions container for the router to register new endpoints.

### 5. CORS on every function
Nhost functions don't automatically add CORS headers. Every handler needs:
```ts
res.setHeader('Access-Control-Allow-Origin', '*');
res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
if (req.method === 'OPTIONS') return res.status(200).end();
```

### 6. Nhost's RS256 JWT in local dev
The local Nhost environment generates an RS256 key pair and stores it in `.secrets`. Your custom session function must read this key to sign tokens the same way. The key lives at:
```
NHOST_JWT_SECRET='{"type":"RS256","key":"-----BEGIN PUBLIC KEY-----\n..."}'
NHOST_JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
```
In the functions container, `process.cwd()` is `/opt/project/functions`, so reading `.secrets` means going up one level: `path.join(process.cwd(), '..', '.secrets')`.

---

## Files Deleted in Migration

| File | Reason |
|---|---|
| `next.config.ts` | No longer using Next.js |
| `src/app/layout.tsx` | Replaced by `index.html` + `src/main.tsx` |
| `src/app/page.tsx` | Replaced by `src/pages/Home.tsx` |
| `src/app/api/vault/*/route.ts` | Replaced by `functions/vault/*.ts` |
| `src/lib/auth.ts` | better-auth removed |
| `src/lib/auth-client.ts` | better-auth removed |
| `auth.db` | better-auth's server SQLite — no longer needed |
