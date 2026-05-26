import { useEffect, useState, useTransition } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Bot,
  Cable,
  CheckCircle2,
  ChevronRight,
  Compass,
  Database,
  KeyRound,
  Layers3,
  Link2,
  Radar,
  Save,
  SearchCheck,
  Send,
  Sparkles
} from "lucide-react";

type SystemKey = "pms" | "purchase";

type BootstrapResponse = {
  product: {
    name: string;
    subtitle: string;
  };
  systems: Record<
    SystemKey,
    {
      name: string;
      webBaseUrl: string;
      apiBaseUrl: string;
      landingUrl: string;
    }
  >;
  settings: Record<string, string | boolean | string[] | Record<string, string>>;
  session: Record<SystemKey, SessionState | null>;
  discoveredFacts: string[];
  samplePrompts: string[];
};

type SessionState = {
  authenticated: boolean;
  createdAt: string;
  hasToken: boolean;
  hasCookies: boolean;
  lastLoginStatus: number;
};

type InventoryResponse = {
  pmsRoutes: string[];
  purchaseRouteGroups: Array<{ category: string; routes: string[] }>;
  liveEndpoints: {
    pms: {
      read: InventoryEndpoint[];
      support: string[];
    };
    purchase: {
      read: InventoryEndpoint[];
      support: string[];
    };
  };
};

type InventoryEndpoint = {
  key: string;
  label: string;
  method: string;
  path: string;
  notes: string;
};

type QueryResponse = {
  intent: string;
  normalizedEnglish: string;
  reply: string;
  result: unknown;
};

type SettingsForm = {
  pmsWebBaseUrl: string;
  pmsApiBaseUrl: string;
  pmsMaintenanceForecastUrl: string;
  pmsDueJobsPath: string;
  pmsJobDetailPath: string;
  pmsCloseJobPath: string;
  pmsPostponementPath: string;
  pmsRequisitionPath: string;
  purchaseWebBaseUrl: string;
  purchaseApiBaseUrl: string;
  purchaseRequisitionTrackingUrl: string;
  purchaseRequisitionPath: string;
  purchaseFollowupPath: string;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:3100";
const SESSION_STORAGE_KEY = "atlas_voiceops_session_id";

function getStoredSessionId() {
  return window.localStorage.getItem(SESSION_STORAGE_KEY) || "";
}

function setStoredSessionId(sessionId: string) {
  if (sessionId) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } else {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

async function apiFetch<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");

  const sessionId = getStoredSessionId();
  if (sessionId) {
    headers.set("x-session-id", sessionId);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  const payload = (await response.json()) as T & { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Request failed with status ${response.status}`);
  }

  return payload;
}

function createSettingsForm(bootstrap?: BootstrapResponse): SettingsForm {
  return {
    pmsWebBaseUrl: String(bootstrap?.settings.pmsWebBaseUrl || ""),
    pmsApiBaseUrl: String(bootstrap?.settings.pmsApiBaseUrl || ""),
    pmsMaintenanceForecastUrl: String(bootstrap?.settings.pmsMaintenanceForecastUrl || ""),
    pmsDueJobsPath: String(bootstrap?.settings.pmsDueJobsPath || ""),
    pmsJobDetailPath: String(bootstrap?.settings.pmsJobDetailPath || ""),
    pmsCloseJobPath: String(bootstrap?.settings.pmsCloseJobPath || ""),
    pmsPostponementPath: String(bootstrap?.settings.pmsPostponementPath || ""),
    pmsRequisitionPath: String(bootstrap?.settings.pmsRequisitionPath || ""),
    purchaseWebBaseUrl: String(bootstrap?.settings.purchaseWebBaseUrl || ""),
    purchaseApiBaseUrl: String(bootstrap?.settings.purchaseApiBaseUrl || ""),
    purchaseRequisitionTrackingUrl: String(bootstrap?.settings.purchaseRequisitionTrackingUrl || ""),
    purchaseRequisitionPath: String(bootstrap?.settings.purchaseRequisitionPath || ""),
    purchaseFollowupPath: String(bootstrap?.settings.purchaseFollowupPath || "")
  };
}

function formatJson(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2);
}

function App() {
  const queryClient = useQueryClient();
  const [systemKey, setSystemKey] = useState<SystemKey>("pms");
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(() => createSettingsForm());
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [probePath, setProbePath] = useState("");
  const [probeOutput, setProbeOutput] = useState("Choose a path and probe a live endpoint.");
  const [commandOutput, setCommandOutput] = useState<QueryResponse | null>(null);
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const [isRefreshingState, startTransition] = useTransition();

  const bootstrapQuery = useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => apiFetch<BootstrapResponse>("/api/bootstrap", { method: "GET" })
  });

  const inventoryQuery = useQuery({
    queryKey: ["inventory"],
    queryFn: () => apiFetch<InventoryResponse>("/api/inventory", { method: "GET" })
  });

  useEffect(() => {
    if (bootstrapQuery.data) {
      setSettingsForm(createSettingsForm(bootstrapQuery.data));
      if (!probePath) {
        setProbePath(
          systemKey === "purchase"
            ? String(bootstrapQuery.data.settings.purchaseFollowupPath || "")
            : String(bootstrapQuery.data.settings.pmsDueJobsPath || "")
        );
      }
    }
  }, [bootstrapQuery.data]);

  useEffect(() => {
    setProbePath(
      systemKey === "purchase" ? settingsForm.purchaseFollowupPath : settingsForm.pmsDueJobsPath
    );
  }, [systemKey, settingsForm.purchaseFollowupPath, settingsForm.pmsDueJobsPath]);

  const refreshBootstrap = () => {
    startTransition(() => {
      queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
    });
  };

  const saveSettings = useMutation({
    mutationFn: (payload: SettingsForm) =>
      apiFetch<{ ok: boolean; settings: SettingsForm }>("/api/settings", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      refreshBootstrap();
    }
  });

  const loginMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ sessionId: string; message: string; loginPayload: unknown }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          systemKey,
          username: authForm.username,
          password: authForm.password
        })
      }),
    onSuccess: (payload) => {
      setStoredSessionId(payload.sessionId || "");
      refreshBootstrap();
    }
  });

  const logoutMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean }>("/api/auth/logout", {
        method: "POST",
        body: JSON.stringify({ systemKey })
      }),
    onSuccess: () => {
      refreshBootstrap();
    }
  });

  const probeMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ ok: boolean; result: unknown }>("/api/probe", {
        method: "POST",
        body: JSON.stringify({
          systemKey,
          path: probePath,
          method: "GET"
        })
      }),
    onSuccess: (payload) => {
      setProbeOutput(formatJson(payload.result));
    }
  });

  const queryMutation = useMutation({
    mutationFn: () =>
      apiFetch<QueryResponse>("/api/copilot/query", {
        method: "POST",
        body: JSON.stringify({
          systemKey,
          query: queryInput
        })
      }),
    onSuccess: (payload) => {
      setCommandOutput(payload);
    }
  });

  const bootstrap = bootstrapQuery.data;
  const inventory = inventoryQuery.data;
  const currentSession = bootstrap?.session?.[systemKey] || null;
  const endpointSuggestions =
    systemKey === "purchase" ? inventory?.liveEndpoints.purchase.read || [] : inventory?.liveEndpoints.pms.read || [];

  const routeSummary =
    systemKey === "purchase"
      ? inventory?.purchaseRouteGroups.flatMap((group) => group.routes) || []
      : inventory?.pmsRoutes || [];

  return (
    <div className="app-shell">
      <aside className="left-rail">
        <div className="brand-block">
          <div className="brand-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="eyebrow">Integrated UI</p>
            <h1>{bootstrap?.product.name || "Atlas VoiceOps"}</h1>
            <p className="subline">{bootstrap?.product.subtitle || "Mazik Connector Studio"}</p>
          </div>
        </div>

        <div className="rail-section">
          <p className="rail-title">Systems</p>
          <button
            className={`system-card ${systemKey === "pms" ? "active" : ""}`}
            onClick={() => setSystemKey("pms")}
          >
            <div>
              <strong>PMS Link</strong>
              <span>Maintenance forecasting and closures</span>
            </div>
            <ChevronRight size={16} />
          </button>
          <button
            className={`system-card ${systemKey === "purchase" ? "active" : ""}`}
            onClick={() => setSystemKey("purchase")}
          >
            <div>
              <strong>Purchase Link</strong>
              <span>Requisition tracking and workflow</span>
            </div>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="rail-section">
          <p className="rail-title">Status</p>
          <div className="stat-tile">
            <Activity size={18} />
            <div>
              <strong>{currentSession?.authenticated ? "Authenticated" : "Awaiting login"}</strong>
              <span>{systemKey === "pms" ? "PMS Link" : "Purchase Link"} session</span>
            </div>
          </div>
          <div className="stat-tile">
            <Database size={18} />
            <div>
              <strong>{routeSummary.length}</strong>
              <span>Captured route ids</span>
            </div>
          </div>
          <div className="stat-tile">
            <Radar size={18} />
            <div>
              <strong>{endpointSuggestions.length}</strong>
              <span>Live endpoint suggestions</span>
            </div>
          </div>
        </div>

        <div className="rail-section">
          <p className="rail-title">Prompt Library</p>
          <div className="prompt-list">
            {(bootstrap?.samplePrompts || []).map((prompt) => (
              <button
                key={prompt}
                className="prompt-chip"
                onClick={() => setQueryInput(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="workspace">
        <section className="hero-card">
          <div className="hero-copy">
            <p className="eyebrow">Separated Frontend + Backend</p>
            <h2>Production-shaped UI for Mazik PMS and procurement workflows</h2>
            <p>
              This frontend is prepared for a standalone Railway web service and talks to the API
              over a stored session ID rather than same-site cookies, which makes the split deploy clean.
            </p>
          </div>
          <div className="hero-metrics">
            <div className="metric-card">
              <Compass size={18} />
              <strong>{bootstrap?.systems[systemKey].name || "Connector"}</strong>
              <span>Active operating context</span>
            </div>
            <div className="metric-card">
              <Bot size={18} />
              <strong>{bootstrap?.settings.openAiEnabled ? "OpenAI Ready" : "Rule Router Mode"}</strong>
              <span>Command interpretation</span>
            </div>
            <div className="metric-card">
              <Cable size={18} />
              <strong>{isRefreshingState ? "Refreshing" : "Live API Wired"}</strong>
              <span>Backend handshake</span>
            </div>
          </div>
        </section>

        <section className="workspace-grid">
          <article className="panel panel-large">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Command Console</p>
                <h3>Ask the copilot or inspect a live endpoint</h3>
              </div>
              <button className="ghost-button" onClick={() => setInventoryOpen((value) => !value)}>
                <Layers3 size={16} />
                {inventoryOpen ? "Hide inventory" : "View inventory"}
              </button>
            </div>

            <div className="assistant-card">
              <div className="assistant-orb">
                <div className="assistant-orb-core" />
              </div>
              <div>
                <p className="assistant-state">Command router</p>
                <h4>{commandOutput?.intent || "Ready for a query"}</h4>
                <p className="assistant-copy">
                  {commandOutput?.reply ||
                    "Use the command bar to fetch live data, prepare drafts, or inspect connector behavior."}
                </p>
              </div>
            </div>

            <label className="input-label">
              Command
              <textarea
                rows={4}
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                placeholder="Show maintenance forecast for Woodstock due in the next 30 days."
              />
            </label>

            <div className="button-row">
              <button className="primary-button" onClick={() => queryMutation.mutate()} disabled={!queryInput || queryMutation.isPending}>
                <Send size={16} />
                Run command
              </button>
              <button className="secondary-button" onClick={() => probeMutation.mutate()} disabled={!probePath || probeMutation.isPending}>
                <SearchCheck size={16} />
                Probe path
              </button>
            </div>

            <div className="response-grid">
              <div className="response-card">
                <p className="mini-title">Normalized English</p>
                <pre>{commandOutput?.normalizedEnglish || "Waiting for a command."}</pre>
              </div>
              <div className="response-card">
                <p className="mini-title">Probe output</p>
                <pre>{probeOutput}</pre>
              </div>
              <div className="response-card response-card-wide">
                <p className="mini-title">Result payload</p>
                <pre>{commandOutput ? formatJson(commandOutput.result) : "Waiting for a live response."}</pre>
              </div>
            </div>
          </article>

          <article className="panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Session</p>
                <h3>Authenticate to the active system</h3>
              </div>
              <div className={`status-pill ${currentSession?.authenticated ? "online" : "offline"}`}>
                {currentSession?.authenticated ? "Live session" : "Not logged in"}
              </div>
            </div>

            <label className="input-label">
              Mazik username
              <input
                value={authForm.username}
                onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
              />
            </label>
            <label className="input-label">
              Mazik password
              <input
                type="password"
                value={authForm.password}
                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
              />
            </label>

            <div className="button-row">
              <button className="primary-button" onClick={() => loginMutation.mutate()} disabled={loginMutation.isPending}>
                <KeyRound size={16} />
                Login
              </button>
              <button className="secondary-button" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
                <Link2 size={16} />
                Logout
              </button>
            </div>

            <pre className="console-box">
              {formatJson(
                currentSession || {
                  authenticated: false,
                  message: "No session established yet."
                }
              )}
            </pre>
          </article>

          <article className="panel panel-wide">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Connector Settings</p>
                <h3>Live path and host configuration</h3>
              </div>
              <button className="primary-button" onClick={() => saveSettings.mutate(settingsForm)} disabled={saveSettings.isPending}>
                <Save size={16} />
                Save settings
              </button>
            </div>

            <div className="form-grid">
              {Object.entries(settingsForm).map(([key, value]) => (
                <label className="input-label" key={key}>
                  {key}
                  <input
                    value={value}
                    onChange={(event) =>
                      setSettingsForm((current) => ({
                        ...current,
                        [key]: event.target.value
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </article>
        </section>

        {inventoryOpen ? (
          <section className="inventory-grid">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Live Endpoints</p>
                  <h3>Captured read endpoints</h3>
                </div>
              </div>

              <div className="inventory-list">
                {endpointSuggestions.map((endpoint) => (
                  <button
                    key={endpoint.key}
                    className="inventory-item"
                    onClick={() =>
                      setProbePath(endpoint.path)
                    }
                  >
                    <div>
                      <strong>{endpoint.label}</strong>
                      <span>{endpoint.method} {endpoint.path}</span>
                    </div>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Route Inventory</p>
                  <h3>Captured route ids from the live session</h3>
                </div>
              </div>

              <div className="token-cloud">
                {routeSummary.map((route) => (
                  <span key={route} className="route-pill">
                    {route}
                  </span>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Notes</p>
                  <h3>Captured connector facts</h3>
                </div>
              </div>
              <div className="notes-list">
                {(bootstrap?.discoveredFacts || []).map((fact) => (
                  <div key={fact} className="note-row">
                    <CheckCircle2 size={16} />
                    <span>{fact}</span>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;
