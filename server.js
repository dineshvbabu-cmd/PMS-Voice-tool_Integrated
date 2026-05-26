"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const { PMSLinkClient } = require("./lib/pmslink-client");
const { executeCopilotQuery } = require("./lib/copilot");

const PORT = Number(process.env.PORT || 3100);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const settings = {
  pmsWebBaseUrl: process.env.PMSLINK_WEB_BASE || "https://livepms.maziksolutions.com/",
  pmsApiBaseUrl: process.env.PMSLINK_API_BASE || "https://PMSAPI.maziksolutions.com/api/",
  pmsMaintenanceForecastUrl: "https://livepms.maziksolutions.com/pmsOverview/maintenanceForecast",
  pmsDueJobsPath: process.env.PMSLINK_DUE_JOBS_PATH || "",
  pmsJobDetailPath: process.env.PMSLINK_JOB_DETAIL_PATH || "",
  pmsCloseJobPath: process.env.PMSLINK_CLOSE_JOB_PATH || "",
  pmsPostponementPath: process.env.PMSLINK_POSTPONEMENT_PATH || "",
  pmsRequisitionPath: process.env.PMSLINK_REQUISITION_PATH || "",
  purchaseWebBaseUrl: "https://pclink.maziksolutions.com/",
  purchaseApiBaseUrl: "https://livepmsapi.maziksolutions.com/api/",
  purchaseRequisitionTrackingUrl: "https://pclink.maziksolutions.com/Requisition/RequisitionTracking",
  purchaseRequisitionPath: process.env.PURCHASELINK_REQUISITION_PATH || "",
  purchaseFollowupPath: process.env.PURCHASELINK_FOLLOWUP_PATH || ""
};

const sessions = new Map();

function sendJson(res, statusCode, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...headers
  });
  res.end(payload);
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
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

function getBrowserSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.copilot_session;
  return sessionId ? sessions.get(sessionId) || null : null;
}

function ensureBrowserSession(req, res) {
  const existing = getBrowserSession(req);
  if (existing) {
    return existing;
  }

  const sessionId = crypto.randomUUID();
  const session = {
    createdAt: new Date().toISOString(),
    systems: {}
  };
  sessions.set(sessionId, session);
  setSessionCookie(res, sessionId);
  return session;
}

function setSessionCookie(res, sessionId) {
  res.setHeader("Set-Cookie", `copilot_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "copilot_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": contentTypes[extension] || "application/octet-stream"
    });
    res.end(data);
  });
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
    connector: {
      name: "Mazik PMS And Purchase Copilot Connector"
    },
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
      "PMS Link shell and maintenance forecast route are reachable",
      "Purchase Link shell and requisition tracking route are reachable",
      "Mazik API bases were extracted from both live production bundles",
      "Both systems expose auth/login and auth/refresh endpoints",
      "business endpoints still need authenticated confirmation"
    ]
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const client = new PMSLinkClient(settings);
    const browserSession = getBrowserSession(req);

    if (req.method === "GET" && parsedUrl.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, service: "mazik-pms-copilot-connector" });
      return;
    }

    if (req.method === "GET" && parsedUrl.pathname === "/api/bootstrap") {
      sendJson(res, 200, currentBootstrap(req));
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
        purchaseRequisitionTrackingUrl: body.purchaseRequisitionTrackingUrl ?? settings.purchaseRequisitionTrackingUrl,
        purchaseRequisitionPath: body.purchaseRequisitionPath ?? settings.purchaseRequisitionPath,
        purchaseFollowupPath: body.purchaseFollowupPath ?? settings.purchaseFollowupPath
      });
      sendJson(res, 200, { ok: true, settings });
      return;
    }

    if (req.method === "POST" && parsedUrl.pathname === "/api/auth/login") {
      const rawBody = await readBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const systemKey = body.systemKey === "purchase" ? "purchase" : "pms";
      const loginResult = await client.login(systemKey, body.username || "", body.password || "");

      if (!loginResult.ok) {
        sendJson(res, loginResult.status || 401, {
          ok: false,
          message: `${systemKey === "purchase" ? "Purchase Link" : "PMS Link"} login failed`,
          result: loginResult
        });
        return;
      }

      const browserState = ensureBrowserSession(req, res);
      browserState.systems[systemKey] = {
        createdAt: new Date().toISOString(),
        token: loginResult.token,
        setCookies: loginResult.setCookies,
        lastLoginStatus: loginResult.status,
        loginPayload: loginResult.body
      };
      sendJson(res, 200, {
        ok: true,
        message: `Logged into ${systemKey === "purchase" ? "Purchase Link" : "PMS Link"}`,
        systemKey,
        session: sanitizedSystemSession(browserState.systems[systemKey]),
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
        const cookies = parseCookies(req.headers.cookie);
        if (cookies.copilot_session) {
          sessions.delete(cookies.copilot_session);
        }
        clearSessionCookie(res);
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && parsedUrl.pathname === "/api/probe") {
      const rawBody = await readBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const systemKey = body.systemKey === "purchase" ? "purchase" : "pms";
      const systemSession = browserSession?.systems?.[systemKey];

      if (!systemSession) {
        sendJson(res, 401, { ok: false, message: "Login required" });
        return;
      }
      const result = await client.request(systemKey, body.path || "", {
        method: body.method || "GET",
        session: systemSession,
        query: body.query,
        body: body.payload
      });
      sendJson(res, 200, { ok: result.ok, result });
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
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && parsedUrl.pathname === "/") {
      serveFile(res, path.join(PUBLIC_DIR, "index.html"));
      return;
    }

    if (req.method === "GET") {
      const candidate = path.join(PUBLIC_DIR, parsedUrl.pathname.replace(/^\/+/, ""));
      if (candidate.startsWith(PUBLIC_DIR)) {
        serveFile(res, candidate);
        return;
      }
    }

    sendText(res, 404, "Not found");
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Mazik PMS Copilot Connector listening on http://localhost:${PORT}`);
});
