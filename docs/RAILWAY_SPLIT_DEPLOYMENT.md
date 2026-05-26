# Railway Split Deployment

This repo is intended to deploy as two separate Railway services from one GitHub repository.

## Service Layout

- Backend service root directory: `/apps/api`
- Frontend service root directory: `/apps/web`

Railway’s monorepo guide confirms this root-directory model for separate services in one repo:

- https://docs.railway.com/guides/monorepo
- https://docs.railway.com/tutorials/deploying-a-monorepo

## 1. Push This Repo To GitHub

Use your integrated repo:

- `https://github.com/dineshvbabu-cmd/PMS-Voice-tool_Integrated`

## 2. Create Two Railway Services

Inside one Railway project, create:

1. `pms-voice-api`
2. `pms-voice-web`

Connect both services to the same GitHub repo.

## 3. Set Root Directory For Each Service

Backend service:

- root directory: `/apps/api`

Frontend service:

- root directory: `/apps/web`

## 4. Backend Service Settings

Railway should detect the backend start command from `apps/api/package.json`:

- build: `npm install`
- start: `npm run start`

Set backend variables:

- `OPENAI_API_KEY`
- `OPENAI_LANGUAGE_MODEL`
- `CORS_ALLOWED_ORIGINS`
- `PMSLINK_WEB_BASE`
- `PMSLINK_API_BASE`
- `PMSLINK_FORECAST_URL`
- `PMSLINK_DUE_JOBS_PATH`
- `PMSLINK_JOB_DETAIL_PATH`
- `PMSLINK_CLOSE_JOB_PATH`
- `PMSLINK_POSTPONEMENT_PATH`
- `PMSLINK_REQUISITION_PATH`
- `PURCHASELINK_WEB_BASE`
- `PURCHASELINK_API_BASE`
- `PURCHASELINK_TRACKING_URL`
- `PURCHASELINK_REQUISITION_PATH`
- `PURCHASELINK_FOLLOWUP_PATH`

Start with:

- `PMSLINK_DUE_JOBS_PATH=ShipMaster/shipMaintenanceDirectCompleteBySP`
- `PMSLINK_JOB_DETAIL_PATH=ShipMaster/shipMaintenanceForecastById/{jobId}`
- `PURCHASELINK_FOLLOWUP_PATH=PMRequisitionMaster/purchaseTracksLists`

## 5. Deploy Backend First

Deploy the backend service and copy its public Railway domain.

Example:

- `https://pms-voice-api-production.up.railway.app`

Verify:

- `https://your-api-domain/api/health`
- `https://your-api-domain/api/bootstrap`

## 6. Frontend Service Settings

Railway should detect the frontend start command from `apps/web/package.json`:

- build: `npm install && npm run build`
- start: `npm run start`

Set frontend variable:

- `VITE_API_BASE_URL=https://your-api-domain`

Important:

- `VITE_API_BASE_URL` must be set before frontend build, because Vite injects it at build time.

## 7. Update Backend CORS

After the frontend domain exists, update backend:

- `CORS_ALLOWED_ORIGINS=http://localhost:3000,https://your-frontend-domain`

Then redeploy the backend.

## 8. Verify End-To-End

Frontend checks:

1. open the frontend Railway URL
2. switch between `PMS Link` and `Purchase Link`
3. log in with real Mazik credentials
4. run a command prompt
5. probe a captured live endpoint

Backend checks:

1. `GET /api/health`
2. `GET /api/bootstrap`
3. successful `POST /api/auth/login`
4. successful `POST /api/probe` on a live read endpoint

## 9. Recommended Railway Structure

Use one Railway project with two services:

- easier shared management
- easier environment tracking
- simpler domain and CORS handling

## 10. What To Do Next

After both services are live:

1. confirm live write endpoints for close job and postponement
2. confirm requisition-create and procurement workflow-submit endpoints
3. add role-based UI views
4. connect voice input and TTS on top of this split architecture
