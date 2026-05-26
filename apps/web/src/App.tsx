import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, KeyRound, ListFilter, LoaderCircle, Mic, Send, ShieldCheck, Sparkles } from "lucide-react";

type SystemKey = "pms" | "purchase";

type SessionState = {
  authenticated: boolean;
  createdAt: string;
  hasToken: boolean;
  hasCookies: boolean;
  lastLoginStatus: number;
};

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
  settings: Record<string, unknown>;
  session: Record<SystemKey, SessionState | null>;
  samplePrompts: string[];
};

type SummaryItem = {
  label: string;
  value: string | number;
};

type TableColumn = {
  key: string;
  label: string;
};

type TableRow = Record<string, unknown> & {
  id: string;
  raw?: Record<string, unknown>;
};

type RowAction = {
  label: string;
  promptTemplate?: string;
  urlTemplate?: string;
};

type TablePresentation = {
  type: "table";
  title: string;
  subtitle?: string;
  columns: TableColumn[];
  rows: TableRow[];
  summary?: SummaryItem[];
  rowActions?: RowAction[];
};

type DetailPresentation = {
  type: "detail";
  title: string;
  subtitle?: string;
  fields: Array<{ label: string; value: string }>;
};

type PayloadPresentation = {
  type: "payload";
  title: string;
  message?: string;
  payload: unknown;
  missingFields?: string[];
  actionName?: string;
  context?: Record<string, string>;
};

type Presentation = TablePresentation | DetailPresentation | PayloadPresentation | null;

type QueryResponse = {
  intent: string;
  normalizedEnglish: string;
  reply: string;
  result: {
    pendingConfirmation?: boolean;
    pendingAction?: {
      action: string;
      systemKey: SystemKey;
      jobId?: string;
      payload: unknown;
    };
    [key: string]: unknown;
  } | null;
  presentation: Presentation;
};

type BrowserSpeechRecognition = {
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
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
  const hasBody = options.body !== undefined && options.body !== null;

  if (hasBody) {
    headers.set("Content-Type", "application/json");
  }

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

function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().slice(0, 10);
}

function interpolateTemplate(template: string, row?: TableRow | null) {
  const today = new Date();
  const plus30 = new Date(today);
  plus30.setDate(plus30.getDate() + 30);

  const source = {
    ...(row || {}),
    ...(row?.raw || {}),
    today: today.toISOString().slice(0, 10),
    plus30: plus30.toISOString().slice(0, 10)
  } as Record<string, unknown>;

  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => String(source[key.trim()] ?? ""));
}

function App() {
  const queryClient = useQueryClient();
  const [systemKey, setSystemKey] = useState<SystemKey>("pms");
  const [queryInput, setQueryInput] = useState("");
  const [selectedRowId, setSelectedRowId] = useState<string>("");
  const [showPromptLibrary, setShowPromptLibrary] = useState(false);
  const [authForm, setAuthForm] = useState({ username: "", password: "" });
  const [commandOutput, setCommandOutput] = useState<QueryResponse | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const bootstrapQuery = useQuery({
    queryKey: ["bootstrap"],
    queryFn: () => apiFetch<BootstrapResponse>("/api/bootstrap", { method: "GET" })
  });

  const refreshBootstrap = () => {
    queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
  };

  const loginMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ sessionId: string }>("/api/auth/login", {
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

  const queryMutation = useMutation({
    mutationFn: (prompt: string) =>
      apiFetch<QueryResponse>("/api/copilot/query", {
        method: "POST",
        body: JSON.stringify({
          systemKey,
          query: prompt
        })
      }),
    onSuccess: (payload) => {
      setCommandOutput(payload);
    }
  });

  const confirmMutation = useMutation({
    mutationFn: (pendingAction: { action: string; systemKey: SystemKey; jobId?: string; payload: unknown }) =>
      apiFetch<QueryResponse>("/api/copilot/confirm", {
        method: "POST",
        body: JSON.stringify(pendingAction)
      }),
    onSuccess: (payload) => {
      setCommandOutput(payload);
    }
  });

  const bootstrap = bootstrapQuery.data;
  const session = bootstrap?.session?.[systemKey] || null;
  const samplePrompts = bootstrap?.samplePrompts || [];
  const presentation = commandOutput?.presentation || null;

  const selectedRow = useMemo(() => {
    if (!presentation || presentation.type !== "table") {
      return null;
    }

    return presentation.rows.find((row) => row.id === selectedRowId) || presentation.rows[0] || null;
  }, [presentation, selectedRowId]);

  useEffect(() => {
    if (presentation?.type === "table" && presentation.rows.length > 0) {
      setSelectedRowId((current) =>
        presentation.rows.some((row) => row.id === current) ? current : presentation.rows[0].id
      );
    } else {
      setSelectedRowId("");
    }
  }, [presentation]);

  const pendingAction = commandOutput?.result?.pendingConfirmation ? commandOutput.result.pendingAction : null;

  const runPrompt = (prompt: string) => {
    setQueryInput(prompt);
    queryMutation.mutate(prompt);
  };

  useEffect(() => {
    const SpeechRecognitionCtor =
      typeof window !== "undefined"
        ? (window as unknown as {
            SpeechRecognition?: new () => BrowserSpeechRecognition;
            webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
          }).SpeechRecognition ||
          (window as unknown as {
            webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
          }).webkitSpeechRecognition
        : undefined;

    if (!SpeechRecognitionCtor) {
      setVoiceSupported(false);
      recognitionRef.current = null;
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim() || "";
      if (transcript) {
        setQueryInput(transcript);
        queryMutation.mutate(transcript);
      }
    };
    recognition.onerror = () => {
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setVoiceSupported(true);

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  const toggleVoice = () => {
    if (!recognitionRef.current) {
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    setIsListening(true);
    recognitionRef.current.start();
  };

  return (
    <div className="compact-shell">
      <section className="section-card login-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Login</p>
            <h1>{bootstrap?.product.name || "Atlas VoiceOps"}</h1>
            <p className="subcopy">{bootstrap?.product.subtitle || "Mazik Connector Studio"}</p>
          </div>
          <div className={`status-chip ${session?.authenticated ? "online" : "offline"}`}>
            {session?.authenticated ? "Connected" : "Not connected"}
          </div>
        </div>

        <div className="system-toggle">
          <button className={systemKey === "pms" ? "active" : ""} onClick={() => setSystemKey("pms")}>
            PMS Link
          </button>
          <button className={systemKey === "purchase" ? "active" : ""} onClick={() => setSystemKey("purchase")}>
            Purchase Link
          </button>
        </div>

        <div className="login-links">
          <a href={bootstrap?.systems[systemKey].landingUrl || "#"} target="_blank" rel="noreferrer">
            Open live Mazik page
            <ExternalLink size={14} />
          </a>
        </div>

        <label className="field">
          Username
          <input
            value={authForm.username}
            onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
          />
        </label>
        <label className="field">
          Password
          <input
            type="password"
            value={authForm.password}
            onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
          />
        </label>

        <div className="button-strip">
          <button className="primary-button" onClick={() => loginMutation.mutate()} disabled={loginMutation.isPending}>
            <KeyRound size={16} />
            {loginMutation.isPending ? "Logging in" : "Login"}
          </button>
          <button className="secondary-button" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
            Logout
          </button>
        </div>

        <div className="session-box">
          <div className="session-row">
            <span>PMS Link</span>
            <strong>{bootstrap?.session.pms?.authenticated ? "Live session" : "Not logged in"}</strong>
          </div>
          <div className="session-row">
            <span>Purchase Link</span>
            <strong>{bootstrap?.session.purchase?.authenticated ? "Live session" : "Not logged in"}</strong>
          </div>
          <div className="session-row">
            <span>Active API</span>
            <strong>{bootstrap?.systems[systemKey].apiBaseUrl || "-"}</strong>
          </div>
        </div>
      </section>

      <section className="section-card console-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Command Console</p>
            <h2>Query Mazik live data or prepare a real action</h2>
          </div>
          <button className="ghost-button" onClick={() => setShowPromptLibrary((current) => !current)}>
            <ListFilter size={16} />
            {showPromptLibrary ? "Hide prompts" : "Sample prompts"}
          </button>
        </div>

        <div className="assistant-banner">
          <div className="assistant-mark">
            <Sparkles size={18} />
          </div>
          <div>
            <strong>{commandOutput?.intent || "Ready for a live query"}</strong>
            <p>
              {isListening
                ? "Listening for your voice command."
                : commandOutput?.reply ||
                  "Ask for maintenances, defects, certificates, requisitions, PO status, or a write action to prepare."}
            </p>
          </div>
        </div>

        <label className="field">
          Prompt
          <textarea
            rows={6}
            value={queryInput}
            onChange={(event) => setQueryInput(event.target.value)}
            placeholder="Show all overdue maintenances."
          />
        </label>

        <div className="button-strip">
          <button
            className="primary-button"
            onClick={() => queryMutation.mutate(queryInput)}
            disabled={!queryInput || queryMutation.isPending}
          >
            <Send size={16} />
            {queryMutation.isPending ? "Running" : "Run"}
          </button>
          <button
            className={`secondary-button ${isListening ? "voice-active" : ""}`}
            onClick={toggleVoice}
            disabled={!voiceSupported}
          >
            <Mic size={16} />
            {isListening ? "Stop voice" : voiceSupported ? "Voice command" : "Voice unavailable"}
          </button>
          {pendingAction ? (
            <button
              className="confirm-button"
              onClick={() => confirmMutation.mutate(pendingAction)}
              disabled={confirmMutation.isPending}
            >
              <ShieldCheck size={16} />
              {confirmMutation.isPending ? "Submitting" : "Confirm action"}
            </button>
          ) : null}
        </div>

        {showPromptLibrary ? (
          <div className="prompt-library">
            {samplePrompts.map((prompt) => (
              <button key={prompt} className="prompt-pill" onClick={() => runPrompt(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
        ) : null}

        <div className="console-meta">
          <div>
            <span>Normalized English</span>
            <strong>{commandOutput?.normalizedEnglish || "-"}</strong>
          </div>
          <div>
            <span>Write confirmation</span>
            <strong>{pendingAction ? "Required" : "Not pending"}</strong>
          </div>
          <div>
            <span>Voice</span>
            <strong>{voiceSupported ? (isListening ? "Listening" : "Ready") : "Browser support required"}</strong>
          </div>
        </div>
      </section>

      <section className="section-card results-section">
        <div className="section-head">
          <div>
            <p className="eyebrow">Parsed Result</p>
            <h2>{presentation?.title || "Live results will appear here"}</h2>
            <p className="subcopy">{presentation && "subtitle" in presentation ? presentation.subtitle : "Run a prompt to render live Mazik data, payload confirmation, and action context."}</p>
          </div>
          {queryMutation.isPending || confirmMutation.isPending ? (
            <div className="loader-chip">
              <LoaderCircle size={16} className="spin" />
              Working
            </div>
          ) : null}
        </div>

        {!presentation ? (
          <div className="empty-state">
            <CheckCircle2 size={18} />
            <span>Try one of the sample prompts to load maintenances, defects, certificates, requisitions, or PO status.</span>
          </div>
        ) : null}

        {presentation?.type === "table" ? (
          <div className="results-layout">
            <div className="summary-grid">
              {(presentation.summary || []).map((item) => (
                <div key={item.label} className="summary-tile">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>

            <div className="table-shell">
              <div className="table-head">
                {presentation.columns.map((column) => (
                  <span key={column.key}>{column.label}</span>
                ))}
              </div>

              <div className="table-body">
                {presentation.rows.map((row) => (
                  <button
                    key={row.id}
                    className={`table-row ${selectedRow?.id === row.id ? "selected" : ""}`}
                    onClick={() => setSelectedRowId(row.id)}
                  >
                    {presentation.columns.map((column) => (
                      <span key={column.key}>{String(row[column.key] ?? "-")}</span>
                    ))}
                  </button>
                ))}
              </div>
            </div>

            {selectedRow ? (
              <div className="selected-panel">
                <div className="selected-head">
                  <strong>Selected record</strong>
                  <span>ID {selectedRow.id}</span>
                </div>

                <div className="selected-grid">
                  {presentation.columns.map((column) => (
                    <div key={column.key} className="selected-field">
                      <span>{column.label}</span>
                      <strong>{String(selectedRow[column.key] ?? "-")}</strong>
                    </div>
                  ))}
                </div>

                {presentation.rowActions?.length ? (
                  <div className="row-action-group">
                    {presentation.rowActions.map((action) =>
                      action.promptTemplate ? (
                        <button
                          key={action.label}
                          className="secondary-button"
                          onClick={() => runPrompt(interpolateTemplate(action.promptTemplate || "", selectedRow))}
                        >
                          {action.label}
                        </button>
                      ) : action.urlTemplate ? (
                        <a
                          key={action.label}
                          className="secondary-link"
                          href={interpolateTemplate(action.urlTemplate, selectedRow)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {action.label}
                        </a>
                      ) : null
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {presentation?.type === "detail" ? (
          <div className="detail-grid">
            {presentation.fields.map((field) => (
              <div key={field.label} className="detail-card">
                <span>{field.label}</span>
                <strong>{field.value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {presentation?.type === "payload" ? (
          <div className="payload-layout">
            <div className="payload-banner">
              <strong>{presentation.message || "Review the parsed payload."}</strong>
              {presentation.missingFields?.length ? (
                <span>Missing: {presentation.missingFields.join(", ")}</span>
              ) : (
                <span>Ready for confirmation</span>
              )}
            </div>

            {presentation.context ? (
              <div className="detail-grid">
                {Object.entries(presentation.context).map(([key, value]) => (
                  value ? (
                    <div key={key} className="detail-card">
                      <span>{key}</span>
                      <strong>{value}</strong>
                    </div>
                  ) : null
                ))}
              </div>
            ) : null}

            <pre className="payload-box">{formatJson(presentation.payload)}</pre>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default App;
