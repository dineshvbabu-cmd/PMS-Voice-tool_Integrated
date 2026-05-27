import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, KeyRound, ListFilter, LoaderCircle, Mic, ShieldCheck, Sparkles } from "lucide-react";

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
  settings: {
    openAiEnabled?: boolean;
    [key: string]: unknown;
  };
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
  detailFields?: Array<{ label: string; value: string }>;
  reviewFields?: Array<{ label: string; value: string }>;
  technicalLabel?: string;
  showTechnicalPayload?: boolean;
  detailSectionTitle?: string;
  reviewSectionTitle?: string;
  contextSectionTitle?: string;
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
  onresult: ((event: { resultIndex?: number; results: ArrayLike<(ArrayLike<{ transcript: string }> & { isFinal?: boolean })> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

type VoiceTranscriptionResponse = {
  ok: boolean;
  transcript: string;
  provider: string;
  model: string;
  mode: string;
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

async function apiUploadAudio(blob: Blob) {
  const headers = new Headers();
  const sessionId = getStoredSessionId();
  if (sessionId) {
    headers.set("x-session-id", sessionId);
  }
  headers.set("Content-Type", blob.type || "audio/webm");
  headers.set("x-audio-filename", `voice-${Date.now()}.webm`);

  const response = await fetch(`${API_BASE_URL}/api/voice/transcribe`, {
    method: "POST",
    headers,
    body: blob
  });

  const payload = (await response.json()) as VoiceTranscriptionResponse & { error?: string; message?: string };
  if (!response.ok) {
    throw new Error(payload.error || payload.message || `Voice transcription failed with status ${response.status}`);
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

function formatContextLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const voiceStopTimerRef = useRef<number | null>(null);
  const recognitionFinalTranscriptRef = useRef("");
  const recognitionInterimTranscriptRef = useRef("");
  const lastSubmittedPromptRef = useRef("");

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
  const hasTypedPrompt = queryInput.trim().length > 0;
  const serverVoiceEnabled =
    Boolean(bootstrap?.settings?.openAiEnabled) &&
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);
  const voiceInputEnabled = serverVoiceEnabled || voiceSupported;

  const submitPrompt = (prompt: string) => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt) {
      return;
    }

    lastSubmittedPromptRef.current = normalizedPrompt;
    setQueryInput(normalizedPrompt);
    queryMutation.mutate(normalizedPrompt);
  };

  const runPrompt = (prompt: string) => {
    submitPrompt(prompt);
  };

  const setVoiceError = (message: string) => {
    setCommandOutput({
      intent: "Voice capture",
      normalizedEnglish: "",
      reply: message,
      result: null,
      presentation: null
    });
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
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (event) => {
      let finalTranscript = recognitionFinalTranscriptRef.current;
      let interimTranscript = "";

      for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = Array.from(result)
          .map((entry) => entry.transcript)
          .join(" ")
          .trim();

        if (!transcript) {
          continue;
        }

        if (result.isFinal) {
          finalTranscript = `${finalTranscript} ${transcript}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${transcript}`.trim();
        }
      }

      recognitionFinalTranscriptRef.current = finalTranscript;
      recognitionInterimTranscriptRef.current = interimTranscript;
      setQueryInput(`${finalTranscript} ${interimTranscript}`.trim());
    };
    recognition.onerror = () => {
      setIsListening(false);
    };
    recognition.onend = () => {
      const transcript = `${recognitionFinalTranscriptRef.current} ${recognitionInterimTranscriptRef.current}`.trim();
      recognitionFinalTranscriptRef.current = "";
      recognitionInterimTranscriptRef.current = "";
      setIsListening(false);
      if (transcript) {
        submitPrompt(transcript);
      }
    };

    recognitionRef.current = recognition;
    setVoiceSupported(true);

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (voiceStopTimerRef.current) {
        window.clearTimeout(voiceStopTimerRef.current);
      }

      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const preferredAudioMimeType = () => {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
  };

  const startBrowserRecognition = () => {
    if (!recognitionRef.current) {
      return;
    }

    recognitionFinalTranscriptRef.current = "";
    recognitionInterimTranscriptRef.current = "";
    setQueryInput("");
    setIsListening(true);
    recognitionRef.current.start();
  };

  const fallbackToBrowserVoice = (message: string) => {
    if (voiceSupported) {
      setVoiceError(`${message} Falling back to browser voice recognition.`);
      startBrowserRecognition();
      return true;
    }

    setVoiceError(message);
    return false;
  };

  const startServerRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
          sampleSize: 16
        }
      });

      const mimeType = preferredAudioMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (voiceStopTimerRef.current) {
          window.clearTimeout(voiceStopTimerRef.current);
          voiceStopTimerRef.current = null;
        }

        setIsListening(false);
        const streamToStop = mediaStreamRef.current;
        mediaStreamRef.current = null;
        streamToStop?.getTracks().forEach((track) => track.stop());

        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || mimeType || "audio/webm"
        });
        mediaRecorderRef.current = null;
        audioChunksRef.current = [];

        if (!blob.size) {
          return;
        }

        setIsTranscribing(true);
        try {
          const payload = await apiUploadAudio(blob);
          const transcript = payload.transcript?.trim() || "";
          if (!transcript) {
            fallbackToBrowserVoice("I could not hear a clear request from the server transcription.");
            return;
          }

          submitPrompt(transcript);
        } catch (error) {
          fallbackToBrowserVoice(error instanceof Error ? error.message : "Voice transcription failed.");
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start(1000);
      setQueryInput("");
      setIsListening(true);
      voiceStopTimerRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state !== "inactive") {
          mediaRecorderRef.current?.stop();
        }
      }, 180000);
    } catch (error) {
      setVoiceError(
        error instanceof Error ? error.message : "Microphone access failed. Check browser microphone permissions."
      );
    }
  };

  useEffect(() => {
    const normalizedPrompt = queryInput.trim();
    if (!normalizedPrompt || normalizedPrompt === lastSubmittedPromptRef.current) {
      return undefined;
    }

    if (isListening || isTranscribing || queryMutation.isPending) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      if (normalizedPrompt && normalizedPrompt !== lastSubmittedPromptRef.current) {
        submitPrompt(normalizedPrompt);
      }
    }, 950);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [queryInput, isListening, isTranscribing, queryMutation.isPending]);

  const activateAssistant = () => {
    if (queryMutation.isPending || isTranscribing) {
      return;
    }

    if (isListening) {
      if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      } else if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      return;
    }

    if (hasTypedPrompt) {
      submitPrompt(queryInput.trim());
      return;
    }

    if (serverVoiceEnabled) {
      void startServerRecording();
      return;
    }

    if (voiceSupported) {
      startBrowserRecognition();
    }
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
                ? "Listening for your voice command. Tap again when you finish speaking."
                : isTranscribing
                  ? "Transcribing your audio into English for the assistant."
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
            placeholder="Type a request, or tap the assistant to speak."
          />
        </label>

        <div className="assistant-dock">
          <button
            className={`assistant-orb ${isListening ? "listening" : ""} ${hasTypedPrompt ? "armed" : ""}`}
            onClick={activateAssistant}
            disabled={(!voiceInputEnabled && !hasTypedPrompt) || queryMutation.isPending || isTranscribing}
            aria-label={isListening ? "Stop listening" : hasTypedPrompt ? "Send typed request" : "Start voice assistant"}
          >
            <span className="assistant-orb-core">
              {isListening ? <Mic size={22} /> : <Sparkles size={22} />}
            </span>
          </button>
          <div className="assistant-dock-copy">
            <strong>
              {isTranscribing
                ? "Transcribing your voice"
                : queryMutation.isPending
                ? "Working on your request"
                : isListening
                  ? "Listening now"
                  : hasTypedPrompt
                    ? "Tap the assistant to send"
                    : voiceInputEnabled
                      ? "Tap the assistant to speak"
                      : "Type a request to send"}
            </strong>
            <span>
              {isListening
                ? "Speak naturally in your accent or language. Tap once more to stop when you are done."
                : isTranscribing
                  ? "Your recording is being converted into English with a maritime-aware transcription prompt."
                : hasTypedPrompt
                  ? "Your typed prompt is ready. One tap sends it like a copilot command."
                  : serverVoiceEnabled
                    ? "Voice capture stays open longer now and uses OpenAI transcription for stronger accent recognition, with browser fallback if needed."
                    : "Use voice for hands-free operation, or type first and tap once to run."}
            </span>
          </div>
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
            <strong>
              {isTranscribing
                ? "Transcribing"
                : voiceInputEnabled
                  ? isListening
                    ? "Listening"
                    : serverVoiceEnabled
                      ? "OpenAI voice ready"
                      : "Browser voice ready"
                  : "Type-only mode"}
            </strong>
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
                <span>Missing: {presentation.missingFields.map(formatContextLabel).join(", ")}</span>
              ) : (
                <span>Ready for confirmation</span>
              )}
            </div>

            {presentation.detailFields?.length ? (
              <div className="payload-section">
                <div className="payload-section-header">{presentation.detailSectionTitle || "Live job detail"}</div>
                <div className="detail-grid">
                  {presentation.detailFields.map((field) => (
                    <div key={`${field.label}-${field.value}`} className="detail-card">
                      <span>{field.label}</span>
                      <strong>{field.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {presentation.reviewFields?.length ? (
              <div className="payload-section">
                <div className="payload-section-header">
                  {presentation.reviewSectionTitle || (pendingAction ? "Action ready for confirmation" : "Action details still needed")}
                </div>
                <div className="detail-grid">
                  {presentation.reviewFields.map((field) => (
                    <div key={`${field.label}-${field.value}`} className="detail-card">
                      <span>{field.label}</span>
                      <strong>{field.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {presentation.context ? (
              <div className="payload-section">
                <div className="payload-section-header">{presentation.contextSectionTitle || "Additional context"}</div>
                <div className="detail-grid">
                  {Object.entries(presentation.context).map(([key, value]) => (
                    value ? (
                      <div key={key} className="detail-card">
                        <span>{formatContextLabel(key)}</span>
                        <strong>{value}</strong>
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
            ) : null}

            {presentation.showTechnicalPayload !== false ? (
              <details className="technical-details">
                <summary>{presentation.technicalLabel || "Technical payload"}</summary>
                <pre className="payload-box">{formatJson(presentation.payload)}</pre>
              </details>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default App;
