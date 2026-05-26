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
  INTEGRATION_NOTES.md
  MAZIK_LIVE_ENDPOINT_INVENTORY.md
  RAILWAY_SPLIT_DEPLOYMENT.md
```

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

## What Still Needs Final Live Confirmation

Write endpoints still need final authenticated confirmation before we can make production actions live:

- close maintenance
- create postponement
- create defect
- create requisition
- submit procurement workflow action

Until then, the backend returns structured drafts for unconfirmed write actions.

## Railway

Use the step-by-step guide here:

- [docs/RAILWAY_SPLIT_DEPLOYMENT.md](docs/RAILWAY_SPLIT_DEPLOYMENT.md)
