# Communities Architecture

## Overview
The Communities platform within Aspire is designed around a flexible, temporal **polymorphic graph database architecture** rather than rigid relational mappings. Instead of hardcoding explicit join tables for every possible association (e.g., `community_members`, `community_values`), we rely on an `edges` table.

## Data Model

1. **First-Class Entities**:
   - `communities`: Represents the central hub nodes.
   - `values`: Philosophies, operating principles, or analytical traits (tracked via `core_term`).
   - `missions`: Actionable states or objectives (e.g., "Empower 1,000 thinkers").
   - `users`: Managed via the Nhost Auth framework.

2. **The Polymorphic Graph (`edges`)**:
   All relationships in the system are governed by the `edges` table.
   - **`source_id`**: The entity initiating the relationship (UUID).
   - **`target_id`**: The entity receiving the relationship (UUID).
   - **`type`**: The enum defining the interaction (e.g., `member_of`, `embodies_value`, `adopts_mission`, `partner_with`, `in_cohort`).
   - **Temporal Aspect**: `start_date` and `end_date` track historical lifecycles implicitly. If `end_date` is null, the edge remains active.
   - **`metadata`**: A JSONB column allowing highly extensible schema-less data (e.g., setting a user's role to '{ "role": "moderator" }').

## Why This Implementation?

### 1. Extensibility Without Schema Migrations
If we want to introduce a new relationship—for example, letting users adopt a core value (`user -> embodies_value -> value`) or letting communities sponsor cohorts (`community -> sponsor_of -> cohort`)—we do not need to create new junction tables. We simply add a new string to the `edge_type` ENUM. 

### 2. Temporal State & "Snapshots"
Because community dynamics constantly evolve, missions are achieved and users leave. Standard tables map state in the *present*. Our graph maps state across *time*. Setting an `end_date` gracefully archives an interaction without destroying the local analytical integrity (e.g., "How many active users were mapped to this mission during Q3?").

### 3. Local-First Integration (Vault + OPFS)
We synchronize the raw structured data via GraphQL (for fast remote aggregation), but we immediately serialize interactions into Markdown files inside the user's Github Vault. 
- *Why local SQLite?* When the user presses "Join Community", we optimistically write straight to OPFS SQLite. The Nhost backend triggers a sync, but the local device never blocks waiting for the cloud. State is rendered blazingly fast.

### 4. Avoiding N+1 Query Traps
To hydrate the UI grid cards with missions and values without triggering 50 consecutive serverless requests, we process global queries: fetching all distinct node UUIDs first, running standard `_in` arrays against Hasura, and mapping them back via a shared memory map to avoid blocking database roundtrips.

## Gotchas & Hard-Won Lessons

- **Permission Silos**: Initially, users could only query the `edges` table where they were the explicit `source_id` or `target_id`. Because `embodies_value` explicitly defines the Community as the `source_id`, all UI fetches flatlined to zero for the end user. We fixed this by elevating `embodies_value` and `adopts_mission` into the public-read query layer.
- **Recursive CTE Breakdown**: PostgreSQL throws a strict `42P19` query error if multiple non-recursive `UNION` branches cascade in recursive graph traversal. We consolidated them down to single conditional statements (`target_id IN ...`).
- **Graphql Aggregation Masks**: The Hasura `edges_aggregate` node defaults to hidden if `allow_aggregations` token checks aren't explicitly enabled per user role inside the active metadata manifest. 

## Next Steps

1. **Algorithmic Discovery (Matching System)**: 
   Leverage the graph dynamically. If `User A` embodies values `['Deep Work', 'Focus']`, calculate intersection weights against `Communities` embodying the exact same targets.
2. **Historical Timeline Views**: 
   Build UI components that trace `edges` where `end_date IS NOT NULL`. Show a user their lifecycle mapping—"You adopted the Focus value on Tuesday, and joined the Quiet Cohort on Wednesday."
3. **Role-Based JSONB Metadata**: 
   Flesh out the frontend implementation to consume `edges.metadata -> 'role'`, elevating UI elements automatically if a user is an 'admin' or 'moderator' of a community instead of a base member.
