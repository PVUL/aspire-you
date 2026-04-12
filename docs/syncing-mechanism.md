# Syncing Mechanism: The Tri-State Architecture

**Date:** 2026.04.12

Aspire You is designed around a strictly enforced, local-first **Tri-State Synchronization Architecture**. Because the application bridges three distinct domains—zero-latency offline availability, a global social graph, and sovereign data ownership—every feature must respect clear guidelines governing where data lives and when it synchronizes.

This document serves as the foundational rulebook for all future architecture and implementation decisions regarding data persistence.

---

## 1. The Three Layers of State

### Layer 1: Browser SQLite (OPFS) - *Speed & Availability*
- **Role:** The primary read surface and optimistic write layer.
- **Environment:** In-browser SQLite WASM leveraging the Origin Private File System (OPFS).
- **Purpose:** To completely bypass network latency. All interface renders immediately pull from SQLite, ensuring the application feels instant and remains accessible completely offline or on poor network connections. State is instantly mutated here before trailing side-effects hit the network.

### Layer 2: Nhost Database (Hasura/Postgres) - *Global Discovery & Relational Timelines*
- **Role:** The global switchboard and social graph.
- **Environment:** Nhost backend via GraphQL.
- **Purpose:** Tracks relational timelines (`edges`), aggregated counts (`members_aggregate`), and orchestrates network discovery. It does not store huge blobs of personal content; it stores structured metadata needed to connect users and entities (like finding Communities).

### Layer 3: GitHub Vault (GitOps) - *Sovereign Truth & Long-Form Content*
- **Role:** The ultimate source of truth.
- **Environment:** A user's personal GitHub repository (the "Vault") or Organization repositories (GitLab/GitHub) orchestrated via Octokit.
- **Purpose:** All meaningful user content, community documents, and structural hierarchies exist here as Markdown files and Git Submodules. This guarantees that if Nhost disappeared tomorrow, the user retains 100% of their data in a clean, human-readable file system.

---

## 2. Synchronization Scenarios & Workflows

When designing a feature, map its persistence strategy against the scenarios below:

### Scenario A: Local ⟷ Cloud DB (Nhost)
**Use Case:** Highly relational, lightweight tracking, or global social interactions.
- **Examples:** Modifying a timeline edge (e.g., updating `community_status` to `archived`), "Liking" a concept, tallying membership aggregates.
- **Workflow:** 
  1. Optimistic write directly to local SQLite.
  2. Background GraphQL mutation to Nhost. 
  3. UI updates instantly while the network request resolves silently.

### Scenario B: Local ⟷ Sovereign Vault (GitHub)
**Use Case:** Updating long-form content, personal journaling, or internal configuration where global discovery is completely irrelevant.
- **Examples:** Writing a new journal entry, editing private onboarding notes in a community's localized `README.md`, altering personal directory file structures.
- **Workflow:** 
  1. File representation saved directly to OPFS SQLite cache.
  2. Synchronization pipeline commits via Git (using isomorphic-git or API wrappers) pushing strictly to the GitHub Vault.
  3. No Nhost database hits necessary.

### Scenario C: Simultaneous Tri-State Sync (Local + Vault + DB)
**Use Case:** Core entity creation or major structural pivots where a local component impacts global discovery *and* dictates physical data storage.
- **Examples:** Creating a new Community (`provision_community`), joining an existing community.
- **Workflow:**
  1. **Vault (GitHub):** The provisioning function spins up a remote repository for the community, generates its Markdown scaffolding (e.g., `README.md`, `contributors/`), and binds it as a Git submodule inside the user's root vault.
  2. **DB (Nhost):** Identical defining metadata is simultaneously pushed to the Postgres `communities` and `edges` tables, assigning ownership and triggering global visibility so others can discover the community.
  3. **Local (SQLite):** Finally, SQLite pulls this structural definition down to instantly route the user to their new Community Dashboard without waiting for a complex multi-server round-trip UI reload.

---

## 3. Guiding Principles for Future Implementations

1. **Never Block on the Cloud:** Unless an operation performs critical validation (e.g., enforcing uniqueness guarantees or charging Stripe credits), the UI must run off optimistic SQLite writes. If you pull the physical ethernet cable out of the machine during usage, the application UI should not crash.
2. **Postgres is for Links, Git is for Ink:** Do not stuff multi-paragraph documents into PostgreSQL JSONB columns. Structured text, journaling, statements, and manifestos belong in Git blobs. Postgres handles the relational pointers between them.
3. **If It Fails, Revert Locally:** The syncing mechanism must always observe backend resolution. If an optimistic SQLite write is rejected by GitHub (merge conflict) or Nhost (permission constraint), the local state must quietly rollback and gracefully alert the user.

*(Future additions regarding background WebWorker queueing strategies for offlined actions will append here).*
