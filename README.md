# Mazik PMS Copilot Connector

This is a real integration starter for your PMS Link and Purchase Link products, not just a mock demo.

It is designed to connect to:

- PMS Link web shell: `https://livepms.maziksolutions.com/`
- PMS Link API base discovered from the live Angular bundle: `https://PMSAPI.maziksolutions.com/api/`
- PMS maintenance route you shared: `https://livepms.maziksolutions.com/pmsOverview/maintenanceForecast`
- Purchase Link web shell: `https://pclink.maziksolutions.com/`
- Purchase Link API base discovered from the live Angular bundle: `https://livepmsapi.maziksolutions.com/api/`
- Purchase requisition route you shared: `https://pclink.maziksolutions.com/Requisition/RequisitionTracking`

## What this starter does

- logs into the real Mazik auth APIs for PMS Link and Purchase Link
- stores the JWT and cookies in a local connector session
- lets you configure actual endpoint paths for maintenance, closures, requisitions, and procurement
- provides a copilot UI that can switch between PMS and Purchase contexts
- supports optional OpenAI-based prompt routing and normalization

## Important limitation

I confirmed the auth surface from the live bundle, but I could not complete a real authenticated business-data session because I do not have your PMS credentials from here.

That means:

- login is wired to the real API
- the API base URL is real
- the endpoint paths for maintenance and procurement still need to be confirmed from an authenticated network trace or your backend docs

To handle that cleanly, the app makes those business endpoint paths configurable in the UI.

## Run locally

```powershell
cd "d:\OneDrive - Union Maritime Limited\Desktop\Mazik PMS Copilot Connector"
npm start
```

Open:

`http://localhost:3100`

## Recommended next steps

1. Start the app locally
2. Enter your Mazik credentials
3. Choose `PMS Link` or `Purchase Link`
4. Test login
5. Fill in one confirmed endpoint path for the selected system
6. Probe it from the UI
7. Once one read endpoint works, add detail, closure, requisition, and procurement paths

## Files

- [server.js](server.js)
- [lib/pmslink-client.js](lib/pmslink-client.js)
- [lib/copilot.js](lib/copilot.js)
- [public/index.html](public/index.html)
- [docs/INTEGRATION_NOTES.md](docs/INTEGRATION_NOTES.md)
