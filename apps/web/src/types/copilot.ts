export type SystemKey = "pms" | "purchase";

export type SessionState = {
  authenticated: boolean;
  createdAt: string;
  hasToken: boolean;
  hasCookies: boolean;
  lastLoginStatus: number;
};

export type BootstrapResponse = {
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

export type SummaryItem = {
  label: string;
  value: string | number;
};

export type TableColumn = {
  key: string;
  label: string;
};

export type TableRow = Record<string, unknown> & {
  id: string;
  raw?: Record<string, unknown>;
};

export type RowAction = {
  label: string;
  promptTemplate?: string;
  urlTemplate?: string;
};

export type TablePresentation = {
  type: "table";
  title: string;
  subtitle?: string;
  columns: TableColumn[];
  rows: TableRow[];
  summary?: SummaryItem[];
  rowActions?: RowAction[];
};

export type DetailPresentation = {
  type: "detail";
  title: string;
  subtitle?: string;
  fields: Array<{ label: string; value: string }>;
};

export type PayloadPresentation = {
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

export type Presentation = TablePresentation | DetailPresentation | PayloadPresentation | null;

export type PendingAction = {
  action: string;
  systemKey: SystemKey;
  jobId?: string;
  payload: unknown;
};

export type QueryResponse = {
  intent: string;
  normalizedEnglish: string;
  reply: string;
  result: {
    pendingConfirmation?: boolean;
    pendingAction?: PendingAction;
    [key: string]: unknown;
  } | null;
  presentation: Presentation;
};

export type BrowserSpeechRecognition = {
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: {
        resultIndex?: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
      }) => void)
    | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

export type VoiceTranscriptionResponse = {
  ok: boolean;
  transcript: string;
  provider: string;
  model: string;
  mode: string;
};
