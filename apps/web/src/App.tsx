import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, KeyRound, ListFilter, LoaderCircle, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { PresentationRenderer } from "./components/presentation/PresentationRenderer";
import { AssistantOrb } from "./components/ui/AssistantOrb";
import { Button } from "./components/ui/Button";
import { InputField, TextareaField } from "./components/ui/Field";
import { SectionCard, SectionHeader } from "./components/ui/SectionCard";
import { LoaderChip, StatusChip } from "./components/ui/StatusChip";
import { apiFetch, apiUploadAudio } from "./lib/api-client";
import { interpolateTemplate } from "./lib/formatters";
import { setStoredSessionId } from "./lib/session-storage";
import type { BootstrapResponse, BrowserSpeechRecognition, QueryResponse, SystemKey } from "./types/copilot";

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
      <SectionCard className="login-section">
        <SectionHeader
          eyebrow="Login"
          title={bootstrap?.product.name || "Atlas VoiceOps"}
          description={bootstrap?.product.subtitle || "Mazik Connector Studio"}
          titleAs="h1"
          actions={
            <StatusChip tone={session?.authenticated ? "online" : "offline"}>
              {session?.authenticated ? "Connected" : "Not connected"}
            </StatusChip>
          }
        />

        <div className="system-toggle">
          <button
            className={systemKey === "pms" ? "active" : ""}
            onClick={() => setSystemKey("pms")}
            aria-pressed={systemKey === "pms"}
            type="button"
          >
            PMS Link
          </button>
          <button
            className={systemKey === "purchase" ? "active" : ""}
            onClick={() => setSystemKey("purchase")}
            aria-pressed={systemKey === "purchase"}
            type="button"
          >
            Purchase Link
          </button>
        </div>

        <div className="login-links">
          <a href={bootstrap?.systems[systemKey].landingUrl || "#"} target="_blank" rel="noreferrer">
            Open live Mazik page
            <ExternalLink size={14} />
          </a>
        </div>

        <InputField
          label="Username"
          value={authForm.username}
          autoComplete="username"
          onChange={(event) => setAuthForm((current) => ({ ...current, username: event.target.value }))}
        />
        <InputField
          label="Password"
          type="password"
          value={authForm.password}
          autoComplete="current-password"
          onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
        />

        <div className="button-strip">
          <Button variant="primary" icon={<KeyRound size={16} />} onClick={() => loginMutation.mutate()} disabled={loginMutation.isPending}>
            {loginMutation.isPending ? "Logging in" : "Login"}
          </Button>
          <Button variant="secondary" onClick={() => logoutMutation.mutate()} disabled={logoutMutation.isPending}>
            Logout
          </Button>
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
      </SectionCard>

      <SectionCard className="console-section">
        <SectionHeader
          eyebrow="Command Console"
          title="Query Mazik live data or prepare a real action"
          actions={
            <Button
              variant="ghost"
              icon={<ListFilter size={16} />}
              onClick={() => setShowPromptLibrary((current) => !current)}
              aria-expanded={showPromptLibrary}
            >
              {showPromptLibrary ? "Hide prompts" : "Sample prompts"}
            </Button>
          }
        />

        <div className="assistant-banner" role="status" aria-live="polite">
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

        <TextareaField
          label="Prompt"
          rows={6}
          value={queryInput}
          onChange={(event) => setQueryInput(event.target.value)}
          placeholder="Type a request, or tap the assistant to speak."
        />

        <div className="assistant-dock">
          <AssistantOrb
            isListening={isListening}
            isArmed={hasTypedPrompt}
            onClick={activateAssistant}
            disabled={(!voiceInputEnabled && !hasTypedPrompt) || queryMutation.isPending || isTranscribing}
            label={isListening ? "Stop listening" : hasTypedPrompt ? "Send typed request" : "Start voice assistant"}
            icon={isListening ? <Mic size={22} /> : <Sparkles size={22} />}
          />
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
            <Button
              variant="confirm"
              icon={<ShieldCheck size={16} />}
              onClick={() => confirmMutation.mutate(pendingAction)}
              disabled={confirmMutation.isPending}
            >
              {confirmMutation.isPending ? "Submitting" : "Confirm action"}
            </Button>
          ) : null}
        </div>

        {showPromptLibrary ? (
          <div className="prompt-library">
            {samplePrompts.map((prompt) => (
              <button key={prompt} className="prompt-pill" onClick={() => runPrompt(prompt)} type="button">
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
      </SectionCard>

      <SectionCard className="results-section">
        <SectionHeader
          eyebrow="Parsed Result"
          title={presentation?.title || "Live results will appear here"}
          description={
            presentation && "subtitle" in presentation
              ? presentation.subtitle
              : "Run a prompt to render live Mazik data, payload confirmation, and action context."
          }
          actions={
            queryMutation.isPending || confirmMutation.isPending ? (
              <LoaderChip>
                <LoaderCircle size={16} className="spin" />
                Working
              </LoaderChip>
            ) : null
          }
        />

        <PresentationRenderer
          presentation={presentation}
          selectedRow={selectedRow}
          selectedRowId={selectedRowId}
          hasPendingAction={Boolean(pendingAction)}
          onSelectRow={setSelectedRowId}
          onRunPrompt={runPrompt}
          interpolateTemplate={interpolateTemplate}
        />
      </SectionCard>
    </div>
  );
}

export default App;
