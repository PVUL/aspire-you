# Deployment Guide: Nhost + Cloudflare Pages

This document outlines the decoupled deployment architecture for the project, separating the Vite (React) frontend from the Nhost backend.

## Architecture Architecture

- **Frontend:** React SPA built with Vite, deployed to **Cloudflare Pages** via global edge CDNs.
- **Backend:** PostgreSQL, GraphQL (Hasura), Auth, and Storage deployed to **Nhost**.
- **Serverless API:** Node.js endpoints (e.g. `/functions/settings/gate.ts`) deployed to **Nhost**.

Because the project leverages Nhost's integrated backend functionality, tools like **Nitro** are not required for API routing or server-side rendering unless migrating the frontend entirely to a meta-framework (like Nuxt). Built-in Vite serves the bundle perfectly to end-users.

---

## 1. Connecting Nhost to GitHub

Nhost is designed to pull directly from standard overarching repositories without requiring the repo to exclusively be a "backend" repo.

1. Navigate to the [Nhost Dashboard](https://app.nhost.io/).
2. Create or select your production project.
3. Go to **Settings > Git** and connect this exact GitHub repository.
4. **How it works on Git Push:**
   Nhost natively ignores the React frontend code (like `src/`, `index.html`) and strictly watches required structural folders:
   - `nhost/migrations/` -> Runs incremental Postgres schema updates.
   - `nhost/metadata/` -> Syncs Hasura GraphQL configurations and permissions.
   - `functions/` -> Deploys the secure Node API environment (Serverless endpoints).

---

## 2. Deploying the Frontend to Cloudflare Pages

1. Navigate to the **Cloudflare Dashboard > Workers & Pages**.
2. Select **Create application > Pages > Connect to Git**.
3. Link the same overarching GitHub repository.
4. Configure your build settings:
   - **Framework preset:** `Vite` (or React)
   - **Build command:** `bun run build` (or `npm run build`)
   - **Build output directory:** `dist`

### 3. Configuring Production Environment Variables
Cloudflare needs to know how to securely route network requests back to your Nhost backend. In the Cloudflare Pages settings (under **Settings > Environment variables**), explicitly add your Nhost production identifiers:

- `VITE_NHOST_SUBDOMAIN` = `[your-nhost-project-subdomain]`
- `VITE_NHOST_REGION` = `[your-nhost-region]` (e.g., `eu-central-1`)

Because these variables are statically bundled during the `Vite` build step, Cloudflare will firmly embed them inside your production Javascript, seamlessly linking your global edge frontend to the dedicated Nhost backend.

---

## The Workflow Loop

Once established, deployment is entirely automated constraint-free:

1. `git push origin main`
2. **Cloudflare Pages** detects the push, initiates the Vite build, and deploys `/dist` to the global edge network.
3. **Nhost** detects the push identically, migrating Postgres, syncing Hasura, and patching serverless components.
