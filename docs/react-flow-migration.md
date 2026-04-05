# Technical Specification: Dashboard Migration to React Flow (Locked Canvas Phase)

## 1. Overview & Objective
This document outlines the strategy for migrating our current dashboard infrastructure to be powered by **React Flow**. The primary objective of the initial phase is to replace the underlying dashboard rendering engine with a React Flow canvas **without altering the user experience**. 

The canvas will be entirely locked down—disabling all panning, zooming, dragging, and selecting. To the user, the dashboard will look and feel exactly like the current static UI. This establishes the foundation required to unlock infinite canvas features (visual programming, node connections, spatial organization) in subsequent phases.

## 2. Phase 1: The "Invisible" Canvas

The goal is to implement React Flow as the layout engine while completely hiding its canvas nature.

### 2.1 React Flow Configuration (The "Locked" State)
To achieve a completely static UI, we will mount the `<ReactFlow>` component with the following explicit restrictions to disable its default features:

```jsx
<ReactFlow
  nodes={nodes}
  edges={edges}
  nodeTypes={nodeTypes}
  // --- Lock Camera & Position Constraints ---
  panOnDrag={false}
  panOnScroll={false}
  zoomOnScroll={false}
  zoomOnPinch={false}
  zoomOnDoubleClick={false}
  nodesDraggable={false}
  nodesConnectable={false}
  nodesFocusable={false}
  elementsSelectable={false}
  preventScrolling={false} // Allows standard page scrolling to work over the canvas
  // ------------------------------------------
  proOptions={{ hideAttribution: true }} // Hide React Flow watermark (requires Pro or can be handled per license)
>
  {/* No Background, Minimap, or Controls rendered in phase 1 */}
</ReactFlow>
```

### 2.2 Styling and The Illusion
- **Hide UI Artifacts:** Ensure that Default handles (the connection dots on nodes) are either not rendered in our custom nodes or are completely hidden via CSS (`opacity: 0` or `display: none`).
- **Background:** Do not render the `<Background>` component (e.g., dots or grid). The canvas background should transparently inherit the current app's background color.
- **Scroll Hijacking:** Setting `preventScrolling={false}` is critical. When the user scrolls over the dashboard, the browser window should scroll normally, preserving the "standard web page" feel rather than a capturing canvas window.

## 3. Architecture & Data Modeling

### 3.1 Mapping Current UI to Nodes
Instead of dumping the entire dashboard into a single node, we should separate the existing dashboard widgets/cards into distinct individual Custom Nodes. 

- **Custom Node Types:** Create a wrapper node (e.g., `DashboardWidgetNode`) that takes our existing React components as children.
- **Node Data Schema:**
  ```typescript
  type NodeData = {
    widgetType: 'chart' | 'list' | 'metric';
    widgetProps: any; // Props passed down to the original component
  };
  ```

### 3.2 Layout & Positioning Strategy (The Hardest Part)
Since React Flow uses absolute `(x, y)` positioning rather than CSS Flexbox or Grid, we must calculate the layout to mimic the current design.

**Approach options:**
 1. **Static Calculation:** If the dashboard has a fixed grid, hardcode or calculate `(x, y)` positions based on index and standard block widths.
 2. **Auto-Layout integration (Recommended):** Use a library like `dagre` or a custom lightweight grid calculation function that processes the nodes matrix and assigns `position: { x, y }` to each node before passing them to React Flow. This ensures responsive column wrapping behaves as expected when the window resizes.

### 3.3 State Management
Continue using the existing state management (Zustand, Context, or RTK) for business logic. Synchronize the dashboard layout elements with the React Flow `useNodesState` and `useEdgesState` hooks. 

## 4. Migration Execution Steps

 1. **Setup Custom Node Wrapper:** Create a React Flow custom node that simply renders the existing, unmodified Dashboard Card components.
 2. **Translate State:** Write a selector/transformer that takes the current dashboard array state and maps it to a React Flow `Node[]` array, applying the calculated static `(x, y)` positions.
 3. **Swap the View:** Replace the current CSS Grid/Flex `<div>` container with the `<ReactFlow>` component, utilizing the locked props defined in 2.1.
 4. **CSS Audit:** Thoroughly inspect the DOM to ensure no blue outlines on click, no node selection borders, and no stray SVG handles are visible.
 5. **Responsiveness Check:** Implement a resize observer or window resize listener to recalculate and update node `(x, y)` positions if the dashboard previously relied on CSS media queries for changing column counts.

## 5. Phase 2: Future "Unlock" Roadmap

Once the locked canvas is stable in production, transitioning to an infinite canvas becomes trivial:

 1. **Flip the Switches:** Change `panOnDrag`, `zoomOnScroll`, and `nodesDraggable` to `true`.
 2. **Add Visual Affordances:**
    - Introduce the `<Background />` component (dots or lines) so users understand they can pan.
    - Add `<MiniMap />` and `<Controls />` (zoom in/out buttons) to the viewport corners.
 3. **Persist Coordinates:** Update the backend/database to save the custom `(x, y)` coordinates of nodes when a user drags them.
 4. **Introduce Handles & Edges:** Add React Flow `<Handle />` components to the UI cards and turn on `nodesConnectable={true}` to allow users to draw relationships between dashboard elements.
