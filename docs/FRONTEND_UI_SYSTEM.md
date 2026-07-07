# Frontend UI System

## Goal

Create a reusable, production-grade UI foundation for Atlas VoiceOps without changing product behavior. The current app now separates product state, API calls, reusable UI primitives, and data presentation components.

## Component Architecture

```text
apps/web/src/
  App.tsx
  components/
    presentation/
      DataTable.tsx
      DetailGrid.tsx
      PayloadView.tsx
      PresentationRenderer.tsx
      SummaryGrid.tsx
    ui/
      AssistantOrb.tsx
      Button.tsx
      Field.tsx
      SectionCard.tsx
      StateNotice.tsx
      StatusChip.tsx
  lib/
    api-client.ts
    formatters.ts
    session-storage.ts
  types/
    copilot.ts
```

## Architecture Breakdown

### `App.tsx`

- Owns product state and orchestration.
- Owns voice lifecycle and query mutations.
- Delegates rendering to reusable components.
- Does not define API helpers, shared types, or presentation internals anymore.

### `components/ui`

Small, reusable primitives:

- `Button`: standard variants and icon support.
- `SectionCard` / `SectionHeader`: page sections and consistent heading layout.
- `InputField` / `TextareaField`: accessible form controls with `htmlFor`.
- `StatusChip` / `LoaderChip`: compact status indicators.
- `AssistantOrb`: reusable voice/tap assistant control.
- `StateNotice`: loading/empty/info state surface with `aria-live`.

### `components/presentation`

Reusable data renderers:

- `PresentationRenderer`: selects table/detail/payload/empty rendering.
- `DataTable`: accessible selectable records with selected-record drawer and row actions.
- `SummaryGrid`: KPI/summary tiles.
- `DetailGrid`: detail card grid for record fields.
- `PayloadView`: human-readable action draft review plus optional technical payload.

### `lib`

- `api-client.ts`: API fetch/upload logic with session header injection.
- `session-storage.ts`: browser session persistence.
- `formatters.ts`: JSON, context labels, and prompt-template interpolation.

### `types`

- `copilot.ts`: shared frontend contracts for bootstrap, sessions, presentations, actions, and voice.

## Props / API Design

### Button

```tsx
<Button variant="primary" icon={<KeyRound size={16} />} disabled={isLoading}>
  Login
</Button>
```

Props:

- `variant`: `"primary" | "secondary" | "ghost" | "confirm"`
- `icon`: optional React node
- all native button props

### SectionHeader

```tsx
<SectionHeader
  eyebrow="Parsed Result"
  title={presentation?.title || "Live results will appear here"}
  description="Run a prompt to render live Mazik data."
  actions={<LoaderChip>Working</LoaderChip>}
/>
```

Props:

- `eyebrow`: optional section label
- `title`: required heading text
- `description`: optional supporting copy
- `actions`: right-side controls/status
- `titleAs`: `"h1" | "h2"`

### DataTable

```tsx
<DataTable
  columns={presentation.columns}
  rows={presentation.rows}
  selectedRow={selectedRow}
  selectedRowId={selectedRowId}
  rowActions={presentation.rowActions}
  onSelectRow={setSelectedRowId}
  onRunPrompt={runPrompt}
  interpolateTemplate={interpolateTemplate}
/>
```

Production behavior:

- Empty state when no rows match.
- Keyboard-focusable table region.
- `aria-pressed` row selection.
- Selected record panel with all visible fields.
- Row actions can run prompt templates or open URLs.

### PresentationRenderer

```tsx
<PresentationRenderer
  presentation={presentation}
  selectedRow={selectedRow}
  selectedRowId={selectedRowId}
  hasPendingAction={Boolean(pendingAction)}
  onSelectRow={setSelectedRowId}
  onRunPrompt={runPrompt}
  interpolateTemplate={interpolateTemplate}
/>
```

This is the stable boundary between backend presentation contracts and frontend rendering.

## Loading, Empty, and Edge States

Implemented:

- Loader chip for query/confirm in-progress state.
- Empty state when no presentation exists.
- Empty table message when rows are zero.
- Disabled assistant orb while query/transcription is pending.
- Type-only mode when voice is unavailable.
- Browser fallback when server transcription fails.
- Reduced-motion CSS for users who prefer less motion.
- Visible focus rings for keyboard navigation.

Recommended next:

- Add `ErrorState` component for mutation failures.
- Add toast/notification provider.
- Add table column overflow handling for very wide Mazik records.
- Add skeleton loading for bootstrap and live result tables.

## Production Best Practices

- Keep product state in screen/container components.
- Keep UI primitives stateless and small.
- Keep backend presentation contracts typed in `types/copilot.ts`.
- Use `PresentationRenderer` as the only place that maps backend result type to UI layout.
- Do not embed fetch logic in components.
- Do not duplicate table/detail/payload rendering in future pages.
- Always expose disabled/loading/empty states in component props.
- Preserve keyboard focus visibility and `aria-live` for dynamic assistant responses.

## What Changed

- `App.tsx` is now shorter and focused on orchestration.
- Shared frontend types moved to `types/copilot.ts`.
- API and audio upload logic moved to `lib/api-client.ts`.
- Session persistence moved to `lib/session-storage.ts`.
- Formatting helpers moved to `lib/formatters.ts`.
- Reusable UI and presentation components now exist under `components/`.
