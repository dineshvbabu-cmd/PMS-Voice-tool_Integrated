const SESSION_STORAGE_KEY = "atlas_voiceops_session_id";

export function getStoredSessionId() {
  return window.localStorage.getItem(SESSION_STORAGE_KEY) || "";
}

export function setStoredSessionId(sessionId: string) {
  if (sessionId) {
    window.localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } else {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}
