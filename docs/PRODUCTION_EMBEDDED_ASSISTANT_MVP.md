# Production Embedded PMS/Purchase Voice Assistant MVP

## Product Goal

Build an AI operations assistant embedded directly inside Mazik PMS Link and Purchase Link. The assistant should behave like a trained operator: understand voice or text, navigate to the correct module, fetch live records, prepare the requested action, show the exact human-readable draft, and execute only after the logged-in user confirms.

The production product must not depend on sample prompts. Sample prompts are only training wheels. The real system must use intent routing, live page context, API tools, and audited confirmation flows.

## System Architecture

```text
Mazik PMS / Purchase UI
  |
  | embeds
  v
Atlas Embedded Assistant Widget
  - push-to-talk / text command
  - current page context
  - result drawer
  - confirmation panel
  - row highlighting
  |
  | HTTPS
  v
Atlas Orchestrator API
  - speech transcription
  - language normalization
  - intent planner
  - tool routing
  - action draft builder
  - approval gate
  - audit logging
  |
  | Mazik API session / service integration
  v
Mazik PMS API + Purchase API
  - maintenance forecast
  - defects
  - certificates
  - requisitions
  - inventory/spares/stores
  - purchase orders
  - material receipts
  - quotations
  |
  v
Operational Database
  - tenant config
  - users and roles
  - assistant runs
  - action drafts
  - confirmations
  - audit trail
  - feedback and corrections
```

## Execution Model

1. User opens PMS Link or Purchase Link.
2. Mazik shell loads the embedded assistant widget.
3. Widget sends current route, system, vessel, user, and selected row context to `/api/embedded/plan`.
4. Orchestrator identifies target module and action.
5. Host app navigates to the target page if needed.
6. Widget calls `/api/copilot/query`.
7. Orchestrator fetches live data from Mazik APIs and returns a readable UI result.
8. For write actions, Orchestrator returns a draft, not a submission.
9. User confirms.
10. Widget calls `/api/copilot/confirm`.
11. Orchestrator submits to Mazik and stores the full audit trail.

## Safety Rules

- Read-only requests can execute immediately.
- Write requests always produce drafts first.
- Confirmed write requests must include user ID, tenant ID, source page, payload hash, and visible review fields.
- The assistant must never silently close jobs, raise requisitions, approve quotes, postpone defects, or alter certificates.
- All actions must be idempotent where possible.
- Every AI decision must be traceable to a tool call, page context, or user confirmation.

## Minimal Scalable File Structure

```text
apps/
  api/
    src/
      server.js
      lib/
        copilot.js                 # existing PMS/Purchase tool execution
        embedded-assistant.js      # embedded shell planning contract
        pmslink-client.js          # Mazik API client
        settings.js
  web/
    src/
      App.tsx                      # current demo UI
packages/
  assistant-widget/
    src/
      AtlasAssistant.tsx           # production embedded component
      voice/
        recorder.ts
        transcription-client.ts
      shell/
        mazik-shell-adapter.ts     # host route/session/row adapter
      state/
        assistant-store.ts
      ui/
        AssistantOrb.tsx
        ResultDrawer.tsx
        ConfirmationPanel.tsx
        PageHighlighter.tsx
  contracts/
    src/
      api.ts                       # shared request/response types
      actions.ts
      mazikevents.ts
infra/
  docker/
  railway/
  migrations/
docs/
  PRODUCTION_EMBEDDED_ASSISTANT_MVP.md
```

The current repository now includes the first backend contract in `apps/api/src/lib/embedded-assistant.js`.

## Database Schema

Use PostgreSQL for production. R2 can store generated reports, uploaded attachments, transcript audio if required, and exported evidence files. The core operational truth should be in Postgres.

```sql
create table tenants (
  id uuid primary key,
  name text not null,
  pms_base_url text not null,
  purchase_base_url text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  external_user_id text not null,
  display_name text,
  email text,
  role text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, external_user_id)
);

create table assistant_sessions (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid not null references users(id),
  system_key text not null check (system_key in ('pms', 'purchase')),
  source_route text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table assistant_runs (
  id uuid primary key,
  session_id uuid not null references assistant_sessions(id),
  user_prompt text not null,
  normalized_prompt text,
  language_code text,
  target_system text not null,
  target_page text not null,
  action_name text not null,
  safety_level text not null,
  status text not null,
  model_name text,
  created_at timestamptz not null default now()
);

create table tool_calls (
  id uuid primary key,
  run_id uuid not null references assistant_runs(id),
  tool_name text not null,
  system_key text not null,
  request_payload jsonb,
  response_summary jsonb,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table action_drafts (
  id uuid primary key,
  run_id uuid not null references assistant_runs(id),
  action_name text not null,
  target_record_type text not null,
  target_record_id text,
  visible_review_fields jsonb not null,
  technical_payload jsonb not null,
  payload_hash text not null,
  status text not null default 'pending_confirmation',
  created_at timestamptz not null default now()
);

create table action_confirmations (
  id uuid primary key,
  draft_id uuid not null references action_drafts(id),
  confirmed_by uuid not null references users(id),
  confirmation_text text,
  confirmation_result jsonb,
  status text not null,
  confirmed_at timestamptz not null default now()
);

create table audit_events (
  id uuid primary key,
  tenant_id uuid not null references tenants(id),
  user_id uuid references users(id),
  event_type text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table assistant_feedback (
  id uuid primary key,
  run_id uuid not null references assistant_runs(id),
  rating int check (rating between 1 and 5),
  correction_text text,
  created_at timestamptz not null default now()
);
```

## API Endpoints

Current implemented backend endpoints:

```text
GET  /api/embedded/manifest
POST /api/embedded/plan
POST /api/voice/transcribe
POST /api/copilot/query
POST /api/copilot/confirm
GET  /api/bootstrap
POST /api/auth/login
POST /api/auth/logout
```

Production endpoints to add next:

```text
POST /api/assistant/sessions
POST /api/assistant/runs
POST /api/assistant/runs/:runId/tool-calls
POST /api/assistant/drafts/:draftId/confirm
POST /api/assistant/feedback
GET  /api/assistant/audit
GET  /api/tenants/:tenantId/config
PUT  /api/tenants/:tenantId/tools
POST /api/reports/generate
GET  /api/reports/:reportId/download
```

## UI Architecture

### Embedded Widget

The production UI should be a small assistant orb inside the Mazik header or lower-right corner.

States:

- Idle: small orb with "Ask Atlas".
- Listening: glowing orb, transcript appears live.
- Planning: "Taking you to Maintenance Forecast" or "Opening Purchase Requisition".
- Reading: table/result drawer.
- Drafting: confirmation panel with human-readable fields.
- Confirmed: success receipt with Mazik record number.
- Error: clear recovery instruction.

### Result Drawer

The drawer should appear inside the PMS/Purchase app, not as a separate website. It should show:

- What the assistant understood.
- Which page/module it used.
- Live rows or selected record.
- Suggested next action.
- Confirmation buttons for write actions.

### Host Shell Adapter

Mazik frontend should expose:

```ts
type MazikShellAdapter = {
  getCurrentUser(): Promise<{ userId: string; tenantId: string; roles: string[] }>;
  getCurrentRoute(): string;
  getCurrentSystem(): "pms" | "purchase";
  getSelectedRecord(): unknown;
  getMazikSession(): Promise<{ token?: string; cookies?: string[] }>;
  navigateToRoute(route: string): Promise<void>;
  highlightRows(rowIds: string[]): void;
  showConfirmationDialog(input: ConfirmationInput): Promise<boolean>;
};
```

This is the key to making the assistant act like a real user inside the product without brittle browser automation.

## Voice Model Strategy

Do not start with training a custom voice model. Start with high-quality multilingual transcription and domain prompting.

MVP voice pipeline:

1. Browser records audio with noise suppression and echo cancellation.
2. Audio is sent to `/api/voice/transcribe`.
3. Transcription prompt includes maritime terms, vessel names, components, job codes, requisitions, defects, certificates, and procurement words.
4. Text is normalized to English.
5. Intent planner routes to PMS/Purchase tools.
6. User correction is stored in `assistant_feedback`.

Later improvements:

- Tenant-specific vocabulary: vessel names, component names, stores, spares, vendor names.
- Phrase correction table: "world" -> "overdue" in maintenance context.
- Accent feedback loop by vessel/fleet.
- Optional fine-tuned intent classifier, not speech model, once enough labeled commands exist.

## Tool Strategy

Production should use this order:

1. Official Mazik API endpoint.
2. Captured internal Mazik API endpoint with stable contract.
3. Frontend shell adapter for page navigation and row highlighting.
4. DOM automation only as a last-resort bridge for legacy screens.

DOM automation should not be the primary production architecture. It is brittle and difficult to certify. The assistant can feel like it is using the UI while the actual execution goes through API tools.

## Example Embedded Flow

Prompt:

```text
Compare vendor quotes for the fire extinguishing requisition and recommend the best supplier.
```

Plan:

```json
{
  "targetSystem": "purchase",
  "targetPage": {
    "key": "quoteComparison",
    "route": "/ExtractedQuotation/ExtractedQuotation"
  },
  "action": "quote_comparison",
  "executionMode": "read_and_present",
  "confirmationRequired": false
}
```

Execution:

1. Navigate Purchase Link to extracted quotation page.
2. Fetch requisition and quotation data.
3. Compare vendors by landed cost, delivery, compliance, and payment terms.
4. Present recommendation.
5. If user says "approve vendor 2", create a draft and require confirmation.

## Production MVP Build Plan

### Phase 1: Embedded Read Assistant

- Add assistant widget to PMS/Purchase header.
- Support voice/text command.
- Support maintenance, defects, certificates, requisitions, PO/material receipt, quote comparison.
- Navigate pages and show results.
- No write actions yet.

### Phase 2: Drafted Write Actions

- Close maintenance.
- Postpone maintenance/defects.
- Raise requisition from inventory/spares/stores.
- Prepare quote recommendation.
- Require confirmation for every write.

### Phase 3: Persistent Storage and Audit

- Add Postgres.
- Store runs, tool calls, drafts, confirmations, feedback.
- Add R2 for generated reports and attachments.

### Phase 4: Enterprise Controls

- Tenant configuration.
- RBAC mapping to Mazik roles.
- Approval workflow.
- Rate limits.
- Admin dashboard.
- Observability.

### Phase 5: Marketplace Plugin

- Package widget as script tag, iframe, and React component.
- Sell as plugin for PMS/procurement systems beyond Mazik.
- Add connector SDK for each PMS/procurement vendor.

## Production Readiness Checklist

- Multi-tenant isolation.
- Role-based action permissions.
- Audit log for every request.
- No write without confirmation.
- Tool call retries with idempotency keys.
- PII and credential encryption.
- Request timeout and circuit breaker per Mazik endpoint.
- Structured logs and error tracking.
- Load testing for high-volume fleets.
- Feature flags per customer.
- Tenant-specific vocabulary.
- User feedback correction loop.

## What Is Implemented Now

Backend code added:

- `apps/api/src/lib/embedded-assistant.js`
- `GET /api/embedded/manifest`
- `POST /api/embedded/plan`

These are the first contracts needed for the real embedded app. The host PMS/Purchase UI can call these endpoints to decide where to navigate and how to execute the assistant flow.
