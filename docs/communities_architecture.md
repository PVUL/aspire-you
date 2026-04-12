# Communities Architecture

2026.04.12

The Communities platform within Aspire is designed around an optimized **Hybrid Architecture** (combining strict relational columns with a polymorphic graph database for timelines) rather than rigid pure-relational mappings. Instead of hardcoding explicit join tables for every possible fleeting association, we rely on an `edges` table for flexible history, and use `Views` to optimize the read paths.

## Data Model

1. **First-Class Entities**:
   - `communities`: Represents the central hub nodes. Now features `current_mission_id` as a direct temporal pointer for O(1) query performance.
   - `values`: Philosophies, operating principles, or analytical traits (tracked via `name`).
   - `missions`: Actionable states or objectives (e.g., "Empower 1,000 thinkers").
   - `users`: Managed via the Nhost Auth framework.
   - `community_members`: The sole, concrete junction table tracking all explicit memberships (completely replacing the deprecated `member_of` edge view), natively mapped via Hasura array relationships to return rapid, automatic scalar aggregates (`members_aggregate`).

2. **The Polymorphic Graph layer (`edges`)**:
   We retain `edges` as the **timeline engine**, ensuring history is never destroyed.
   - **Temporal Aspect**: `start_date` and `end_date` track historical lifecycles. When a community updates its mission, the old `adopts_mission` edge is capped with an `end_date`, and a new edge is inserted.
   - **Status Audits**: Instead of hard-deleting records, communities transition via a strict `status` column (`active` -> `archived`). Every discrete lifecycle change is concurrently logged as a `community_status_change` edge, providing immutable audit trails.
   - **`metadata`**: A JSONB column allowing schema-less extensions.

3. **Read Optimization Layer (Views)**:
   - `community_current_values`: A virtual PostgreSQL View joining `edges` (where `type='embodies_value'` and `end_date IS NULL`) to `values`. This enables flat, blazing-fast GraphQL queries without complex graph traversal logic on the client.

## Why This Hybrid Implementation?

### 1. Developer Ergonomics vs Flexibility
Our earlier "pure-edge" design offered infinite graph flexibility but resulted in terrible frontend Developer Experience (DX), requiring the client to stitch targets together. The Hybrid design gives us O(1) direct reads for hot paths (e.g. `community { current_mission { statement } }`) while retaining the `edges` table to spin up zero-migration schema-less properties (e.g. `sponsored_by`).

### 2. Temporal State & "Snapshots"
Because community dynamics constantly evolve, standard tables map state only in the *present*. Our graph maps state across *time*. Setting an `end_date` gracefully archives an interaction without destroying analytical integrity. The hybrid design automates this: updating a mission triggers a dual-write that updates the pointer and archives the timeline edge.

### 3. Local-First Integration (Vault + OPFS)
We synchronize the raw structured data via GraphQL (for fast remote aggregation), but we immediately serialize interactions into Markdown files inside the user's Github Vault. 
- *Why local SQLite?* When a user creates or modifies a community, we optimistically write straight to OPFS SQLite. The Nhost backend triggers a sync, but the local device never blocks waiting for the cloud. State is rendered blazingly fast.

### 4. Zero Data Drift
By using a PostgreSQL View (`community_current_values`) instead of storing an array of UUIDs directly on the `communities` table, we completely eliminate data synchronization drift. The view natively computes exactly what is active in the `edges` layer, tricking Hasura into providing a beautiful API while keeping our data perfectly normalized.

## Submodule Architecture: Vault & Repository Orchestration
As opposed to traditional platforms where a community is merely a row in a relational database, an **Aspire You Community** is a standalone, sovereign entity backed by a GitHub repository.

### Community Repositories
Each community operates its own standalone repository (private, owned by the creator) named strictly after the `{community name}`. This encapsulates all the community's context out of a single user's vault to ensure independent scale.
- **`README.md`**: Declares this as an `aspire.you` community and contains the core **mission** and **values** established at creation.
- **`contributors/`**: A top-level directory storing information about contributors.
- **`members.md`**: A list of standard community members.
- **`owners.md`**: A list of community owners (the creator is appended by default).

*Note: Creation and initial structural seeding of this repository are orchestrated safely by an Nhost Edge Function using Octokit and the user’s GitHub Access Token.*

### User Vaults
Communities a user belongs to are embedded structurally inside their personal GitHub-backed vault under the root `communities/` path, not as files, but as **submodules**. 
- **Active Directory:** `communities/active/{community}`
   - The community's remote GitHub repository is linked securely here as a Git Submodule.
   - We explicitly pair the submodule alongside a local `README.md` containing private onboarding inputs, logging *why* the user joined, what they hope to contribute, and what they hope to get out of it.
- **Archived Directory:** `communities/archived/{community}`
   - If a community is deleted via the GUI, it shifts gracefully over to the archive directory as a static snapshot—preserving the user's analytical timeline gracefully.
   - Note: The deprecated `my-communities` root directory approach has been wholly replaced by this submodule orchestration.

## Lifecycle & Drafting Pipeline 

A community goes through three status checkpoints to govern viewing rights and persistence behaviors:

1. **`draft` (Default):**
   - The community has been scaffolded but remains invisible to the global community feed.
   - Visibility is restricted internally to the `owners`. 
   - A distinct UI presentation alerts users they are navigating a local workspace. 
   - Operations follow a local-first SQLite pattern: alterations happen securely on OPFS first and are pushed to the community repository via the manual pull/push model.
   - Routing: Accessed via the standard `/communities/{slug}` endpoint. View logic cleanly gates the UI into full "editing" bounds. 

2. **`active`:**
   - Owners affirmatively map the community out into the public registry.
   - Pushes manifest syncs back to Hasura GraphQL so global graphs populate relationships, pushing it dynamically to other user feeds for discovery.

3. **`archived`:**
   - Shut down or permanently disabled via soft-delete database methods.
   - The UI replaces the standard hard "Delete" function with a state transition (updating `status = 'archived'` and injecting a `community_status_change` edge) coupled with migrating the target repository locally to the `archived/` directory. This guarantees personal insights remain fully mapped to this entity.

## Gotchas & Hard-Won Lessons

- **Permission Silos**: Initially, users could only query the `edges` table where they were the explicit `source_id` or `target_id`. Because `embodies_value` explicitly defines the Community as the `source_id`, all UI fetches flatlined to zero for the end user. We fixed this by elevating `embodies_value` and `adopts_mission` into the public-read query layer.
- **Recursive CTE Breakdown**: PostgreSQL throws a strict `42P19` query error if multiple non-recursive `UNION` branches cascade in recursive graph traversal. We consolidated them down to single conditional statements (`target_id IN ...`).
- **Graphql Aggregation Masks**: The Hasura `edges_aggregate` node defaults to hidden if `allow_aggregations` token checks aren't explicitly enabled per user role inside the active metadata manifest. 
- **Array Relationship Defaults over Custom Computed Fields**: Attempting to bind custom `INT` PostgreSQL functions (`member_count`) directly to row payloads natively clashed with Hasura metadata chronology during local development syncing. We radically simplified the count pipeline by leaning backwards into pure structural schema matching: renaming the junction array relationship from `community_members` strictly to `members` automatically spins up zero-migration `members_aggregate` fields exactly identical in capability.
- **Silent Database Writes via Dead Views**: The initial `community_members` node was mapped as a proxy PostgreSQL VIEW wrapper over legacy `member_of` timeline edges. Since the DB actively constrained `member_of` writes, all network provisions succeeded outwardly but completely ghosted internal membership writes, forcing `0 active members` across the board post-creation. Mapping it as a strict, hard junction table solved all API writes instantly!

## Next Steps

1. **Algorithmic Discovery (Matching System)**: 
   Leverage the graph dynamically. If `User A` embodies values `['Deep Work', 'Focus']`, calculate intersection weights against `Communities` embodying the exact same targets.
2. **Historical Timeline Views**: 
   Build UI components that trace `edges` where `end_date IS NOT NULL`. Show a user their lifecycle mapping—"You adopted the Focus value on Tuesday, and joined the Quiet Cohort on Wednesday."
3. **Role-Based JSONB Metadata**: 
   Flesh out the frontend implementation to consume `edges.metadata -> 'role'`, elevating UI elements automatically if a user is an 'admin' or 'moderator' of a community instead of a base member.