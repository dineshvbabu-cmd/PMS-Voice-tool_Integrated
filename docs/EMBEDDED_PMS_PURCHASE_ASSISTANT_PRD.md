# Product Requirements Document: Embedded PMS and Purchase AI Assistant

## 1. Product Summary

Atlas VoiceOps is an AI assistant embedded directly inside PMS Link and Purchase Link. It helps ship and office users operate maintenance, defect, certificate, requisition, inventory, purchase order, material receipt, and quotation workflows using voice or text.

The assistant must behave like a trained PMS/Purchase user:

- Understand a natural command.
- Identify the correct PMS or Purchase module.
- Navigate or instruct the host page to navigate to the correct screen.
- Fetch live production data from Mazik APIs or current page context.
- Ask clarifying questions when required context is missing.
- Show results inside the existing PMS/Purchase screen as a drawer, modal, or inline panel.
- Prepare write actions as human-readable drafts.
- Execute write actions only after explicit user confirmation.

This product must not rely on saved demo data, fixed prompts, fake quote lines, or standalone windows for production use.

## 2. Problem Statement

PMS and procurement workflows require many clicks, filters, module switches, and domain knowledge. Users often need to:

- Find overdue jobs.
- Identify critical maintenance.
- Read job instructions.
- Close completed jobs.
- Postpone jobs or defects.
- Report defects.
- Track certificates.
- Raise requisitions from spares/stores.
- Follow up purchase orders and material receipts.
- Compare supplier quotations.

Current workflows are slow because users manually navigate pages, remember filters, and interpret tables. A voice/text assistant can reduce clicks, but only if it works with actual production context and asks for missing information instead of guessing.

## 3. Product Goals

- Reduce PMS/Purchase user clicks by at least 50% for common workflows.
- Let users search live production data using natural language.
- Support voice commands from multinational crews with varied English dialects.
- Provide safe write workflows with confirmation before submission.
- Embed inside PMS/Purchase pages instead of operating as a separate application.
- Create a plugin architecture that can later connect to other PMS/procurement products.

## 4. Non-Goals

- The assistant will not silently submit write actions.
- The assistant will not invent operational records or supplier comparisons.
- The assistant will not replace PMS/Purchase access control.
- The assistant will not train a custom speech model in MVP.
- The assistant will not use browser DOM automation as the primary production strategy.

## 5. Target Users

### Vessel Users

- Chief Engineer
- Second Engineer
- Electrical Officer
- Chief Officer
- Master
- Technical Superintendent onboard

Needs:

- Find jobs quickly.
- Read instructions.
- Complete jobs.
- Report defects.
- Raise spare requisitions.
- Track delivery status.

### Shore Users

- Fleet Manager
- Technical Superintendent
- Purchase Executive
- Procurement Manager
- Compliance Manager

Needs:

- Monitor overdue jobs and defects.
- Review requisitions.
- Compare supplier quotations.
- Follow up PO and material receipt.
- View exception lists.

## 6. Core Product Principles

1. Live production data only.
2. Ask before guessing.
3. Confirm before writing.
4. Show results inside the current PMS/Purchase page.
5. Respect existing Mazik roles and permissions.
6. Explain what data was used.
7. Make every action auditable.

## 7. High-Level Architecture

```text
Mazik PMS / Purchase UI
  |
  | embeds assistant widget
  v
Atlas Embedded Assistant UI
  - voice/text input
  - command state
  - results drawer/modal/inline panel
  - confirmation panel
  |
  | HTTPS
  v
Atlas Orchestrator API
  - transcription
  - intent routing
  - missing context detection
  - live tool execution
  - draft generation
  - audit logging
  |
  v
Mazik PMS and Purchase APIs
  - maintenance forecast
  - job detail
  - defects
  - certificates
  - requisitions
  - inventory
  - purchase orders
  - material receipt
  - quotation lines
```

## 8. Deployment Model

### MVP

- Frontend widget hosted by Atlas.
- Backend orchestrator hosted on Railway.
- PMS/Purchase host loads widget using script tag, iframe, or React component.
- Mazik session is passed through host adapter or server-side token exchange.

### Production

- Multi-tenant backend.
- Postgres for audit, sessions, action drafts, feedback.
- Object storage for generated reports and attachments.
- Redis or database session store.
- Observability and structured logging.

## 9. Embedded Host Requirements

The PMS/Purchase host application should expose a shell adapter:

```ts
type MazikShellAdapter = {
  getCurrentUser(): Promise<{ userId: string; tenantId: string; roles: string[] }>;
  getCurrentRoute(): string;
  getCurrentSystem(): "pms" | "purchase";
  getSelectedRecord(): unknown;
  getMazikSession(): Promise<{ token?: string; cookies?: string[] }>;
  navigateToRoute(route: string): Promise<void>;
  openAssistantOverlay(surface: "right_drawer" | "modal_popup" | "inline_page_panel"): void;
  renderAssistantResult(result: AssistantResult): void;
  highlightRows(rowIds: string[]): void;
  showConfirmationDialog(input: ConfirmationInput): Promise<boolean>;
};
```

## 10. UI Requirements

### Placement

The assistant must appear inside PMS/Purchase:

- Header assistant button.
- Floating assistant orb.
- Right-side drawer for results.
- Modal popup for confirmation.
- Optional inline result panel below current grid.

Separate browser windows are not allowed for production.

### Assistant States

- Idle: "Ask Atlas"
- Listening: live voice capture indicator
- Transcribing: converting speech to English
- Planning: identifying module/action
- Fetching: calling live PMS/Purchase data
- Clarification: asking for missing context
- Results: showing live data
- Draft: showing action draft
- Confirming: submitting after approval
- Complete: showing success/failure receipt

### Accessibility

- Keyboard-accessible assistant button.
- Visible focus ring.
- ARIA live region for assistant status.
- All inputs have labels.
- Tables support horizontal scroll and keyboard focus.
- Reduced motion support.

## 11. Voice Requirements

### MVP Voice Strategy

Use high-quality multilingual speech-to-text with maritime vocabulary prompting.

Supported speech patterns:

- Indian English
- Filipino English
- Russian-accented English
- European English
- Australian English
- American English
- Latin American English
- Mixed language plus English maritime terms

The transcription prompt should include:

- vessel names
- components
- machinery names
- job codes
- defect references
- requisition numbers
- purchase order numbers
- stores/spares terminology

### Voice Flow

1. User taps assistant.
2. Browser records audio with noise suppression.
3. Audio is sent to transcription API.
4. Transcript is normalized to English.
5. Intent planner routes command.
6. Assistant asks clarification or fetches live data.

## 12. Intent Coverage

### PMS Link

| Intent | Example | Required Context | Action |
|---|---|---|---|
| Maintenance list | Show overdue critical jobs for Holmes | vessel optional, filter optional | Fetch live maintenance forecast |
| Maintenance detail | Read lifeboat davit yearly inspection | job/component/vessel if ambiguous | Fetch live job detail |
| Close job | Close non return valve job on Holmes | exact job, completion date, remarks, counters if required | Prepare draft, confirm |
| Postpone job | Postpone purifier overhaul by 30 days | exact job, reason, approver, date/frequency | Prepare draft, confirm |
| Defects list | Show open overdue defects | vessel/filter optional | Fetch live defects |
| Certificates | Show certificates due in 30 days | vessel/filter optional | Fetch live certificates |

### Purchase Link

| Intent | Example | Required Context | Action |
|---|---|---|---|
| Requisition list | Show requisitions in PO SEND status | status optional | Fetch live requisition tracking |
| Requisition detail | Show requisition 17474 workflow and delivery | requisition ID | Fetch live detail/log/delivery |
| Inventory search | Find fuel pump spare for Alkebulan | vessel, item keyword | Fetch live inventory |
| Create requisition | Create requisition for fuel pump spare on Alkebulan | vessel, item, workflow, description | Prepare draft, confirm |
| PO follow-up | Show PO and material receipt status | vessel/status optional | Fetch live PO tracking |
| Quote comparison | Compare quotes for requisition 17474 | requisition/quote number and quotation lines | Fetch live quotes, compare |

## 13. Clarification Rules

The assistant must ask for clarification when required context is missing.

Examples:

| User Prompt | Assistant Behavior |
|---|---|
| Compare quote on live requisition | Show candidate requisitions and ask for requisition/quote number |
| Close pump job | Ask/select exact live job if multiple or no match |
| Find fuel pump spare | Ask for vessel |
| Create requisition for spare | Ask for vessel and item |
| Do the pending thing | Ask which production area |
| Compare vendor quotes for requisition 17474 but quotation endpoint unavailable | Show requisition context and state quotation-line data is needed |

## 14. Quote Comparison Requirements

The assistant must compare supplier quotes only from live quotation line data.

Required data:

- requisition ID/number
- quote number or quotation batch ID
- supplier name
- line item
- quoted quantity
- quoted unit price
- currency
- discount
- freight
- taxes/duties if available
- delivery days/date
- payment terms
- technical compliance
- maker/model match
- remarks/deviations

Comparison logic:

- Normalize currency if exchange rates are available.
- Calculate landed cost.
- Compare delivery lead time.
- Check technical compliance.
- Detect incomplete quote lines.
- Rank supplier by weighted score.
- Explain recommendation.

Suggested default scoring:

```text
landed cost: 50%
delivery: 20%
technical compliance: 20%
payment/commercial terms: 10%
```

If quotation-line endpoint is not available:

- Do not generate fake comparison.
- Show live requisition context.
- Ask for quote number or endpoint capture.

## 15. Write Action Safety

Write actions include:

- close job
- postpone job
- report defect
- close defect
- create requisition
- submit approval/recommendation

Rules:

- Always draft first.
- Show human-readable fields first.
- Technical payload hidden under expandable section.
- Require explicit confirm.
- Log user, time, source page, payload hash, response.
- Respect Mazik user permissions.

## 16. API Requirements

### Current MVP Endpoints

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

### Future Production Endpoints

```text
POST /api/assistant/sessions
POST /api/assistant/runs
POST /api/assistant/drafts/:draftId/confirm
GET  /api/assistant/audit
POST /api/reports/generate
GET  /api/reports/:reportId/download
```

## 17. Data Storage Requirements

Use Postgres for:

- tenant config
- users
- assistant sessions
- assistant runs
- tool calls
- action drafts
- confirmations
- feedback
- audit events

Use object storage for:

- generated reports
- attachments
- optional audio evidence

## 18. Audit Requirements

Each assistant run must store:

- tenant ID
- user ID
- source system
- source route
- prompt
- normalized prompt
- action
- tool calls
- response summary
- draft payload hash
- confirmation user/time
- Mazik response

## 19. Acceptance Criteria

### General

- Assistant can be embedded in PMS/Purchase page.
- Assistant does not open a separate window.
- Assistant fetches live production data when enough context is available.
- Assistant asks clarifying questions when context is missing.
- Assistant never invents operational data.

### Quote Comparison

- Vague quote prompt shows live candidate requisitions.
- Requisition-specific quote prompt fetches requisition detail.
- Assistant refuses to rank suppliers until live quote lines are available.
- Once quote line endpoint is connected, assistant ranks suppliers with explanation.

### Maintenance

- User can list overdue jobs.
- User can search jobs by partial component/job/vessel.
- If multiple jobs match, assistant asks user to select.
- Completion/postponement requires confirmation.

### Requisition

- User can search inventory by vessel and keyword.
- Missing vessel triggers clarification.
- Multiple items show selectable results.
- Requisition draft is human-readable.
- Submission requires confirmation.

## 20. Demo Scope Without PMS Access

The provided HTML demo uses static mock records only to demonstrate UX and logic. It must be presented as a UX/requirements demo, not as a live integration.

The demo shows:

- embedded PMS/Purchase screen
- assistant drawer
- clarification questions
- candidate selection
- quote comparison blocked until live quote lines are available
- maintenance list and close confirmation
- inventory/requisition selection

## 21. Implementation Roadmap

### Phase 1: Embedded UX and Live Reads

- Implement assistant widget.
- Integrate host shell adapter.
- Wire maintenance, defects, certificates, requisitions, PO tracking.
- Add clarification flows.

### Phase 2: Production Write Drafts

- Close job.
- Postpone job.
- Create requisition.
- Report/close defect.
- Confirmation and audit.

### Phase 3: Quote Comparison

- Capture extracted quotation endpoints.
- Fetch supplier quote lines.
- Implement scoring and ranking.
- Add recommendation confirmation.

### Phase 4: Persistence and Audit

- Add Postgres.
- Store runs/tool calls/drafts/confirmations.
- Add admin audit view.

### Phase 5: Plugin Product

- Package for PMS/Purchase vendors.
- Connector SDK.
- Multi-tenant marketplace offering.

## 22. Open Items Needed From Mazik/PMS Team

- Confirm route and API for extracted quotation line data.
- Confirm quote comparison page data model.
- Confirm defect create/close APIs.
- Confirm certificate detail APIs.
- Confirm user role/permission mapping.
- Confirm preferred embedding mechanism.
- Confirm SSO/session handoff approach.
