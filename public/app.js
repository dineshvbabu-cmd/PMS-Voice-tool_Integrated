const elements = {
  systemKey: document.getElementById("systemKey"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  pmsWebBaseUrl: document.getElementById("pmsWebBaseUrl"),
  pmsApiBaseUrl: document.getElementById("pmsApiBaseUrl"),
  pmsMaintenanceForecastUrl: document.getElementById("pmsMaintenanceForecastUrl"),
  pmsDueJobsPath: document.getElementById("pmsDueJobsPath"),
  pmsJobDetailPath: document.getElementById("pmsJobDetailPath"),
  pmsCloseJobPath: document.getElementById("pmsCloseJobPath"),
  pmsPostponementPath: document.getElementById("pmsPostponementPath"),
  pmsRequisitionPath: document.getElementById("pmsRequisitionPath"),
  purchaseWebBaseUrl: document.getElementById("purchaseWebBaseUrl"),
  purchaseApiBaseUrl: document.getElementById("purchaseApiBaseUrl"),
  purchaseRequisitionTrackingUrl: document.getElementById("purchaseRequisitionTrackingUrl"),
  purchaseRequisitionPath: document.getElementById("purchaseRequisitionPath"),
  purchaseFollowupPath: document.getElementById("purchaseFollowupPath"),
  pmsForecastLink: document.getElementById("pmsForecastLink"),
  purchaseTrackingLink: document.getElementById("purchaseTrackingLink"),
  saveSettings: document.getElementById("saveSettings"),
  loginButton: document.getElementById("loginButton"),
  logoutButton: document.getElementById("logoutButton"),
  sessionStatus: document.getElementById("sessionStatus"),
  discoveryBox: document.getElementById("discoveryBox"),
  probeButton: document.getElementById("probeButton"),
  probeResult: document.getElementById("probeResult"),
  queryInput: document.getElementById("queryInput"),
  runQuery: document.getElementById("runQuery"),
  intentBox: document.getElementById("intentBox"),
  normalizedBox: document.getElementById("normalizedBox"),
  replyBox: document.getElementById("replyBox"),
  resultBox: document.getElementById("resultBox")
};

let bootstrapCache = null;

function setConsole(node, value, muted = false) {
  node.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  node.classList.toggle("muted", muted);
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Request failed with status ${response.status}`);
  }
  return payload;
}

function currentSystemKey() {
  return elements.systemKey.value === "purchase" ? "purchase" : "pms";
}

function currentProbePath() {
  return currentSystemKey() === "purchase"
    ? elements.purchaseRequisitionPath.value.trim()
    : elements.pmsDueJobsPath.value.trim();
}

function refreshSessionView() {
  if (!bootstrapCache) {
    return;
  }

  const systemKey = currentSystemKey();
  const session = bootstrapCache.session?.[systemKey];
  const label = systemKey === "purchase" ? "Purchase Link" : "PMS Link";
  setConsole(elements.sessionStatus, session ? { system: label, ...session } : { system: label, authenticated: false }, !session);
}

function applyBootstrap(payload) {
  bootstrapCache = payload;

  elements.pmsWebBaseUrl.value = payload.settings.pmsWebBaseUrl || "";
  elements.pmsApiBaseUrl.value = payload.settings.pmsApiBaseUrl || "";
  elements.pmsMaintenanceForecastUrl.value = payload.settings.pmsMaintenanceForecastUrl || "";
  elements.pmsDueJobsPath.value = payload.settings.pmsDueJobsPath || "";
  elements.pmsJobDetailPath.value = payload.settings.pmsJobDetailPath || "";
  elements.pmsCloseJobPath.value = payload.settings.pmsCloseJobPath || "";
  elements.pmsPostponementPath.value = payload.settings.pmsPostponementPath || "";
  elements.pmsRequisitionPath.value = payload.settings.pmsRequisitionPath || "";
  elements.purchaseWebBaseUrl.value = payload.settings.purchaseWebBaseUrl || "";
  elements.purchaseApiBaseUrl.value = payload.settings.purchaseApiBaseUrl || "";
  elements.purchaseRequisitionTrackingUrl.value = payload.settings.purchaseRequisitionTrackingUrl || "";
  elements.purchaseRequisitionPath.value = payload.settings.purchaseRequisitionPath || "";
  elements.purchaseFollowupPath.value = payload.settings.purchaseFollowupPath || "";

  elements.pmsForecastLink.href = payload.settings.pmsMaintenanceForecastUrl || "#";
  elements.purchaseTrackingLink.href = payload.settings.purchaseRequisitionTrackingUrl || "#";

  setConsole(elements.discoveryBox, payload.discoveredFacts || []);
  refreshSessionView();
}

async function loadBootstrap() {
  const payload = await fetchJson("/api/bootstrap");
  applyBootstrap(payload);
}

async function saveSettings() {
  const payload = await fetchJson("/api/settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      pmsWebBaseUrl: elements.pmsWebBaseUrl.value.trim(),
      pmsApiBaseUrl: elements.pmsApiBaseUrl.value.trim(),
      pmsMaintenanceForecastUrl: elements.pmsMaintenanceForecastUrl.value.trim(),
      pmsDueJobsPath: elements.pmsDueJobsPath.value.trim(),
      pmsJobDetailPath: elements.pmsJobDetailPath.value.trim(),
      pmsCloseJobPath: elements.pmsCloseJobPath.value.trim(),
      pmsPostponementPath: elements.pmsPostponementPath.value.trim(),
      pmsRequisitionPath: elements.pmsRequisitionPath.value.trim(),
      purchaseWebBaseUrl: elements.purchaseWebBaseUrl.value.trim(),
      purchaseApiBaseUrl: elements.purchaseApiBaseUrl.value.trim(),
      purchaseRequisitionTrackingUrl: elements.purchaseRequisitionTrackingUrl.value.trim(),
      purchaseRequisitionPath: elements.purchaseRequisitionPath.value.trim(),
      purchaseFollowupPath: elements.purchaseFollowupPath.value.trim()
    })
  });

  bootstrapCache = {
    ...(bootstrapCache || {}),
    settings: payload.settings
  };
  applyBootstrap(bootstrapCache);
  setConsole(elements.sessionStatus, { message: "Settings saved for both systems." });
}

async function login() {
  const payload = await fetchJson("/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemKey: currentSystemKey(),
      username: elements.username.value.trim(),
      password: elements.password.value
    })
  });

  await loadBootstrap();
  setConsole(elements.sessionStatus, payload);
}

async function logout() {
  const payload = await fetchJson("/api/auth/logout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemKey: currentSystemKey()
    })
  });

  await loadBootstrap();
  setConsole(elements.sessionStatus, payload);
}

async function probe() {
  const payload = await fetchJson("/api/probe", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemKey: currentSystemKey(),
      path: currentProbePath(),
      method: "GET"
    })
  });
  setConsole(elements.probeResult, payload.result);
}

async function runQuery() {
  const payload = await fetchJson("/api/copilot/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      systemKey: currentSystemKey(),
      query: elements.queryInput.value.trim()
    })
  });

  setConsole(elements.intentBox, payload.intent);
  setConsole(elements.normalizedBox, payload.normalizedEnglish || "");
  setConsole(elements.replyBox, payload.reply);
  setConsole(elements.resultBox, payload.result || "No live API response body returned.", !payload.result);
}

elements.systemKey.addEventListener("change", refreshSessionView);
elements.saveSettings.addEventListener("click", () => saveSettings().catch((error) => setConsole(elements.sessionStatus, error.message)));
elements.loginButton.addEventListener("click", () => login().catch((error) => setConsole(elements.sessionStatus, error.message)));
elements.logoutButton.addEventListener("click", () => logout().catch((error) => setConsole(elements.sessionStatus, error.message)));
elements.probeButton.addEventListener("click", () => probe().catch((error) => setConsole(elements.probeResult, error.message)));
elements.runQuery.addEventListener("click", () => runQuery().catch((error) => setConsole(elements.replyBox, error.message)));

loadBootstrap().catch((error) => {
  setConsole(elements.sessionStatus, error.message);
});
