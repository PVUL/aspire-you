# GraphQL API Guide: Aspire-You Hybrid Architecture

This document provides a brief overview of our Hybrid Data Architecture for Communities, Missions, and Values, along with real-world GraphQL queries you can use directly in your frontend application.

## Data Structure Overview

We shifted from a "pure-edges" graph structure to a hybrid setup that provides O(1) reads for current active elements while preserving our robust temporal/historical tracking. 

* **`communities`**: The core entity.
  * **Current Mission (`current_mission_id`)**: A direct 1:1 foreign key pointer to `missions.id`. This is dual-written alongside an edge record.
  * **Current Values (`community_current_values`)**: A purely virtual Postgres View that flattens our many-to-many Nhost schema. It joins `edges` (where `end_date IS NULL`) with `values`.
* **`edges`**: The absolute source of truth for **temporal history**. Missions and Values track their history and lifespan (`start_date`, `end_date`) here.
* **`community_members`**: The sole unified boundary for all access control and memberships. 

---

## Example Queries

### 1. The Fast Dashboard Query (Hot Path)
Use this when you need to render a Community page instantly displaying the community's details, active mission, and current values, without needing to perform array filtering or target mapping.

```graphql
query GetCommunityDashboard($slug: String!) {
  communities(where: { slug: { _eq: $slug } }) {
    id
    name
    slug
    is_public
    # Fast 1:1 direct lookup
    current_mission {
      id
      statement
      status
    }
    # Handled securely via Postgres View optimizations
    current_values {
      value_id
      name
      description
      start_date
    }
  }
}
```

### 2. Historical Timeline Query (Edges Engine)
Use this when you want to show the history/timeline of a community. Because we kept `edges`, we can still perform complex historical timeline traces.

```graphql
query GetCommunityHistory($slug: String!) {
  communities(where: { slug: { _eq: $slug } }) {
    # Assuming standard object relations on edges are setup in Hasura
    historical_missions: mission_edges(order_by: { start_date: desc }) {
      start_date
      end_date
      target_mission {   
        id
        statement
      }
    }
  }
}
```

### 3. Fetching User Enrolled Communities
Leveraging the cleanup of memberships natively into `community_members`.

```graphql
query GetUserCommunities($userId: uuid!) {
  community_members(where: { user_id: { _eq: $userId } }) {
    joined_at
    community {
      id
      name
      slug
      current_mission {
        statement
      }
    }
  }
}
```

## Mutations Strategy

Because we operate a hybrid model, **Writes** often involve our Edge engine. When updating a mission or value:
1. First, terminate the legacy relationship in `edges` by setting `end_date = NOW()`.
2. Insert a new target (or point to an existing one) in `edges`.
3. (For Missions) update `current_mission_id` directly on the `communities` table.

Values do not require a dual-write (Postgres Views handle that automatically), but they still require `edges` inserts!
