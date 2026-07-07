# PMS Voice Tool Integrated

This repository is now a split frontend/backend product base for your real Mazik integration work.

## Stack

- Frontend: React 19 + Vite 7 + TypeScript + TanStack Query
- Backend: Node.js integration API for Mazik PMS Link and Purchase Link
- Deployment model: separate Railway services for `web` and `api`

This direction matches current official guidance:

- React recommends modern React app setups rather than Create React App: https://react.dev/learn/installation
- Vite is the modern low-friction frontend build tool for React apps: https://vite.dev/guide/
- Railway supports frontend/backend monorepos by assigning a root directory per service: https://docs.railway.com/guides/monorepo

## Repository Layout

```text
apps/
  api/   Mazik integration backend
  web/   product UI frontend
docs/
  CLEAN_ARCHITECTURE_REFACTOR.md
  EMBEDDED_PMS_PURCHASE_ASSISTANT_PRD.md
  FRONTEND_UI_SYSTEM.md
  INTEGRATION_NOTES.md
  MAZIK_LIVE_ENDPOINT_INVENTORY.md
  PRODUCTION_EMBEDDED_ASSISTANT_MVP.md
  RAILWAY_SPLIT_DEPLOYMENT.md
```

## Architecture

The API has been refactored toward clean architecture boundaries:

- [docs/CLEAN_ARCHITECTURE_REFACTOR.md](docs/CLEAN_ARCHITECTURE_REFACTOR.md)

The frontend now has reusable UI and presentation components:

- [docs/FRONTEND_UI_SYSTEM.md](docs/FRONTEND_UI_SYSTEM.md)

The implementation-ready PRD and standalone stakeholder demo are here:

- [docs/EMBEDDED_PMS_PURCHASE_ASSISTANT_PRD.md](docs/EMBEDDED_PMS_PURCHASE_ASSISTANT_PRD.md)
- [public/embedded-assistant-production-demo.html](public/embedded-assistant-production-demo.html)

## Production Embedded Assistant Plan

The next product direction is an assistant embedded directly inside Mazik PMS Link and Purchase Link, rather than only running as a standalone demo page.

- [docs/PRODUCTION_EMBEDDED_ASSISTANT_MVP.md](docs/PRODUCTION_EMBEDDED_ASSISTANT_MVP.md)

New embedded contracts are available from the API:

- `GET /api/embedded/manifest`
- `POST /api/embedded/plan`

## Local Development

Install workspace dependencies:

```powershell
npm install
```

Run the backend:

```powershell
npm run dev:api
```

Run the frontend in another terminal:

```powershell
npm run dev:web
```

Default local URLs:

- frontend: `http://localhost:3000`
- backend: `http://localhost:3100`

## Environment

Backend variables are documented in:

- [.env.example](.env.example)

Frontend variables are documented in:

- [apps/web/.env.example](apps/web/.env.example)

## What Is Already Wired

- live Mazik login flow for PMS Link and Purchase Link
- live captured read endpoints for:
  - maintenance forecast
  - maintenance detail
  - requisition tracking
  - requisition detail
  - requisition workflow log support
- modern frontend for:
  - system switching
  - login/session state
  - command console
  - live path probing
  - captured route inventory browsing
  - connector settings
- live captured write endpoints for:
  - maintenance completion
  - maintenance postponement
  - purchase requisition create

## What Still Needs Final Live Confirmation

The backend now submits real live requests for:

- close maintenance, when the required Mazik fields are present
- create postponement, when the required Mazik fields are present
- create requisition, when the full Mazik requisition payload is supplied

It still returns structured drafts for:

- create defect
- submit procurement workflow action
- any close/postpone/requisition request that is missing required live fields

## Railway

Use the step-by-step guide here:

- [docs/RAILWAY_SPLIT_DEPLOYMENT.md](docs/RAILWAY_SPLIT_DEPLOYMENT.md)
