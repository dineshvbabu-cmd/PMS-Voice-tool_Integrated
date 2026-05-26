# Integration Notes

## Current product shape

This repository now runs as:

- `apps/api`: Mazik integration backend
- `apps/web`: Railway-deployable React frontend

The backend already preloads the confirmed read endpoints captured from your live session, while still leaving unconfirmed write endpoints configurable.

## Confirmed from live PMS Link bundle

Live shell:

- `https://livepms.maziksolutions.com/`

Angular environment values extracted from the production bundle:

- `apiurl`: `https://PMSAPI.maziksolutions.com/api/`
- `url`: `https://PMSAPI.maziksolutions.com/`
- `purl`: `https://qapurchase.maziksolutions.com/login?...`
- `aurl`: `https://qaaccounts.maziksolutions.com/login?...`

Auth endpoints confirmed from bundle code:

- `POST https://PMSAPI.maziksolutions.com/api/auth/login`
- `POST https://PMSAPI.maziksolutions.com/api/auth/refresh`

Additional real PMS route supplied by user:

- `https://livepms.maziksolutions.com/pmsOverview/maintenanceForecast`

Live probe results from this machine:

- web shell reachable: HTTP `200`
- auth refresh without cookie: HTTP `401` with `Refresh token missing`
- auth login with invalid credentials: HTTP `401`

## Confirmed from live Purchase Link bundle

Live shell:

- `https://pclink.maziksolutions.com/`

Angular environment values extracted from the production bundle:

- `apiurl`: `https://livepmsapi.maziksolutions.com/api/`
- `url`: `https://livepmsapi.maziksolutions.com/`
- authenticated route after redirect: `/Requisition/RequisitionTracking`

Auth endpoints confirmed from bundle code:

- `POST https://livepmsapi.maziksolutions.com/api/auth/login`
- `POST https://livepmsapi.maziksolutions.com/api/auth/refresh`

Additional real purchase route supplied by user:

- `https://pclink.maziksolutions.com/Requisition/RequisitionTracking`

Live probe results from this machine:

- web shell reachable: HTTP `200`
- auth refresh without cookie: HTTP `401` with `Refresh token missing`
- auth login with invalid credentials: HTTP `401`

## What is still unconfirmed

The actual authenticated business endpoints for PMS and Purchase:

- due jobs
- overdue jobs
- job detail
- close job
- postponement
- requisition
- procurement follow-up

The local PMS spec in this workspace suggests shapes like:

- `/api/pms/job-orders`
- `/api/pms/job-orders/{id}`
- `/api/pms/job-orders/{id}/status`

But those paths did not resolve anonymously on the live API host, so they should be treated as candidates, not confirmed production paths.

## Best way to finish the real connector

1. Log into PMS Link in a browser
2. Open browser dev tools
3. Use one real maintenance screen and one real requisition or tracking screen
4. Capture the exact XHR or fetch requests
5. Copy for each system:
   - method
   - full path
   - query params
   - request body
   - auth headers or cookie behavior
6. Enter those paths into this starter or give them to me and I can wire them in permanently

## Next live captures to prioritize

- maintenance completion submit
- maintenance postponement request submit
- defect create
- requisition create
- procurement workflow submit or approve
