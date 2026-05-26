"use strict";

function trimSlash(value, direction) {
  if (!value) {
    return "";
  }
  if (direction === "left") {
    return String(value).replace(/^\/+/, "");
  }
  if (direction === "right") {
    return String(value).replace(/\/+$/, "");
  }
  return String(value).replace(/^\/+|\/+$/g, "");
}

function joinUrl(baseUrl, endpointPath) {
  return `${trimSlash(baseUrl, "right")}/${trimSlash(endpointPath, "left")}`;
}

function buildUrl(baseUrl, endpointPath, query) {
  const url = new URL(joinUrl(baseUrl, endpointPath));
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function collectSetCookies(headers) {
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function cookieHeader(setCookies) {
  return (setCookies || [])
    .map((entry) => String(entry).split(";")[0])
    .filter(Boolean)
    .join("; ");
}

async function parseApiResponse(response) {
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed,
    rawText: text
  };
}

class PMSLinkClient {
  constructor(settings) {
    this.settings = settings;
  }

  getSystemConfig(systemKey) {
    if (systemKey === "purchase") {
      return {
        apiBaseUrl: this.settings.purchaseApiBaseUrl,
        webBaseUrl: this.settings.purchaseWebBaseUrl,
        landingUrl: this.settings.purchaseRequisitionTrackingUrl
      };
    }

    return {
      apiBaseUrl: this.settings.pmsApiBaseUrl,
      webBaseUrl: this.settings.pmsWebBaseUrl,
      landingUrl: this.settings.pmsMaintenanceForecastUrl
    };
  }

  get apiBaseUrl() {
    return this.settings.pmsApiBaseUrl;
  }

  async login(systemKey, username, password) {
    const config = this.getSystemConfig(systemKey);
    const response = await fetch(joinUrl(config.apiBaseUrl, "auth/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const parsed = await parseApiResponse(response);
    const setCookies = collectSetCookies(response.headers);
    const token =
      parsed.body?.token ||
      parsed.body?.jwtToken ||
      parsed.body?.accessToken ||
      parsed.body?.data?.token ||
      "";

    return {
      ...parsed,
      token,
      setCookies
    };
  }

  async request(systemKey, endpointPath, options = {}) {
    if (!endpointPath) {
      return {
        ok: false,
        status: 400,
        body: {
          error: "Endpoint path is not configured yet."
        }
      };
    }

    const config = this.getSystemConfig(systemKey);
    const url = buildUrl(config.apiBaseUrl, endpointPath, options.query);
    const headers = {
      Accept: "application/json"
    };

    if (options.session?.token) {
      headers.Authorization = `Bearer ${options.session.token}`;
    }

    if (options.session?.setCookies?.length) {
      headers.Cookie = cookieHeader(options.session.setCookies);
    }

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined
    });

    const parsed = await parseApiResponse(response);

    return {
      ...parsed,
      url
    };
  }

  async probe(systemKey, pathName, session, query) {
    const endpointPath = this.settings[pathName];
    return this.request(systemKey, endpointPath, { session, query });
  }

  async listDueJobs(systemKey, session, query) {
    return this.request(systemKey, this.settings.pmsDueJobsPath, { session, query });
  }

  async getJobDetail(systemKey, session, jobId) {
    const pathTemplate = this.settings.pmsJobDetailPath || "";
    const endpointPath = pathTemplate.replace("{jobId}", encodeURIComponent(jobId));
    return this.request(systemKey, endpointPath, { session });
  }

  async closeJob(systemKey, session, jobId, payload) {
    const pathTemplate = this.settings.pmsCloseJobPath || "";
    const endpointPath = pathTemplate.replace("{jobId}", encodeURIComponent(jobId));
    return this.request(systemKey, endpointPath, {
      method: "PUT",
      session,
      body: payload
    });
  }

  async createPostponement(systemKey, session, payload) {
    return this.request(systemKey, this.settings.pmsPostponementPath, {
      method: "POST",
      session,
      body: payload
    });
  }

  async createRequisition(systemKey, session, payload) {
    const endpointPath = systemKey === "purchase"
      ? this.settings.purchaseRequisitionPath
      : this.settings.pmsRequisitionPath;

    return this.request(systemKey, endpointPath, {
      method: "POST",
      session,
      body: payload
    });
  }

  async procurementFollowUp(systemKey, session, query) {
    const endpointPath = systemKey === "purchase"
      ? this.settings.purchaseFollowupPath
      : this.settings.purchaseFollowupPath;

    return this.request(systemKey, endpointPath, { session, query });
  }
}

module.exports = {
  PMSLinkClient
};
