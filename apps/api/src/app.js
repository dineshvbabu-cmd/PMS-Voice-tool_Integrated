"use strict";

const { URL } = require("url");

function parseSystemKey(value, fallback = "pms") {
  return value === "purchase" ? "purchase" : value === "pms" ? "pms" : fallback;
}

function createApiHandler({
  settings,
  sessionStore,
  clientFactory,
  bootstrapService,
  voiceTranscriptionService,
  readBody,
  readBinaryBody,
  sendJson,
  sendEmpty,
  writeCorsHeaders,
  inventory,
  copilot,
  embeddedAssistant,
  settingsService
}) {
  return async function handleApiRequest(req, res) {
    try {
      writeCorsHeaders(req, res);

      if (req.method === "OPTIONS") {
        sendEmpty(req, res, 204);
        return;
      }

      const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
      const client = clientFactory();
      const browserSession = sessionStore.getBrowserSession(req);

      if (req.method === "GET" && parsedUrl.pathname === "/api/health") {
        sendJson(req, res, 200, {
          ok: true,
          service: "@pms-voice/api",
          product: settings.product.name
        });
        return;
      }

      if (req.method === "GET" && parsedUrl.pathname === "/api/bootstrap") {
        sendJson(req, res, 200, bootstrapService.currentBootstrap(req));
        return;
      }

      if (req.method === "GET" && parsedUrl.pathname === "/api/inventory") {
        sendJson(req, res, 200, {
          pmsRoutes: inventory.pmsRoutes,
          purchaseRouteGroups: inventory.purchaseRouteGroups,
          liveEndpoints: inventory.liveEndpoints
        });
        return;
      }

      if (req.method === "GET" && parsedUrl.pathname === "/api/embedded/manifest") {
        sendJson(req, res, 200, embeddedAssistant.createEmbeddedManifest());
        return;
      }

      if (req.method === "POST" && parsedUrl.pathname === "/api/embedded/plan") {
        const rawBody = await readBody(req);
        const body = rawBody ? JSON.parse(rawBody) : {};

        sendJson(
          req,
          res,
          200,
          embeddedAssistant.createEmbeddedAssistantPlan({
            query: body.query || "",
            pageContext: body.pageContext || {},
            userContext: body.userContext || {}
          })
        );
        return;
      }

      if (req.method === "POST" && parsedUrl.pathname === "/api/settings") {
        const rawBody = await readBody(req);
        const body = rawBody ? JSON.parse(rawBody) : {};
        settingsService.applySettingsPatch(settings, body);

        sendJson(req, res, 200, { ok: true, settings });
        return;
      }

      if (req.method === "POST" && parsedUrl.pathname === "/api/auth/login") {
        const rawBody = await readBody(req);
        const body = rawBody ? JSON.parse(rawBody) : {};
        const systemKey = parseSystemKey(body.systemKey);
        const loginResult = await client.login(systemKey, body.username || "", body.password || "");

        if (!loginResult.ok) {
          sendJson(req, res, loginResult.status || 401, {
            ok: false,
            message: `${systemKey === "purchase" ? "Purchase Link" : "PMS Link"} login failed`,
            result: loginResult
          });
          return;
        }

        const browserState = sessionStore.ensureBrowserSession(req, res);
        browserState.session.systems[systemKey] = {
          createdAt: new Date().toISOString(),
          token: loginResult.token,
          setCookies: loginResult.setCookies,
          lastLoginStatus: loginResult.status,
          loginPayload: loginResult.body
        };

        sendJson(req, res, 200, {
          ok: true,
          message: `Logged into ${systemKey === "purchase" ? "Purchase Link" : "PMS Link"}`,
          systemKey,
          sessionId: browserState.sessionId,
          session: sessionStore.sanitizedSystemSession(browserState.session.systems[systemKey]),
          loginPayload: loginResult.body
        });
        return;
      }

      if (req.method === "POST" && parsedUrl.pathname === "/api/auth/logout") {
        const rawBody = await readBody(req);
        const body = rawBody ? JSON.parse(rawBody) : {};
        const systemKey = parseSystemKey(body.systemKey, "");
        sessionStore.logout(req, res, systemKey);

        sendJson(req, res, 200, { ok: true });
        return;
      }

      if (req.method === "POST" && parsedUrl.pathname === "/api/probe") {
        const rawBody = await readBody(req);
        const body = rawBody ? JSON.parse(rawBody) : {};
        const systemKey = parseSystemKey(body.systemKey);
        const systemSession = browserSession?.systems?.[systemKey];

        if (!systemSession) {
          sendJson(req, res, 401, { ok: false, message: "Login required" });
          return;
        }

        const result = await client.request(systemKey, body.path || "", {
          method: body.method || "GET",
          session: systemSession,
          query: body.query,
          body: body.payload
        });

        sendJson(req, res, 200, { ok: result.ok, result });
        return;
      }

      if (req.method === "POST" && parsedUrl.pathname === "/api/voice/transcribe") {
        if (!settings.openAiEnabled) {
          sendJson(req, res, 501, {
            ok: false,
            message: "OpenAI voice transcription is not enabled on this API service."
          });
          return;
        }

        const audioBuffer = await readBinaryBody(req);
        if (!audioBuffer.length) {
          sendJson(req, res, 400, { ok: false, message: "No audio was received." });
          return;
        }

        const mimeType = String(req.headers["content-type"] || "audio/webm");
        const transcription = await voiceTranscriptionService.transcribeVoiceToEnglish(audioBuffer, mimeType);

        sendJson(req, res, 200, {
          ok: true,
          transcript: transcription.transcript,
          provider: "openai",
          model: transcription.model,
          mode: "transcribe",
          endpoint: transcription.endpoint
        });
        return;
      }

      if (req.method === "POST" && parsedUrl.pathname === "/api/copilot/query") {
        const rawBody = await readBody(req);
        const body = rawBody ? JSON.parse(rawBody) : {};
        const systemKey = parseSystemKey(body.systemKey);

        const result = await copilot.executeCopilotQuery({
          client,
          session: browserSession?.systems?.[systemKey] || null,
          sessions: browserSession?.systems || {},
          query: body.query || "",
          systemKey
        });

        sendJson(req, res, 200, result);
        return;
      }

      if (req.method === "POST" && parsedUrl.pathname === "/api/copilot/confirm") {
        const rawBody = await readBody(req);
        const body = rawBody ? JSON.parse(rawBody) : {};
        const systemKey = parseSystemKey(body.systemKey);
        const systemSession = browserSession?.systems?.[systemKey];

        if (!systemSession) {
          sendJson(req, res, 401, { ok: false, message: "Login required" });
          return;
        }

        const result = await copilot.confirmCopilotAction({
          client,
          session: systemSession,
          systemKey,
          action: body.action || "",
          payload: body.payload || {},
          jobId: body.jobId || ""
        });

        sendJson(req, res, 200, result);
        return;
      }

      sendJson(req, res, 404, { ok: false, error: "Not found" });
    } catch (error) {
      sendJson(req, res, 500, { ok: false, error: error.message });
    }
  };
}

module.exports = {
  createApiHandler,
  parseSystemKey
};
