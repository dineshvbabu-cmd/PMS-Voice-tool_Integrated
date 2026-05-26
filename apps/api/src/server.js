"use strict";

const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");
const { createSettings } = require("./lib/settings");
const { pmsRoutes, purchaseRouteGroups, liveEndpoints, samplePrompts } = require("./lib/inventory");
const { PMSLinkClient } = require("./lib/pmslink-client");
const { executeCopilotQuery } = require("./lib/copilot");

const PORT = Number(process.env.PORT || 3100);
const settings = createSettings();
const sessions = new Map();

function parseCookies(cookieHeader) {
  const entries = {};

  String(cookieHeader || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [name, ...rest] = entry.split("=");
      entries[name] = rest.join("=");
    });

  return entries;
}

function getSessionIdFromRequest(req) {
  const headerValue = String(req.headers["x-session-id"] || "").trim();
  if (headerValue) {
    return headerValue;
  }

  const cookies = parseCookies(req.headers.cookie);
  return cookies.copilot_session || "";
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function allowedOrigin(origin) {
  if (!origin) {
    return "*";
  }

  const normalizedOrigin = String(origin).trim().toLowerCase();

  if (settings.corsAllowedOrigins.includes("*")) {
    return origin;
  }

  const normalizedAllowedOrigins = settings.corsAllowedOrigins.map((value) => value.trim().toLowerCase());
  if (normalizedAllowedOrigins.includes(normalizedOrigin)) {
    return origin;
  }

  if (
    normalizedOrigin === "http://localhost:3000" ||
    normalizedOrigin === "http://localhost:5173" ||
    normalizedOrigin.endsWith(".up.railway.app") ||
    normalizedOrigin.endsWith(".railway.app")
  ) {
    return origin;
  }

  return "";
}

function writeCorsHeaders(req, res) {
  const origin = allowedOrigin(req.headers.origin || "");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  const requestedHeaders = String(req.headers["access-control-request-headers"] || "")
    .split(",")
    .map((header) => header.trim())
    .filter(Boolean);
  const allowHeaders = Array.from(
    new Set(["Content-Type", "Authorization", "X-Session-Id", ...requestedHeaders])
  ).join(", ");

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", allowHeaders);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
}

function sendJson(req, res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body);
  writeCorsHeaders(req, res);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...headers
  });
  res.end(payload);
}

function sendEmpty(req, res, statusCode) {
  writeCorsHeaders(req, res);
  res.writeHead(statusCode);
  res.end();
}

function getBrowserSession(req) {
  const sessionId = getSessionIdFromRequest(req);
  return sessionId ? sessions.get(sessionId) || null : null;
}

function setSessionCookie(res, sessionId) {
  res.setHeader("Set-Cookie", `copilot_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "copilot_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
}

function ensureBrowserSession(req, res) {
  const existing = getBrowserSession(req);
  if (existing) {
    return {
      sessionId: getSessionIdFromRequest(req),
      session: existing
    };
  }

  const sessionId = crypto.randomUUID();
  const session = {
    createdAt: new Date().toISOString(),
    systems: {}
  };

  sessions.set(sessionId, session);
  setSessionCookie(res, sessionId);
  return {
    sessionId,
    session
  };
}

function sanitizedSystemSession(session) {
  if (!session) {
    return null;
  }

  return {
    authenticated: true,
    createdAt: session.createdAt,
    hasToken: Boolean(session.token),
    hasCookies: Boolean(session.setCookies?.length),
    lastLoginStatus: session.lastLoginStatus
  };
}

function currentBootstrap(req) {
  const browserSession = getBrowserSession(req);

  return {
    product: settings.product,
    systems: {
      pms: {
        name: "PMS Link",
        webBaseUrl: settings.pmsWebBaseUrl,
        apiBaseUrl: settings.pmsApiBaseUrl,
        landingUrl: settings.pmsMaintenanceForecastUrl
      },
      purchase: {
        name: "Purchase Link",
        webBaseUrl: settings.purchaseWebBaseUrl,
        apiBaseUrl: settings.purchaseApiBaseUrl,
        landingUrl: settings.purchaseRequisitionTrackingUrl
      }
    },
    settings,
    session: {
      pms: sanitizedSystemSession(browserSession?.systems?.pms),
      purchase: sanitizedSystemSession(browserSession?.systems?.purchase)
    },
    discoveredFacts: [
      "Live Mazik auth calls are wired into this backend.",
      "Maintenance forecast and requisition tracking endpoints are preloaded from live captures.",
      "Close job, postponement, and requisition-create endpoints are now preloaded from live captures.",
      "Frontend and backend can now deploy independently on Railway."
    ],
    samplePrompts
  };
}

const server = http.createServer(async (req, res) => {
  try {
    writeCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      sendEmpty(req, res, 204);
      return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const client = new PMSLinkClient(settings);
    const browserSession = getBrowserSession(req);

    if (req.method === "GET" && parsedUrl.pathname === "/api/health") {
      sendJson(req, res, 200, {
        ok: true,
        service: "@pms-voice/api",
        product: settings.product.name
      });
      return;
    }

    if (req.method === "GET" && parsedUrl.pathname === "/api/bootstrap") {
      sendJson(req, res, 200, currentBootstrap(req));
      return;
    }

    if (req.method === "GET" && parsedUrl.pathname === "/api/inventory") {
      sendJson(req, res, 200, {
        pmsRoutes,
        purchaseRouteGroups,
        liveEndpoints
      });
      return;
    }

    if (req.method === "POST" && parsedUrl.pathname === "/api/settings") {
      const rawBody = await readBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};

      Object.assign(settings, {
        pmsWebBaseUrl: body.pmsWebBaseUrl ?? settings.pmsWebBaseUrl,
        pmsApiBaseUrl: body.pmsApiBaseUrl ?? settings.pmsApiBaseUrl,
        pmsMaintenanceForecastUrl: body.pmsMaintenanceForecastUrl ?? settings.pmsMaintenanceForecastUrl,
        pmsDueJobsPath: body.pmsDueJobsPath ?? settings.pmsDueJobsPath,
        pmsJobDetailPath: body.pmsJobDetailPath ?? settings.pmsJobDetailPath,
        pmsCloseJobPath: body.pmsCloseJobPath ?? settings.pmsCloseJobPath,
        pmsPostponementPath: body.pmsPostponementPath ?? settings.pmsPostponementPath,
        pmsRequisitionPath: body.pmsRequisitionPath ?? settings.pmsRequisitionPath,
        purchaseWebBaseUrl: body.purchaseWebBaseUrl ?? settings.purchaseWebBaseUrl,
        purchaseApiBaseUrl: body.purchaseApiBaseUrl ?? settings.purchaseApiBaseUrl,
        purchaseRequisitionTrackingUrl:
          body.purchaseRequisitionTrackingUrl ?? settings.purchaseRequisitionTrackingUrl,
        purchaseRequisitionPath: body.purchaseRequisitionPath ?? settings.purchaseRequisitionPath,
        purchaseFollowupPath: body.purchaseFollowupPath ?? settings.purchaseFollowupPath
      });

      sendJson(req, res, 200, { ok: true, settings });
      return;
    }

    if (req.method === "POST" && parsedUrl.pathname === "/api/auth/login") {
      const rawBody = await readBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const systemKey = body.systemKey === "purchase" ? "purchase" : "pms";
      const loginResult = await client.login(systemKey, body.username || "", body.password || "");

      if (!loginResult.ok) {
        sendJson(req, res, loginResult.status || 401, {
          ok: false,
          message: `${systemKey === "purchase" ? "Purchase Link" : "PMS Link"} login failed`,
          result: loginResult
        });
        return;
      }

      const browserState = ensureBrowserSession(req, res);
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
        session: sanitizedSystemSession(browserState.session.systems[systemKey]),
        loginPayload: loginResult.body
      });
      return;
    }

    if (req.method === "POST" && parsedUrl.pathname === "/api/auth/logout") {
      const rawBody = await readBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const systemKey = body.systemKey === "purchase" ? "purchase" : body.systemKey === "pms" ? "pms" : "";
      const current = getBrowserSession(req);

      if (current && systemKey) {
        delete current.systems[systemKey];
      } else if (current) {
        const sessionId = getSessionIdFromRequest(req);
        if (sessionId) {
          sessions.delete(sessionId);
        }
        clearSessionCookie(res);
      }

      sendJson(req, res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && parsedUrl.pathname === "/api/probe") {
      const rawBody = await readBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const systemKey = body.systemKey === "purchase" ? "purchase" : "pms";
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

    if (req.method === "POST" && parsedUrl.pathname === "/api/copilot/query") {
      const rawBody = await readBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const systemKey = body.systemKey === "purchase" ? "purchase" : "pms";

      const result = await executeCopilotQuery({
        client,
        session: browserSession?.systems?.[systemKey] || null,
        query: body.query || "",
        systemKey
      });

      sendJson(req, res, 200, result);
      return;
    }

    sendJson(req, res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    sendJson(req, res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`@pms-voice/api listening on http://localhost:${PORT}`);
});
