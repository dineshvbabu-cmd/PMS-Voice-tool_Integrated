"use strict";

function createCors({ settings }) {
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

  return {
    allowedOrigin,
    writeCorsHeaders
  };
}

module.exports = {
  createCors
};
