import type { VoiceTranscriptionResponse } from "../types/copilot";
import { getStoredSessionId } from "./session-storage";

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "http://localhost:3100";

export async function apiFetch<T>(path: string, options: RequestInit = {}) {
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

export async function apiUploadAudio(blob: Blob) {
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
