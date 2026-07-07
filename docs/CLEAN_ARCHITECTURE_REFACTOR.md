# Clean Architecture Refactor

## Goal

This refactor keeps product behavior unchanged while separating HTTP infrastructure, session handling, application services, and domain/integration logic. The immediate target was the API server, which had become the main coupling point for unrelated responsibilities.

## New Folder Structure

```text
apps/api/
  scripts/
    check-syntax.js
  src/
    app.js
    server.js
    application/
      bootstrap/
        bootstrap-service.js
      session/
        browser-session-store.js
      settings/
        settings-service.js
      voice/
        voice-transcription-service.js
    infrastructure/
      http/
        body-reader.js
        cors.js
        responder.js
    lib/
      copilot.js
      embedded-assistant.js
      inventory.js
      pmslink-client.js
      settings.js
```

## Clean Architecture Breakdown

### Composition Root

`src/server.js`

- Creates settings.
- Creates session store.
- Creates HTTP/CORS responders.
- Creates application services.
- Wires dependencies into the API handler.
- Starts the HTTP server.

It should stay thin. New business behavior should not be added here.

### Interface Adapter / HTTP Router

`src/app.js`

- Owns endpoint routing.
- Converts HTTP requests into application calls.
- Converts service responses into JSON responses.
- Does not know the internals of voice transcription, sessions, settings mutation, or PMS/Purchase integration.

### Application Services

`src/application/*`

- `bootstrap-service.js`: builds the bootstrap payload used by the frontend.
- `browser-session-store.js`: owns browser session lookup, cookie behavior, logout, and session sanitization.
- `settings-service.js`: owns runtime settings mutation.
- `voice-transcription-service.js`: owns OpenAI transcription flow and maritime vocabulary prompting.

### Infrastructure

`src/infrastructure/http/*`

- `body-reader.js`: reads JSON/audio request bodies.
- `cors.js`: owns allowed-origin logic and CORS headers.
- `responder.js`: owns JSON/empty HTTP responses.

### Domain / Integration Logic

`src/lib/*`

- `copilot.js`: intent execution, PMS/Purchase action planning, confirmation payloads.
- `embedded-assistant.js`: embedded shell planning contract.
- `pmslink-client.js`: Mazik API integration client.
- `inventory.js`: captured endpoint inventory and sample prompts.
- `settings.js`: environment-derived runtime config.

## Architectural Improvements

- Reduced `server.js` from a monolithic route/service/infrastructure file to a composition root.
- Moved HTTP mechanics out of business flow.
- Isolated in-memory browser sessions behind a store interface, making Redis/Postgres migration straightforward.
- Isolated voice transcription behind an application service, making provider changes safer.
- Isolated runtime settings mutation, making validation/persistence easier to add later.
- Made the API handler dependency-injected, which enables proper unit tests without starting a real server.
- Added recursive API syntax checking so new modules are automatically validated.

## Behavior Preservation

The following endpoint paths and response semantics remain the same:

```text
GET  /api/health
GET  /api/bootstrap
GET  /api/inventory
GET  /api/embedded/manifest
POST /api/embedded/plan
POST /api/settings
POST /api/auth/login
POST /api/auth/logout
POST /api/probe
POST /api/voice/transcribe
POST /api/copilot/query
POST /api/copilot/confirm
```

## Next Senior-Level Refactor Targets

1. Split `copilot.js` into router, presenters, action builders, and Mazik use cases.
2. Add explicit request/response contract tests for every endpoint.
3. Introduce Postgres-backed repositories for sessions, audit, action drafts, and confirmations.
4. Add typed shared contracts between `apps/api` and `apps/web`.
5. Add structured logging, request IDs, and audit middleware.
