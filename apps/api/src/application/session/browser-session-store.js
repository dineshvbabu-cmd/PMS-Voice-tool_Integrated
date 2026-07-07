"use strict";

const crypto = require("crypto");

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

function setSessionCookie(res, sessionId) {
  res.setHeader("Set-Cookie", `copilot_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "copilot_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
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

function createBrowserSessionStore() {
  const sessions = new Map();

  function getBrowserSession(req) {
    const sessionId = getSessionIdFromRequest(req);
    return sessionId ? sessions.get(sessionId) || null : null;
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

  function logout(req, res, systemKey) {
    const current = getBrowserSession(req);

    if (current && systemKey) {
      delete current.systems[systemKey];
      return;
    }

    if (current) {
      const sessionId = getSessionIdFromRequest(req);
      if (sessionId) {
        sessions.delete(sessionId);
      }
      clearSessionCookie(res);
    }
  }

  return {
    getBrowserSession,
    ensureBrowserSession,
    logout,
    sanitizedSystemSession,
    getSessionIdFromRequest
  };
}

module.exports = {
  createBrowserSessionStore,
  getSessionIdFromRequest,
  sanitizedSystemSession
};
