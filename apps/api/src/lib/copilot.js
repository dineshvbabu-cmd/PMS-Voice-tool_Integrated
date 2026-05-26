"use strict";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_LANGUAGE_MODEL = process.env.OPENAI_LANGUAGE_MODEL || "gpt-5.4-mini";

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function normalizeLoose(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsAny(text, phrases) {
  return (phrases || []).some((phrase) => normalize(text).includes(normalize(phrase)));
}

function firstMatch(text, pattern) {
  const match = String(text || "").match(pattern);
  return match?.[1]?.trim() || "";
}

function findDate(text) {
  return firstMatch(text, /(\d{4}-\d{2}-\d{2})/);
}

function findNumberLike(text, pattern) {
  return firstMatch(text, pattern);
}

function findNumericJobId(text) {
  return (
    findNumberLike(text, /ship component job link\s*[:#-]?\s*(\d+)/i) ||
    findNumberLike(text, /job(?:\s+id)?\s*[:#-]?\s*(\d{4,8})/i) ||
    findNumberLike(text, /\b(\d{4,8})\b/)
  );
}

function findJobReference(text) {
  return findNumericJobId(text) || firstMatch(text, /((?:wo|job)[-\s]?\d+)/i);
}

function findRequisitionId(text) {
  return (
    findNumberLike(text, /requisition(?:\s+id)?\s*[:#-]?\s*(\d+)/i) ||
    findNumberLike(text, /\breq(?:uisition)?\s+(\d{3,8})\b/i)
  );
}

function findDescription(text) {
  return (
    firstMatch(text, /(?:description|remarks?|notes?)\s*[:\-]?\s*(.+)$/i) ||
    firstMatch(text, /(?:because|due to)\s+(.+)$/i)
  );
}

function cleanKeyword(value) {
  return String(value || "")
    .replace(/\bvessel\s+/i, "")
    .replace(/\bwhich\s+is\b.*$/i, "")
    .replace(/\bthat\s+is\b.*$/i, "")
    .replace(/\b(in the next|next|coming due|overdue|due|status|with|for|on|and|show|list|find|track|please|all|open|closed|critical|non critical|non-critical|detail|details)\b.*$/i, "")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "")
    .trim();
}

function findKeyword(text) {
  const candidates = [
    firstMatch(text, /["']([^"']{2,80})["']/),
    firstMatch(text, /(?:on|for|in)\s+vessel\s+([a-z0-9][a-z0-9 .&()/-]{1,80})/i),
    firstMatch(text, /vessel\s+([a-z0-9][a-z0-9 .&()/-]{1,80})/i),
    firstMatch(text, /(?:on|for)\s+([a-z0-9][a-z0-9 .&()/-]{1,80}?)(?:[?.!,]|$|\s+(?:in|with|due|overdue|coming|status|where)\b)/i),
    firstMatch(text, /(?:component|equipment|certificate|survey|defect|job|maintenance|requisition|po|purchase order)\s+(?:for|of)?\s*([a-z0-9][a-z0-9 .&()/-]{2,80})/i)
  ]
    .map(cleanKeyword)
    .filter(Boolean);

  return candidates[0] || "";
}

function findDueWindowDays(text) {
  const normalized = normalize(text);

  if (normalized.includes("today")) {
    return "0";
  }

  if (normalized.includes("tomorrow")) {
    return "1";
  }

  if (containsAny(normalized, ["this week", "next week"])) {
    return "7";
  }

  if (containsAny(normalized, ["this month", "next month", "coming month"])) {
    return "30";
  }

  if (containsAny(normalized, ["next 15 days", "due in 15 days"])) {
    return "15";
  }

  if (containsAny(normalized, ["next 30 days", "due in 30 days"])) {
    return "30";
  }

  if (containsAny(normalized, ["next 60 days", "due in 60 days"])) {
    return "60";
  }

  if (normalized.includes("soon")) {
    return "30";
  }

  return (
    findNumberLike(text, /next\s+(\d+)\s+days/i) ||
    findNumberLike(text, /due in\s+(\d+)\s+days/i) ||
    findNumberLike(text, /within\s+(\d+)\s+days/i)
  );
}

function findStatusText(text) {
  const explicit =
    firstMatch(text, /(?:in|at)\s+([a-z0-9 /_-]+?)\s+status(?:\s+(?:for|on|in|with|where)\b|[?.!,]|$)/i) ||
    firstMatch(text, /status(?!\s+(?:for|on|in|with|where|and)\b)\s*[:\-]?\s*([a-z0-9 /_-]+?)(?:\s+(?:for|on|in|with|where)\b|[?.!,]|$)/i);

  if (explicit) {
    return explicit;
  }

  const statuses = [
    "po send",
    "awaiting approval",
    "approved",
    "draft",
    "inquiry",
    "rfq",
    "quoted",
    "ordered",
    "partial receipt",
    "received",
    "invoice pending",
    "invoiced",
    "closed",
    "open"
  ];

  const normalized = normalize(text);
  return statuses.find((status) => normalized.includes(status)) || "";
}

function findPriorityHint(text) {
  const normalized = normalize(text);

  if (containsAny(normalized, ["critical", "high priority", "urgent"])) {
    return "critical";
  }

  if (containsAny(normalized, ["normal priority", "routine", "non critical", "non-critical"])) {
    return "normal";
  }

  return "";
}

function findRequisitionMode(text) {
  const normalized = normalize(text);

  if (containsAny(normalized, ["spare", "spares", "store", "stores", "material", "materials"])) {
    return "stores";
  }

  if (containsAny(normalized, ["service", "services", "survey", "inspection", "vendor", "dockyard"])) {
    return "services";
  }

  return "";
}

function parseEmbeddedJson(text) {
  const fenced = String(text || "").match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];

  if (fenced?.[1]) {
    candidates.push(fenced[1].trim());
  }

  const rawText = String(text || "");
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(rawText.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  return null;
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString().slice(0, 10);
}

function toDisplayText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toDisplayText(entry)).filter(Boolean).join(", ");
  }

  if (typeof value === "object") {
    return "";
  }

  const text = String(value).trim();
  if (!text || text === "null" || text === "undefined") {
    return "";
  }

  return text;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = toDisplayText(value);
    if (text) {
      return text;
    }
  }

  return "";
}

function flattenSearchableText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map((entry) => flattenSearchableText(entry)).join(" ");
  }

  if (typeof value === "object") {
    return Object.values(value)
      .map((entry) => flattenSearchableText(entry))
      .join(" ");
  }

  return String(value);
}

function currentDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function daysFromToday(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date(currentDateOnly());
  const target = new Date(date.toISOString().slice(0, 10));
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

async function routeWithOpenAI(query, systemKey) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_LANGUAGE_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You route Mazik PMS and Mazik Purchase operational requests.",
            "Return strict JSON with keys action, normalizedEnglish, params, explanation.",
            "Supported actions are maintenance_list, maintenance_detail, defects_list, certificates_list, requisitions_list, purchase_orders_list, requisition_detail, close_job, postponement, requisition_create, help.",
            "For list requests, extract filters such as overdue, due, critical, nonCritical, significant, open, closed, completed, statusText, dueWindowDays, and keyword.",
            "Map natural operator wording like jobs, work orders, PM jobs, requisitions, PRs, RFQs, POs, material receipts, invoices, certificates, surveys, expiring, coming due, and blocked by spares.",
            "For close_job params, use jobId, completionDate, closureDescription, maintenanceCauseId, overdueRemarks, currentCounterValue.",
            "For postponement params, use jobId, postponeMode, postponeDate, postponeFrequency, postponeReasonId, remarks, approvedBy, currentDueDate.",
            "For requisition_create params, prefer requisitionPayload when the user provides structured JSON.",
            `The active system is ${systemKey === "purchase" ? "Purchase Link" : "PMS Link"}.`
          ].join(" ")
        },
        {
          role: "user",
          content: query
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI route failed with status ${response.status}`);
  }

  const payload = await response.json();
  return JSON.parse(payload.choices?.[0]?.message?.content || "{}");
}

function routeLocally(query) {
  const text = normalize(query);
  const jobId = findJobReference(query);
  const requisitionId = findRequisitionId(query);
  const date = findDate(query);
  const description = findDescription(query);
  const keyword = findKeyword(query) || description || "";
  const dueWindowDays = findDueWindowDays(query);
  const statusText = findStatusText(query);
  const requisitionPayload = parseEmbeddedJson(query);
  const maintenanceSignals = containsAny(text, [
    "maintenance",
    "maintenances",
    "job",
    "jobs",
    "work order",
    "work orders",
    "workorder",
    "planned maintenance",
    "inspection",
    "service due",
    "pms",
    "component job"
  ]);
  const defectSignals = containsAny(text, ["defect", "defects", "deficiency", "deficiencies"]);
  const certificateSignals = containsAny(text, [
    "certificate",
    "certificates",
    "cert ",
    "certs",
    "survey",
    "surveys",
    "expiring certificate",
    "expiry",
    "expire"
  ]);
  const requisitionSignals = containsAny(text, [
    "requisition",
    "requisitions",
    "purchase request",
    "purchase requests",
    "request",
    "requests",
    "pr ",
    "rfq",
    "inquiry"
  ]);
  const purchaseSignals =
    !requisitionSignals &&
    containsAny(text, [
      "purchase order",
      "purchase orders",
      "po ",
      "po status",
      "spare",
      "spares",
      "material",
      "material receipt",
      "material receipts",
      "goods receipt",
      "invoice",
      "invoices",
      "follow up",
      "follow-up",
      "vendor follow up",
      "procurement"
    ]);
  const detailSignals = containsAny(text, [
    "detail",
    "details",
    "instruction",
    "instructions",
    "read job",
    "read maintenance",
    "show procedure",
    "show instructions",
    "open job"
  ]);

  if (!text || text === "help") {
    return {
      action: "help",
      normalizedEnglish: query,
      params: {}
    };
  }

  if ((text.includes("close") || text.includes("complete")) && jobId) {
    return {
      action: "close_job",
      normalizedEnglish: query,
      params: {
        jobId,
        completionDate: date,
        closureDescription: description,
        maintenanceCauseId: findNumberLike(query, /(?:maintenance\s+cause|cause)\s*(?:id)?\s*[:#-]?\s*(\d+)/i),
        overdueRemarks: firstMatch(query, /overdue\s+remarks?\s*[:\-]?\s*(.+)$/i),
        currentCounterValue: findNumberLike(
          query,
          /current\s+counter(?:\s+value|\s+reading)?\s*[:#-]?\s*(\d+(?:\.\d+)?)/i
        )
      }
    };
  }

  if (text.includes("close") || text.includes("complete")) {
    return {
      action: "close_job",
      normalizedEnglish: query,
      params: {
        jobId,
        completionDate: date,
        closureDescription: description,
        keyword,
        overdueOnly: text.includes("overdue"),
        dueOnly:
          !text.includes("overdue") &&
          (containsAny(text, ["coming due", "due soon", "next week", "next month", "this week", "this month", "tomorrow"]) ||
            /\bdue\b/.test(text)),
        criticalOnly: text.includes("critical") && !text.includes("non critical"),
        nonCriticalOnly: containsAny(text, ["non critical", "non-critical", "normal jobs", "routine jobs"])
      }
    };
  }

  if ((text.includes("postpone") || text.includes("defer")) && jobId) {
    const postponeFrequency = findNumberLike(query, /(?:frequency|interval)\s*[:#-]?\s*(\d+(?:\.\d+)?)/i);
    const postponeDate =
      firstMatch(query, /(?:postpone(?:\s+till)?|defer(?:\s+till)?|until|to)\s+(\d{4}-\d{2}-\d{2})/i) || date;

    return {
      action: "postponement",
      normalizedEnglish: query,
      params: {
        jobId,
        postponeMode: postponeDate ? "Date" : postponeFrequency ? "Frequency" : "",
        postponeDate,
        postponeFrequency,
        postponeReasonId: findNumberLike(query, /(?:postpone\s+reason|reason)\s*(?:id)?\s*[:#-]?\s*(\d+)/i),
        remarks: description,
        approvedBy: findNumberLike(query, /(?:approved\s+by|approver|line\s+manager)\s*(?:id)?\s*[:#-]?\s*(\d+)/i),
        currentDueDate: firstMatch(query, /current\s+due\s+date\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i)
      }
    };
  }

  if (text.includes("postpone") || text.includes("defer")) {
    return {
      action: "postponement",
      normalizedEnglish: query,
      params: {
        jobId,
        postponeMode: date ? "Date" : "",
        postponeDate: date,
        remarks: description,
        keyword,
        overdueOnly: text.includes("overdue"),
        dueOnly:
          !text.includes("overdue") &&
          (containsAny(text, ["coming due", "due soon", "next week", "next month", "this week", "this month", "tomorrow"]) ||
            /\bdue\b/.test(text)),
        criticalOnly: text.includes("critical") && !text.includes("non critical"),
        nonCriticalOnly: containsAny(text, ["non critical", "non-critical", "normal jobs", "routine jobs"])
      }
    };
  }

  if (
    text.includes("create requisition") ||
    text.includes("raise requisition") ||
    text.includes("raise purchase") ||
    text.includes("create request") ||
    text.includes("raise request")
  ) {
    return {
      action: "requisition_create",
      normalizedEnglish: query,
      params: {
        linkedJobId: jobId,
        vesselId: findNumberLike(query, /vessel\s*(?:id)?\s*[:#-]?\s*(\d+)/i),
        workflow: findNumberLike(query, /workflow\s*(?:id)?\s*[:#-]?\s*(\d+)/i),
        title: description || "Requisition generated from copilot request",
        description,
        requisitionPayload,
        keyword
      }
    };
  }

  if ((text.includes("requisition") || text.includes("workflow log") || text.includes("delivery info")) && requisitionId) {
    return {
      action: "requisition_detail",
      normalizedEnglish: query,
      params: {
        requisitionId,
        includeWorkflow: text.includes("workflow") || text.includes("log"),
        includeDelivery: text.includes("delivery")
      }
    };
  }

  if (certificateSignals) {
    let type = "Default";
    if (text.includes("overdue")) {
      type = "Overdue";
    } else if (dueWindowDays === "15") {
      type = "Due in 15 Days";
    } else if (dueWindowDays === "30") {
      type = "Due in 30 Days";
    } else if (dueWindowDays === "60") {
      type = "Due in 60 Days";
    } else if (containsAny(text, ["coming due", "due", "expiring", "expire", "expiry"])) {
      type = "Due";
    }

    let certType = "";
    if (text.includes("survey")) {
      certType = "Survey";
    } else if (text.includes("certificate")) {
      certType = "Certificate";
    } else if (text.includes("flag")) {
      certType = "Flag Specific";
    } else if (text.includes("port")) {
      certType = "Port Specific";
    }

    return {
      action: "certificates_list",
      normalizedEnglish: query,
      params: {
        type,
        certType,
        keyword,
        priorityHint: findPriorityHint(query)
      }
    };
  }

  if (defectSignals) {
    let significant = "All";
    if (text.includes("critical") && text.includes("significant")) {
      significant = "Both";
    } else if (text.includes("critical")) {
      significant = "Critical";
    } else if (text.includes("significant")) {
      significant = "Significant";
    }

    let dueStatus = "All";
    if (text.includes("overdue")) {
      dueStatus = "OverDue";
    } else if (containsAny(text, ["coming due", "due", "due soon"])) {
      dueStatus = "Not OverDue";
    }

    let defectStatus = "All";
    if (text.includes("open")) {
      defectStatus = "Open";
    } else if (text.includes("closed")) {
      defectStatus = "Closed";
    } else if (text.includes("completed")) {
      defectStatus = "Completed";
    }

    return {
      action: "defects_list",
      normalizedEnglish: query,
      params: {
        significant,
        dueStatus,
        defectStatus,
        keyword,
        priorityHint: findPriorityHint(query)
      }
    };
  }

  if (requisitionSignals) {
    return {
      action: "requisitions_list",
      normalizedEnglish: query,
      params: {
        statusText,
        keyword,
        priorityHint: findPriorityHint(query)
      }
    };
  }

  if (purchaseSignals) {
    return {
      action: "purchase_orders_list",
      normalizedEnglish: query,
      params: {
        statusText,
        keyword,
        priorityHint: findPriorityHint(query)
      }
    };
  }

  if (detailSignals && (jobId || maintenanceSignals)) {
    return {
      action: "maintenance_detail",
      normalizedEnglish: query,
      params: { jobId }
    };
  }

  if (
    maintenanceSignals ||
    text.includes("overdue") ||
    (text.includes("critical") && !defectSignals && !certificateSignals) ||
    text.includes("non critical")
  ) {
    return {
      action: "maintenance_list",
      normalizedEnglish: query,
      params: {
        overdueOnly: text.includes("overdue"),
        dueOnly:
          !text.includes("overdue") &&
          (containsAny(text, ["coming due", "due soon", "next week", "next month", "this week", "this month", "tomorrow"]) ||
            /\bdue\b/.test(text)),
        criticalOnly: text.includes("critical") && !text.includes("non critical"),
        nonCriticalOnly: containsAny(text, ["non critical", "non-critical", "normal jobs", "routine jobs"]),
        keyword,
        dueWindowDays,
        priorityHint: findPriorityHint(query)
      }
    };
  }

  return {
    action: "maintenance_list",
    normalizedEnglish: query,
    params: {}
  };
}

async function routePrompt(query, systemKey) {
  const localRoute = routeLocally(query);
  try {
    if (!OPENAI_API_KEY) {
      return localRoute;
    }

    const aiRoute = await routeWithOpenAI(query, systemKey);
    return reconcileRoute(query, aiRoute, localRoute);
  } catch {
    return localRoute;
  }
}

function reconcileRoute(query, aiRoute, localRoute) {
  const text = normalize(query);
  const ai = aiRoute && typeof aiRoute === "object" ? aiRoute : {};
  const local = localRoute && typeof localRoute === "object" ? localRoute : {};

  const maintenanceSignals =
    containsAny(text, ["maintenance", "work order", "workorder", "job", "jobs", "planned maintenance", "inspection"]) ||
    /\bwo[-\s]?\d+/i.test(query) ||
    (text.includes("overdue") && !containsAny(text, ["defect", "certificate", "survey", "requisition", "purchase order", "material receipt"]));

  const defectSignals = containsAny(text, ["defect", "deficiency"]);
  const certificateSignals = containsAny(text, ["certificate", "survey", "expiry", "expiring"]);
  const requisitionSignals = containsAny(text, ["requisition", "purchase request", "rfq", "inquiry"]);
  const purchaseSignals =
    !requisitionSignals &&
    containsAny(text, ["purchase order", "po ", "po status", "material receipt", "invoice", "goods receipt", "procurement"]);

  if (defectSignals && ai.action !== "defects_list") {
    return local;
  }

  if (certificateSignals && ai.action !== "certificates_list") {
    return local;
  }

  if (requisitionSignals && !String(ai.action || "").startsWith("requisition")) {
    return local;
  }

  if (purchaseSignals && ai.action !== "purchase_orders_list") {
    return local;
  }

  if (maintenanceSignals) {
    const allowed = new Set(["maintenance_list", "maintenance_detail", "close_job", "postponement"]);
    if (!allowed.has(String(ai.action || ""))) {
      return local;
    }
  }

  return {
    ...local,
    ...ai,
    params: {
      ...(local.params || {}),
      ...(ai.params || {})
    },
    normalizedEnglish: ai.normalizedEnglish || local.normalizedEnglish || query
  };
}

function targetSystemForAction(action, fallbackSystemKey) {
  if (["requisitions_list", "purchase_orders_list", "requisition_detail", "requisition_create"].includes(action)) {
    return "purchase";
  }

  if (["maintenance_list", "maintenance_detail", "defects_list", "certificates_list", "close_job", "postponement"].includes(action)) {
    return "pms";
  }

  return fallbackSystemKey === "purchase" ? "purchase" : "pms";
}

function systemLabel(systemKey) {
  return systemKey === "purchase" ? "Purchase Link" : "PMS Link";
}

function summarizeResult(result) {
  if (!result) {
    return "No result returned.";
  }

  if (!result.ok) {
    return result.body?.error || result.body?.message || result.rawText || "The endpoint did not return a successful response.";
  }

  const rows = Array.isArray(result.body?.data) ? result.body.data.length : null;
  if (rows !== null) {
    return `Request succeeded and returned ${rows} rows.`;
  }

  if (result.body?.data && typeof result.body.data === "object") {
    return "Request succeeded and returned a detailed record.";
  }

  return "Request succeeded.";
}

function unwrapResultData(result) {
  if (!result?.body) {
    return null;
  }

  return result.body.data !== undefined ? result.body.data : result.body;
}

function buildPmsForecastQuery(overrides = {}) {
  const { KeyWord, keyword, ...rest } = overrides || {};
  const normalizedKeyword = KeyWord ?? keyword ?? "";

  return {
    PageNumber: 0,
    FromDate: "",
    ToDate: "",
    PageSize: 200,
    Status: 0,
    KeyWord: normalizedKeyword,
    VesselId: 0,
    FleetId: 0,
    Excel: "False",
    Type: "Direct",
    Site: "Office",
    ...rest,
    KeyWord: normalizedKeyword
  };
}

function buildDefectQuery(overrides = {}) {
  const { keyword, ...rest } = overrides || {};
  return {
    pageSize: 200,
    pageNumber: 0,
    status: 0,
    keyword: keyword ?? "",
    vesselId: 0,
    fleetId: 331,
    excel: "False",
    rights: "",
    defectStatus: "All",
    dueStatus: "All",
    type: "Defect",
    significant: "All",
    ...rest
  };
}

function buildCertificateQuery(overrides = {}) {
  const { keyword, type, certType, ...rest } = overrides || {};
  return {
    PageNumber: 0,
    PageSize: 200,
    Status: 0,
    Type: type || "Default",
    KeyWord: keyword ?? "",
    Excel: "False",
    VesselId: 0,
    FleetId: 331,
    PdfType: "No",
    CertType: certType || "",
    ...rest
  };
}

function buildPurchaseTrackingQuery(overrides = {}) {
  const { KeyWord, keyword, track, ...rest } = overrides || {};
  const normalizedKeyword = KeyWord ?? keyword ?? "";
  return {
    PageNumber: 1,
    PageSize: 200,
    Status: 0,
    KeyWord: normalizedKeyword,
    VesselId: 0,
    FleetId: 331,
    targetLoc: "Office",
    track: track || "Requisition Track",
    stage: 0,
    category: 0,
    fromDate: "2026-01-01",
    toDate: currentDateOnly(),
    hazCri: 0,
    roleId: -1,
    excel: "",
    department: 0,
    ColumnName: "",
    IsOpen: 0,
    ...rest,
    KeyWord: normalizedKeyword
  };
}

function normalizeJobId(jobId) {
  return String(jobId || "").match(/\d+/)?.[0] || "";
}

function findForecastRow(rows, detail, jobId) {
  return (rows || []).find((row) => {
    return (
      String(row.shipComponentJobLinkId || "") === String(jobId || "") ||
      (detail?.jobForcastId && String(row.jobForcastId || "") === String(detail.jobForcastId)) ||
      (detail?.jobCode && String(row.jobCode || "") === String(detail.jobCode)) ||
      (detail?.jobName && String(row.jobName || "") === String(detail.jobName))
    );
  });
}

async function resolvePmsJobContext(client, session, jobReference) {
  const jobId = normalizeJobId(jobReference);

  if (!jobId) {
    return {
      ok: false,
      jobId: "",
      error: "Provide the numeric ship component job link id so I can resolve the live Mazik maintenance record."
    };
  }

  const detailResult = await client.getJobDetail("pms", session, jobId);
  if (!detailResult.ok) {
    return {
      ok: false,
      jobId,
      error: summarizeResult(detailResult),
      detailResult
    };
  }

  const detail = unwrapResultData(detailResult);
  let row = null;
  let rowResult = null;

  try {
    rowResult = await client.listDueJobs(
      "pms",
      session,
      buildPmsForecastQuery({ KeyWord: detail?.jobName || detail?.jobCode || jobId })
    );

    if (rowResult.ok) {
      row = findForecastRow(Array.isArray(unwrapResultData(rowResult)) ? unwrapResultData(rowResult) : [], detail, jobId) || null;
    }
  } catch {
    rowResult = null;
  }

  return {
    ok: true,
    jobId,
    detail,
    row,
    detailResult,
    rowResult
  };
}

async function findCandidateMaintenanceJobs(client, session, params = {}) {
  const result = await client.listDueJobs("pms", session, buildPmsForecastQuery(params));
  const rows = result.ok ? applyMaintenanceFilters(Array.isArray(result.body?.data) ? result.body.data : [], params) : [];

  return {
    result,
    rows
  };
}

function isOverdueMaintenance(row) {
  const days = daysFromToday(row?.dueDate || row?.estScheduleDate);
  return normalize(row?.jobStatus).includes("overdue") || (days !== null && days < 0);
}

function isDueSoonMaintenance(row, windowDays) {
  const days = daysFromToday(row?.dueDate || row?.estScheduleDate);
  if (days === null) {
    return false;
  }

  return days >= 0 && days <= windowDays;
}

function applyMaintenanceFilters(rows, params = {}) {
  return (rows || []).filter((row) => {
    if (params.criticalOnly && !(row.jobCritical || row.compCritical)) {
      return false;
    }

    if (params.nonCriticalOnly && (row.jobCritical || row.compCritical)) {
      return false;
    }

    if (params.overdueOnly && !isOverdueMaintenance(row)) {
      return false;
    }

    if (params.dueOnly) {
      const windowDays = Number(params.dueWindowDays || 30);
      if (!isDueSoonMaintenance(row, windowDays)) {
        return false;
      }
    }

    if (params.keyword) {
      const haystack = normalizeLoose(
        [row.vesselName, row.jobName, row.shipComponentName, row.jobCode, row.userPosition]
          .filter(Boolean)
          .join(" ")
      );

      if (!haystack.includes(normalizeLoose(params.keyword))) {
        return false;
      }
    }

    return true;
  });
}

function applyGenericKeywordFilter(rows, keyword) {
  if (!keyword) {
    return rows || [];
  }

  const target = normalizeLoose(keyword);
  return (rows || []).filter((row) => normalizeLoose(flattenSearchableText(row)).includes(target));
}

function applyPurchaseStatusFilter(rows, statusText) {
  if (!statusText) {
    return rows || [];
  }

  const target = normalizeLoose(statusText);
  return (rows || []).filter((row) =>
    normalizeLoose(
      [
        row.currentStatus,
        row.invoiceStatus,
        row.matDeliveryDate,
        row.materialReceipt,
        row.poNumber,
        row.requisitionNumber,
        row.suppllier
      ]
        .filter(Boolean)
        .join(" ")
    ).includes(target)
  );
}

function buildTablePresentation({
  title,
  subtitle,
  columns,
  rows,
  summary,
  rowActions,
  actionTarget
}) {
  return {
    type: "table",
    title,
    subtitle,
    columns,
    rows,
    summary,
    rowActions,
    actionTarget
  };
}

function buildPayloadPresentation(title, message, payload, missingFields, actionName, context = {}) {
  return {
    type: "payload",
    title,
    message,
    payload,
    missingFields: missingFields || [],
    actionName,
    context
  };
}

function buildMaintenancePresentation(result, params = {}) {
  const rows = applyMaintenanceFilters(Array.isArray(result.body?.data) ? result.body.data : [], params);
  return buildTablePresentation({
    title: "Maintenance jobs",
    subtitle: "Live PMS maintenance forecast from Mazik",
    columns: [
      { key: "vesselName", label: "Vessel" },
      { key: "jobName", label: "Job" },
      { key: "shipComponentName", label: "Component" },
      { key: "userPosition", label: "Assigned" },
      { key: "prioirty", label: "Priority" },
      { key: "criticalFlag", label: "Critical" },
      { key: "dueDateFormatted", label: "Due date" },
      { key: "jobStatus", label: "Status" }
    ],
    rows: rows.map((row) => ({
      id: String(row.shipComponentJobLinkId),
      vesselName: row.vesselName,
      jobName: row.jobName,
      shipComponentName: row.shipComponentName,
      userPosition: row.userPosition,
      prioirty: row.prioirty,
      criticalFlag: row.jobCritical || row.compCritical ? "Yes" : "No",
      dueDateFormatted: formatDate(row.dueDate || row.estScheduleDate),
      jobStatus: isOverdueMaintenance(row) ? "Overdue" : row.jobStatus || "Due",
      raw: row
    })),
    summary: [
      { label: "Current page", value: rows.length },
      { label: "Total jobs", value: result.body?.total ?? rows.length },
      { label: "Overdue", value: result.body?.overdue ?? 0 },
      { label: "Critical due", value: result.body?.criticalDue ?? 0 },
      { label: "Critical overdue", value: result.body?.criticalOverdue ?? 0 }
    ],
    rowActions: [
      { label: "Show detail", promptTemplate: "Show maintenance detail for ship component job link {{shipComponentJobLinkId}}" },
      { label: "Close job", promptTemplate: "Close ship component job link {{shipComponentJobLinkId}} completed on {{today}} with remarks work completed satisfactorily" },
      { label: "Postpone", promptTemplate: "Postpone ship component job link {{shipComponentJobLinkId}} until {{plus30}} with reason 5, approver 152, and remarks awaiting spare parts" }
    ],
    actionTarget: "maintenance"
  });
}

function buildMaintenanceDetailPresentation(detail) {
  return {
    type: "detail",
    title: "Maintenance detail",
    subtitle: detail?.jobName || "Live PMS job detail",
    fields: [
      { label: "Job code", value: detail?.jobCode },
      { label: "Component", value: detail?.shipComponentName },
      { label: "Responsibility", value: detail?.positionName },
      { label: "Priority", value: detail?.priorityName },
      { label: "Last done", value: formatDate(detail?.lastDoneDate) },
      { label: "Window", value: `${detail?.windowStart || ""} / ${detail?.windowEnd || ""}`.trim() },
      { label: "Procedure ref", value: detail?.procedureReference },
      { label: "Safety procedure", value: detail?.safetyProcedure },
      { label: "Operational procedure", value: detail?.operationalProcedure }
    ].filter((field) => field.value)
  };
}

function buildDefectPresentation(result, params = {}) {
  const totals = result.body?.total || {};
  const rows = applyGenericKeywordFilter(Array.isArray(result.body?.data) ? result.body.data : [], params.keyword);

  return buildTablePresentation({
    title: "Defects",
    subtitle: "Live PMS defect register from Mazik",
    columns: [
      { key: "vesselName", label: "Vessel" },
      { key: "defectNumber", label: "Reference" },
      { key: "defectStatus", label: "Status" },
      { key: "categoryName", label: "Category" },
      { key: "shipComponentName", label: "Component" },
      { key: "identifiedDateFormatted", label: "Identified" },
      { key: "targetDateFormatted", label: "Target" },
      { key: "overdueLabel", label: "Due state" }
    ],
    rows: rows.map((row) => ({
      id: String(row.defectId),
      vesselName: row.vesselName,
      defectNumber: row.defectNumber,
      defectStatus: row.defectStatus,
      categoryName: row.categoryName,
      shipComponentName: row.shipComponentName || row.defectType || "",
      identifiedDateFormatted: formatDate(row.identifiedDate),
      targetDateFormatted: formatDate(row.targetDate),
      overdueLabel: row.overdueStatus ? "Overdue" : "Current",
      raw: row
    })),
    summary: [
      { label: "Current page", value: rows.length },
      { label: "Total defects", value: totals.total ?? rows.length },
      { label: "Open", value: totals.openDefect ?? 0 },
      { label: "Overdue", value: totals.overdueDefectCount ?? 0 },
      { label: "Critical overdue", value: totals.criticalOverdueDefectCount ?? 0 }
    ],
    rowActions: [],
    actionTarget: "defects"
  });
}

function buildCertificatePresentation(result, params = {}) {
  const rows = applyGenericKeywordFilter(Array.isArray(result.body?.data) ? result.body.data : [], params.keyword);
  return buildTablePresentation({
    title: "Certificates and surveys",
    subtitle: `Live certificate explorer from Mazik${params?.type ? `, view: ${params.type}` : ""}`,
    columns: [
      { key: "vesselName", label: "Vessel" },
      { key: "groupName", label: "Group" },
      { key: "certificateName", label: "Certificate" },
      { key: "certificateNumber", label: "Number" },
      { key: "expiryDateFormatted", label: "Expiry" },
      { key: "dueEndFormatted", label: "Due end" },
      { key: "expiryStatus", label: "Status" }
    ],
    rows: rows.map((row) => ({
      id: String(row.vesselCertificateId),
      vesselName: row.vesselName,
      groupName: row.groupName,
      certificateName: row.certificateName,
      certificateNumber: row.certificateNumber || "-",
      expiryDateFormatted: formatDate(row.expiryDate),
      dueEndFormatted: formatDate(row.dueEnd),
      expiryStatus: row.expiryStatus || "Current",
      raw: row
    })),
    summary: [
      { label: "Current page", value: rows.length },
      { label: "Total records", value: result.body?.total ?? rows.length }
    ],
    rowActions: [],
    actionTarget: "certificates"
  });
}

function buildRequisitionListPresentation(result, params = {}) {
  const rows = applyGenericKeywordFilter(Array.isArray(result.body?.data) ? result.body.data : [], params.keyword);
  return buildTablePresentation({
    title: "Requisitions",
    subtitle: "Live Purchase Link requisition tracking",
    columns: [
      { key: "vesselName", label: "Vessel" },
      { key: "requisitionNumber", label: "Requisition" },
      { key: "currentStatus", label: "Status" },
      { key: "priority", label: "Priority" },
      { key: "category", label: "Category" },
      { key: "assignee", label: "Assignee" },
      { key: "createdDateFormatted", label: "Created" }
    ],
    rows: rows.map((row) => ({
      id: String(row.requisitionId),
      vesselName: row.vesselName,
      requisitionNumber: row.requisitionNumber,
      currentStatus: row.currentStatus,
      priority: row.priority,
      category: row.category,
      assignee: row.assignee,
      createdDateFormatted: formatDate(row.requisitionCreateDate),
      raw: row
    })),
    summary: [
      { label: "Current page", value: rows.length },
      { label: "Total records", value: result.body?.total ?? rows.length },
      { label: "Total pages", value: result.body?.totalPages ?? "-" }
    ],
    rowActions: [
      { label: "Show detail", promptTemplate: "Show requisition {{requisitionId}} detail with workflow log and delivery info" }
    ],
    actionTarget: "requisitions"
  });
}

function buildPurchaseOrderPresentation(result, params = {}) {
  const rows = applyGenericKeywordFilter(Array.isArray(result.body?.data) ? result.body.data : [], params.keyword);
  return buildTablePresentation({
    title: "Purchase orders and material receipt status",
    subtitle: "Live Purchase Link PO tracking",
    columns: [
      { key: "vesselName", label: "Vessel" },
      { key: "poNumber", label: "PO number" },
      { key: "currentStatus", label: "Status" },
      { key: "suppllier", label: "Supplier" },
      { key: "poAmountWithCurrency", label: "PO amount" },
      { key: "matDeliveryDate", label: "Material receipt" },
      { key: "invoiceStatus", label: "Invoice" }
    ],
    rows: rows.map((row) => ({
      id: String(row.poId || row.requisitionId),
      vesselName: row.vesselName,
      poNumber: row.poNumber,
      currentStatus: row.currentStatus,
      suppllier: row.suppllier,
      poAmountWithCurrency: row.poAmountWithCurrency,
      matDeliveryDate: row.matDeliveryDate || row.materialReceipt || "-",
      invoiceStatus: row.invoiceStatus || "-",
      raw: row
    })),
    summary: [
      { label: "Current page", value: rows.length },
      { label: "Total records", value: result.body?.total ?? rows.length },
      { label: "Total pages", value: result.body?.totalPages ?? "-" }
    ],
    rowActions: [
      { label: "Show detail", promptTemplate: "Show requisition {{requisitionId}} detail with workflow log and delivery info" }
    ],
    actionTarget: "purchaseOrders"
  });
}

function firstRecord(value) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  if (value && typeof value === "object") {
    return value;
  }

  return null;
}

function buildRequisitionDetailPresentation(detail, workflow, delivery) {
  const deliveryRecord = firstRecord(delivery);

  return {
    type: "detail",
    title: "Requisition detail",
    subtitle: detail?.documentHeader || `Requisition ${detail?.requisitionId || ""}`.trim(),
    fields: [
      { label: "Vessel", value: firstNonEmpty(detail?.vessel?.vesselName, detail?.vesselName) },
      { label: "Origin", value: firstNonEmpty(detail?.originSite, detail?.officeRecord?.officeName) },
      { label: "Type", value: firstNonEmpty(detail?.pmOrderType?.orderTypes, detail?.pmOrderType?.description) },
      { label: "Priority", value: firstNonEmpty(detail?.pmPreference?.description, detail?.priority, detail?.priorityName) },
      { label: "Department", value: firstNonEmpty(detail?.departments?.departmentName, detail?.departmentName) },
      { label: "Status", value: firstNonEmpty(detail?.approvedReq, detail?.currentStatus) },
      { label: "Description", value: firstNonEmpty(detail?.descriptionData, detail?.description) },
      { label: "Order reference", value: firstNonEmpty(detail?.orderReferenceNames, detail?.orderRef) },
      { label: "Target date", value: formatDate(detail?.targetDate || deliveryRecord?.expectedDeliveryDate) },
      { label: "Expected delivery port", value: firstNonEmpty(deliveryRecord?.expectedDeliveryPort, detail?.expectedDeliveryPort) },
      { label: "Expected delivery date", value: formatDate(deliveryRecord?.expectedDeliveryDate || detail?.expectedDeliveryDate) },
      { label: "Vessel ETA", value: formatDate(deliveryRecord?.vesselETA || detail?.vesselETA) },
      { label: "Vessel ETB", value: formatDate(deliveryRecord?.vesselETB || detail?.vesselETB) },
      { label: "Workflow entries", value: Array.isArray(workflow) ? String(workflow.length) : "" }
    ].filter((field) => field.value)
  };
}

function buildWriteContext(context) {
  return {
    jobName: context?.detail?.jobName || context?.row?.jobName || "",
    vesselName: context?.row?.vesselName || "",
    shipComponentJobLinkId: context?.jobId || "",
    requisitionNumber: context?.detail?.documentHeader || ""
  };
}

function buildCloseJobPayload(context, params) {
  const detail = context.detail || {};
  const row = context.row || {};
  const completionDate = String(params?.completionDate || "");
  const closureDescription = String(params?.closureDescription || "").trim();
  const currentCounterValue =
    params?.currentCounterValue !== undefined && params?.currentCounterValue !== ""
      ? params.currentCounterValue
      : row.currentCounterValue ?? "";
  const overdueRemarks =
    String(params?.overdueRemarks || "").trim() ||
    (isOverdueMaintenance(row) ? closureDescription : "");

  const payload = {
    shipMaintenanceId: detail.shipMaintenanceId || row.shipMaintenanceId || "",
    shipComponentJobLinkId: context.jobId,
    jobForecastId: row.jobForcastId || detail.jobForcastId || detail.jobForecastId || "",
    completionDate,
    CurrentCounterValue: currentCounterValue,
    maintenanceCause: params?.maintenanceCauseId || "",
    completionRemarks: closureDescription,
    overDueRemarks: overdueRemarks,
    maintenancePlanningId: 0,
    workOrderStatus: "Completed"
  };

  const missingFields = [];
  if (!payload.shipMaintenanceId) {
    missingFields.push("shipMaintenanceId");
  }
  if (!payload.jobForecastId) {
    missingFields.push("jobForecastId");
  }
  if (!payload.completionDate) {
    missingFields.push("completionDate");
  }
  if (!payload.completionRemarks) {
    missingFields.push("completionRemarks");
  }
  if (row.counterId && (payload.CurrentCounterValue === "" || payload.CurrentCounterValue === null)) {
    missingFields.push("CurrentCounterValue");
  }
  if (isOverdueMaintenance(row) && !payload.overDueRemarks) {
    missingFields.push("overDueRemarks");
  }

  return {
    payload,
    missingFields
  };
}

function buildPostponementPayload(context, params) {
  const detail = context.detail || {};
  const row = context.row || {};
  const postponeMode =
    params?.postponeMode ||
    (params?.postponeDate ? "Date" : params?.postponeFrequency ? "Frequency" : "");

  const payload = {
    shipMaintenanceId: detail.shipMaintenanceId || row.shipMaintenanceId || "",
    vesselId: params?.vesselId || row.vesselId || "",
    shipComponentJobLinkId: context.jobId,
    jobForecastId: row.jobForcastId || detail.jobForcastId || detail.jobForecastId || "",
    currentDuedate:
      params?.currentDueDate || row.dueDate || row.estScheduleDate || detail.nextScheduleDate || "",
    postponeTill: postponeMode,
    postponeFrequency: params?.postponeFrequency || "",
    postponeDate: params?.postponeDate || "",
    postponeReason: params?.postponeReasonId || "",
    postponeRemarks: String(params?.remarks || "").trim(),
    approvedBy: params?.approvedBy || ""
  };

  const missingFields = [];
  if (!payload.shipMaintenanceId) {
    missingFields.push("shipMaintenanceId");
  }
  if (!payload.vesselId) {
    missingFields.push("vesselId");
  }
  if (!payload.jobForecastId) {
    missingFields.push("jobForecastId");
  }
  if (!payload.currentDuedate) {
    missingFields.push("currentDuedate");
  }
  if (!payload.postponeTill) {
    missingFields.push("postponeTill");
  }
  if (payload.postponeTill === "Date" && !payload.postponeDate) {
    missingFields.push("postponeDate");
  }
  if (payload.postponeTill === "Frequency" && !payload.postponeFrequency) {
    missingFields.push("postponeFrequency");
  }
  if (!payload.postponeReason) {
    missingFields.push("postponeReason");
  }
  if (!payload.postponeRemarks) {
    missingFields.push("postponeRemarks");
  }
  if (!payload.approvedBy) {
    missingFields.push("approvedBy");
  }

  return {
    payload,
    missingFields
  };
}

function buildRequisitionPayload(params) {
  const directPayload = params?.requisitionPayload;
  if (directPayload && typeof directPayload === "object" && !Array.isArray(directPayload)) {
    return {
      payload: directPayload,
      missingFields: []
    };
  }

  const draftPayload = {
    Requisition: {
      vesselId: params?.vesselId || "",
      description: params?.description || params?.title || "",
      linkedJobId: params?.linkedJobId || ""
    },
    items: [],
    templateItems: [],
    workflow: String(params?.workflow || "")
  };

  return {
    payload: draftPayload,
    missingFields: ["requisitionPayload"]
  };
}

function findById(items, id, candidateKeys = ["id", "value", "vesselId", "preferenceTypeId", "serviceTypeId"]) {
  if (id === null || id === undefined || id === "") {
    return null;
  }

  const target = String(id);
  return (items || []).find((item) => candidateKeys.some((key) => String(item?.[key] ?? "") === target)) || null;
}

function findByKeyword(items, keyword, candidateKeys = ["vesselName", "description", "name", "serviceTypeName"]) {
  if (!keyword) {
    return null;
  }

  const target = normalizeLoose(keyword);
  return (
    (items || []).find((item) =>
      candidateKeys.some((key) => normalizeLoose(item?.[key] || "").includes(target))
    ) || null
  );
}

function itemPreviewText(item) {
  if (!item || typeof item !== "object") {
    return "";
  }

  return firstNonEmpty(
    item.componentName,
    item.itemName,
    item.serviceDescription,
    item.sparePartName,
    item.materialName,
    item.description,
    item.sd,
    item.cn,
    item.sn
  );
}

function collectCartIds(payload) {
  const sections = [payload?.items, payload?.templateItems];
  const ids = [];

  sections.forEach((section) => {
    if (!Array.isArray(section)) {
      return;
    }

    section.forEach((entry) => {
      const candidate = entry?.cartId || entry?.cartItemId || entry?.id;
      if (candidate !== null && candidate !== undefined && candidate !== "") {
        ids.push(candidate);
      }
    });
  });

  return ids;
}

async function buildRequisitionDraftContext(client, session, params, payload) {
  const requisition = payload?.Requisition || {};
  const context = {
    description: firstNonEmpty(requisition.description, params?.description, params?.title),
    workflow: String(payload?.workflow || ""),
    linkedJobId: firstNonEmpty(requisition.linkedJobId, params?.linkedJobId),
    itemCount: String(Array.isArray(payload?.items) ? payload.items.length : 0),
    templateItemCount: String(Array.isArray(payload?.templateItems) ? payload.templateItems.length : 0)
  };

  const [vesselsResult, preferenceResult, serviceTypeResult] = await Promise.all([
    client.listVessels("purchase", session).catch(() => null),
    client.listPreferenceTypes("purchase", session).catch(() => null),
    client.listServiceTypes("purchase", session).catch(() => null)
  ]);

  const vessels = Array.isArray(unwrapResultData(vesselsResult)) ? unwrapResultData(vesselsResult) : [];
  const priorities = Array.isArray(unwrapResultData(preferenceResult)) ? unwrapResultData(preferenceResult) : [];
  const serviceTypes = Array.isArray(unwrapResultData(serviceTypeResult)) ? unwrapResultData(serviceTypeResult) : [];

  const resolvedVessel =
    findById(vessels, requisition.vesselId, ["vesselId", "id"]) ||
    findByKeyword(vessels, params?.keyword || params?.description || "", ["vesselName", "vesselCode"]);
  const resolvedPriority = findById(
    priorities,
    requisition.preferenceTypeId || requisition.priorityId,
    ["preferenceTypeId", "id"]
  );
  const resolvedServiceType = findById(
    serviceTypes,
    requisition.serviceTypeId || requisition.orderTypeId,
    ["serviceTypeId", "orderTypesId", "id"]
  );

  context.vessel = firstNonEmpty(resolvedVessel?.vesselName, requisition.vesselName, requisition.vesselId);
  context.priority = firstNonEmpty(
    resolvedPriority?.description,
    requisition.priorityName,
    requisition.priorityId || requisition.preferenceTypeId
  );
  context.serviceType = firstNonEmpty(
    resolvedServiceType?.serviceTypeName,
    resolvedServiceType?.description,
    requisition.serviceTypeName,
    requisition.orderTypeId
  );

  if (!context.vessel && vessels.length) {
    context.availableVessels = vessels
      .slice(0, 6)
      .map((entry) => firstNonEmpty(entry?.vesselName, entry?.vesselCode))
      .filter(Boolean)
      .join(", ");
  }

  if (!context.priority && priorities.length) {
    context.availablePriorities = priorities
      .slice(0, 5)
      .map((entry) => firstNonEmpty(entry?.description, entry?.preferenceTypeName))
      .filter(Boolean)
      .join(", ");
  }

  if (!context.serviceType && serviceTypes.length) {
    context.availableServiceTypes = serviceTypes
      .slice(0, 5)
      .map((entry) => firstNonEmpty(entry?.serviceTypeName, entry?.description))
      .filter(Boolean)
      .join(", ");
  }

  const directItemPreview = []
    .concat(Array.isArray(payload?.items) ? payload.items : [])
    .concat(Array.isArray(payload?.templateItems) ? payload.templateItems : [])
    .map((entry) => itemPreviewText(entry))
    .filter(Boolean);

  if (directItemPreview.length) {
    context.itemPreview = directItemPreview.slice(0, 4).join(", ");
  }

  const cartIds = collectCartIds(payload);
  if (cartIds.length) {
    const displayResult = await client
      .getDisplayCartItems("purchase", session, cartIds, requisition.vesselId || resolvedVessel?.vesselId || 0)
      .catch(() => null);
    const displayItems = Array.isArray(unwrapResultData(displayResult)) ? unwrapResultData(displayResult) : [];
    const displayPreview = displayItems.map((entry) => itemPreviewText(entry)).filter(Boolean);
    if (displayPreview.length) {
      context.cartItems = displayPreview.slice(0, 6).join(", ");
      context.itemCount = String(displayItems.length);
    }
  }

  return context;
}

function buildDraftResult(intent, normalizedEnglish, reply, payload, missingFields, presentation) {
  return {
    intent,
    normalizedEnglish,
    reply,
    result: {
      draft: true,
      missingFields,
      payload
    },
    presentation
  };
}

function buildPendingConfirmation(intent, normalizedEnglish, reply, pendingAction, presentation) {
  return {
    intent,
    normalizedEnglish,
    reply,
    result: {
      pendingConfirmation: true,
      pendingAction
    },
    presentation
  };
}

async function confirmCopilotAction({ client, session, systemKey, action, payload, jobId }) {
  if (action === "close_job") {
    const response = await client.closeJob(systemKey, session, jobId || payload?.shipComponentJobLinkId || "", payload);
    return {
      intent: "Maintenance completion submitted",
      reply: summarizeResult(response),
      result: {
        submittedPayload: payload,
        response
      },
      presentation: buildPayloadPresentation(
        "Maintenance completion submitted",
        "Mazik accepted the maintenance completion request.",
        payload,
        [],
        action
      )
    };
  }

  if (action === "postponement") {
    const response = await client.createPostponement(systemKey, session, payload);
    return {
      intent: "Postponement submitted",
      reply: summarizeResult(response),
      result: {
        submittedPayload: payload,
        response
      },
      presentation: buildPayloadPresentation(
        "Postponement submitted",
        "Mazik accepted the postponement request.",
        payload,
        [],
        action
      )
    };
  }

  if (action === "requisition_create") {
    const response = await client.createRequisition(systemKey, session, payload);
    return {
      intent: "Requisition submitted",
      reply: summarizeResult(response),
      result: {
        submittedPayload: payload,
        response
      },
      presentation: buildPayloadPresentation(
        "Requisition submitted",
        "Mazik accepted the requisition payload.",
        payload,
        [],
        action
      )
    };
  }

  throw new Error(`Unsupported confirmation action: ${action}`);
}

async function executeCopilotQuery({ client, session, sessions, query, systemKey }) {
  const routed = await routePrompt(query, systemKey);
  const action = routed.action || "help";
  const effectiveSystemKey = targetSystemForAction(action, systemKey);
  const effectiveSession = sessions?.[effectiveSystemKey] || (effectiveSystemKey === systemKey ? session : null);
  const targetSystem = systemLabel(effectiveSystemKey);
  const normalizedEnglish = routed.normalizedEnglish || query;
  const autoRoutedNotice =
    effectiveSystemKey !== systemKey && effectiveSession ? `I automatically used ${targetSystem} for this request. ` : "";

  if (action === "help") {
    return {
      intent: "Capabilities",
      normalizedEnglish,
      reply:
        effectiveSystemKey === "purchase"
          ? "I can list requisitions, PO status, material receipt visibility, show requisition detail, and prepare requisition-create actions."
          : "I can list maintenance, overdue jobs, critical jobs, defects, certificates, and prepare close or postponement actions.",
      result: null,
      presentation: null
    };
  }

  if (!effectiveSession) {
    return {
      intent: "Authentication required",
      normalizedEnglish,
      reply: `Log into ${targetSystem} first so I can call the live Mazik API.`,
      result: null,
      presentation: null
    };
  }

  if (action === "maintenance_detail") {
    if (effectiveSystemKey === "purchase") {
      return {
        intent: "Maintenance detail",
        normalizedEnglish,
        reply: "Maintenance drill-down belongs to PMS Link. Switch the active system to PMS Link for this request.",
        result: null,
        presentation: null
      };
    }

    const result = await client.getJobDetail(effectiveSystemKey, effectiveSession, routed.params?.jobId || "");
    const detail = unwrapResultData(result);
    return {
      intent: "Maintenance detail",
      normalizedEnglish,
      reply: `${autoRoutedNotice}${summarizeResult(result)}`.trim(),
      result,
      presentation: result.ok ? buildMaintenanceDetailPresentation(detail) : null
    };
  }

  if (action === "maintenance_list") {
    if (effectiveSystemKey === "purchase") {
      return {
        intent: "Maintenance jobs",
        normalizedEnglish,
        reply: "Maintenance jobs belong to PMS Link. Switch the active system to PMS Link for this request.",
        result: null,
        presentation: null
      };
    }

    const result = await client.listDueJobs(effectiveSystemKey, effectiveSession, buildPmsForecastQuery(routed.params || {}));
    const presentation = result.ok ? buildMaintenancePresentation(result, routed.params || {}) : null;
    const hasActiveMaintenanceFilter =
      Boolean(routed.params?.overdueOnly) ||
      Boolean(routed.params?.dueOnly) ||
      Boolean(routed.params?.criticalOnly) ||
      Boolean(routed.params?.nonCriticalOnly);
    const reply =
      presentation?.type === "table" &&
      hasActiveMaintenanceFilter &&
      presentation.rows.length === 0 &&
      (result.body?.overdue || result.body?.criticalOverdue || result.body?.due)
        ? "Mazik returned the live maintenance totals for this filter, but the direct completion page did not surface matching rows in the current page slice."
        : summarizeResult(result);

    return {
      intent: "Maintenance jobs",
      normalizedEnglish,
      reply: `${autoRoutedNotice}${reply}`.trim(),
      result,
      presentation
    };
  }

  if (action === "defects_list") {
    if (effectiveSystemKey === "purchase") {
      return {
        intent: "Defects",
        normalizedEnglish,
        reply: "Defect management belongs to PMS Link. Switch the active system to PMS Link for this request.",
        result: null,
        presentation: null
      };
    }

    const result = await client.listDefects(effectiveSystemKey, effectiveSession, buildDefectQuery(routed.params || {}));
    return {
      intent: "Defects",
      normalizedEnglish,
      reply: `${autoRoutedNotice}${summarizeResult(result)}`.trim(),
      result,
      presentation: result.ok ? buildDefectPresentation(result, routed.params || {}) : null
    };
  }

  if (action === "certificates_list") {
    if (effectiveSystemKey === "purchase") {
      return {
        intent: "Certificates and surveys",
        normalizedEnglish,
        reply: "Certificate tracking belongs to PMS Link. Switch the active system to PMS Link for this request.",
        result: null,
        presentation: null
      };
    }

    const result = await client.listCertificates(effectiveSystemKey, effectiveSession, buildCertificateQuery(routed.params || {}));
    return {
      intent: "Certificates and surveys",
      normalizedEnglish,
      reply: `${autoRoutedNotice}${summarizeResult(result)}`.trim(),
      result,
      presentation: result.ok ? buildCertificatePresentation(result, routed.params || {}) : null
    };
  }

  if (action === "requisitions_list") {
    if (effectiveSystemKey !== "purchase") {
      return {
        intent: "Requisitions",
        normalizedEnglish,
        reply: "Requisition tracking belongs to Purchase Link. Switch the active system to Purchase Link for this request.",
        result: null,
        presentation: null
      };
    }

    const result = await client.procurementFollowUp(
      effectiveSystemKey,
      effectiveSession,
      buildPurchaseTrackingQuery({ ...(routed.params || {}), track: "Requisition Track" })
    );
    if (result.ok && routed.params?.statusText) {
      result.body.data = applyPurchaseStatusFilter(Array.isArray(result.body?.data) ? result.body.data : [], routed.params.statusText);
    }

    return {
      intent: "Requisitions",
      normalizedEnglish,
      reply: `${autoRoutedNotice}${summarizeResult(result)}`.trim(),
      result,
      presentation: result.ok ? buildRequisitionListPresentation(result, routed.params || {}) : null
    };
  }

  if (action === "purchase_orders_list") {
    if (effectiveSystemKey !== "purchase") {
      return {
        intent: "Purchase orders",
        normalizedEnglish,
        reply: "Purchase order tracking belongs to Purchase Link. Switch the active system to Purchase Link for this request.",
        result: null,
        presentation: null
      };
    }

    const result = await client.procurementFollowUp(
      effectiveSystemKey,
      effectiveSession,
      buildPurchaseTrackingQuery({ ...(routed.params || {}), track: "PO Track" })
    );
    if (result.ok && routed.params?.statusText) {
      result.body.data = applyPurchaseStatusFilter(Array.isArray(result.body?.data) ? result.body.data : [], routed.params.statusText);
    }

    return {
      intent: "Purchase orders",
      normalizedEnglish,
      reply: `${autoRoutedNotice}${summarizeResult(result)}`.trim(),
      result,
      presentation: result.ok ? buildPurchaseOrderPresentation(result, routed.params || {}) : null
    };
  }

  if (action === "requisition_detail") {
    if (effectiveSystemKey !== "purchase") {
      return {
        intent: "Requisition detail",
        normalizedEnglish,
        reply: "Requisition detail belongs to Purchase Link. Switch the active system to Purchase Link for this request.",
        result: null,
        presentation: null
      };
    }

    const detailResult = await client.getRequisitionDetail(effectiveSystemKey, effectiveSession, routed.params?.requisitionId || "");
    const workflowResult = routed.params?.includeWorkflow
      ? await client.getRequisitionLog(effectiveSystemKey, effectiveSession, routed.params?.requisitionId || "")
      : null;
    const deliveryResult = routed.params?.includeDelivery
      ? await client.getRequisitionDeliveryInfo(effectiveSystemKey, effectiveSession, routed.params?.requisitionId || "")
      : null;

    const detail = unwrapResultData(detailResult);
    const workflow = unwrapResultData(workflowResult);
    const delivery = unwrapResultData(deliveryResult);

    return {
      intent: "Requisition detail",
      normalizedEnglish,
      reply: `${autoRoutedNotice}${summarizeResult(detailResult)}`.trim(),
      result: {
        detail: detailResult,
        workflow: workflowResult,
        delivery: deliveryResult
      },
      presentation: detailResult.ok ? buildRequisitionDetailPresentation(detail, workflow, delivery) : null
    };
  }

  if (action === "close_job") {
    if (effectiveSystemKey === "purchase") {
      return {
        intent: "Close maintenance",
        normalizedEnglish,
        reply: "Maintenance completion belongs to PMS Link. Switch the active system to PMS Link for this request.",
        result: null,
        presentation: null
      };
    }

    if (!routed.params?.jobId) {
      const search = await findCandidateMaintenanceJobs(client, effectiveSession, routed.params || {});
      if (!search.result.ok) {
        return buildDraftResult(
          "Close maintenance draft",
          normalizedEnglish,
          summarizeResult(search.result),
          routed.params || {},
          ["shipComponentJobLinkId"],
          buildPayloadPresentation("Close maintenance draft", summarizeResult(search.result), routed.params || {}, ["shipComponentJobLinkId"], "close_job")
        );
      }

      if (search.rows.length !== 1) {
        return {
          intent: "Select maintenance job",
          normalizedEnglish,
          reply:
            search.rows.length > 1
              ? "I found multiple matching live maintenance jobs. Select the correct job below, then use the row action to close it."
              : "I could not identify a specific job to close from that request. Try naming the exact job, vessel, or due state.",
          result: search.result,
          presentation: buildMaintenancePresentation(search.result, routed.params || {})
        };
      }

      routed.params.jobId = String(search.rows[0].shipComponentJobLinkId || "");
    }

    const context = await resolvePmsJobContext(client, effectiveSession, routed.params?.jobId || "");
    if (!context.ok) {
      return buildDraftResult(
        "Close maintenance draft",
        normalizedEnglish,
        context.error,
        routed.params || {},
        ["shipComponentJobLinkId"],
        buildPayloadPresentation("Close maintenance draft", context.error, routed.params || {}, ["shipComponentJobLinkId"], "close_job")
      );
    }

    const { payload, missingFields } = buildCloseJobPayload(context, routed.params || {});
    if (missingFields.length) {
      return buildDraftResult(
        "Close maintenance draft",
        normalizedEnglish,
        `I resolved the live maintenance record, but I still need ${missingFields.join(", ")} before I can submit the Mazik close-job action.`,
        payload,
        missingFields,
        buildPayloadPresentation(
          "Close maintenance draft",
          "Review the parsed completion payload and add the missing fields.",
          payload,
          missingFields,
          "close_job",
          buildWriteContext(context)
        )
      );
    }

    return buildPendingConfirmation(
      "Close maintenance ready",
      normalizedEnglish,
      `${autoRoutedNotice}I parsed the live maintenance completion payload. Confirm in the UI to submit it to Mazik.`.trim(),
      {
        action: "close_job",
        systemKey: effectiveSystemKey,
        jobId: context.jobId,
        payload
      },
      buildPayloadPresentation(
        "Maintenance completion ready",
        "Review and confirm this completion payload before it is submitted to Mazik.",
        payload,
        [],
        "close_job",
        buildWriteContext(context)
      )
    );
  }

  if (action === "postponement") {
    if (effectiveSystemKey === "purchase") {
      return {
        intent: "Postponement",
        normalizedEnglish,
        reply: "Postponement requests belong to PMS Link. Switch the active system to PMS Link for this request.",
        result: null,
        presentation: null
      };
    }

    if (!routed.params?.jobId) {
      const search = await findCandidateMaintenanceJobs(client, effectiveSession, routed.params || {});
      if (!search.result.ok) {
        return buildDraftResult(
          "Postponement draft",
          normalizedEnglish,
          summarizeResult(search.result),
          routed.params || {},
          ["shipComponentJobLinkId"],
          buildPayloadPresentation("Postponement draft", summarizeResult(search.result), routed.params || {}, ["shipComponentJobLinkId"], "postponement")
        );
      }

      if (search.rows.length !== 1) {
        return {
          intent: "Select maintenance job",
          normalizedEnglish,
          reply:
            search.rows.length > 1
              ? "I found multiple matching live maintenance jobs. Select the correct job below, then use the row action to postpone it."
              : "I could not identify a specific job to postpone from that request. Try naming the exact job, vessel, or due state.",
          result: search.result,
          presentation: buildMaintenancePresentation(search.result, routed.params || {})
        };
      }

      routed.params.jobId = String(search.rows[0].shipComponentJobLinkId || "");
    }

    const context = await resolvePmsJobContext(client, effectiveSession, routed.params?.jobId || "");
    if (!context.ok) {
      return buildDraftResult(
        "Postponement draft",
        normalizedEnglish,
        context.error,
        routed.params || {},
        ["shipComponentJobLinkId"],
        buildPayloadPresentation("Postponement draft", context.error, routed.params || {}, ["shipComponentJobLinkId"], "postponement")
      );
    }

    const { payload, missingFields } = buildPostponementPayload(context, routed.params || {});
    if (missingFields.length) {
      return buildDraftResult(
        "Postponement draft",
        normalizedEnglish,
        `I resolved the live maintenance record, but I still need ${missingFields.join(", ")} before I can submit the Mazik postponement.`,
        payload,
        missingFields,
        buildPayloadPresentation(
          "Postponement draft",
          "Review the parsed postponement payload and add the missing fields.",
          payload,
          missingFields,
          "postponement",
          buildWriteContext(context)
        )
      );
    }

    return buildPendingConfirmation(
      "Postponement ready",
      normalizedEnglish,
      `${autoRoutedNotice}I parsed the live postponement payload. Confirm in the UI to submit it to Mazik.`.trim(),
      {
        action: "postponement",
        systemKey: effectiveSystemKey,
        jobId: context.jobId,
        payload
      },
      buildPayloadPresentation(
        "Maintenance postponement ready",
        "Review and confirm this postponement payload before it is submitted to Mazik.",
        payload,
        [],
        "postponement",
        buildWriteContext(context)
      )
    );
  }

  if (action === "requisition_create") {
    if (effectiveSystemKey !== "purchase") {
      return {
        intent: "Requisition creation",
        normalizedEnglish,
        reply: "Live requisition creation belongs to Purchase Link. Switch the active system to Purchase Link for this request.",
        result: null,
        presentation: null
      };
    }

    const { payload, missingFields } = buildRequisitionPayload(routed.params || {});
    const draftContext = await buildRequisitionDraftContext(client, effectiveSession, routed.params || {}, payload).catch(() => ({}));
    if (missingFields.length) {
      return buildDraftResult(
        "Requisition draft",
        normalizedEnglish,
        "I prepared a requisition draft from your request. Review the resolved vessel, service, and item context below, then add the remaining requisition structure if you want me to submit it.",
        payload,
        missingFields,
        buildPayloadPresentation(
          "Requisition draft",
          "Review the requisition draft and supply the remaining fields before submission.",
          payload,
          missingFields,
          "requisition_create",
          draftContext
        )
      );
    }

    return buildPendingConfirmation(
      "Requisition ready",
      normalizedEnglish,
      `${autoRoutedNotice}I prepared the requisition with resolved business context. Confirm in the UI after checking the vessel, service, and item details.`.trim(),
      {
        action: "requisition_create",
        systemKey: effectiveSystemKey,
        payload
      },
      buildPayloadPresentation(
        "Requisition ready",
        "Review and confirm this requisition draft before it is submitted to Mazik.",
        payload,
        [],
        "requisition_create",
        draftContext
      )
    );
  }

  return {
    intent: "Capabilities",
    normalizedEnglish,
    reply: "I could not classify that request confidently. Try one of the sample prompts.",
    result: null,
    presentation: null
  };
}

module.exports = {
  executeCopilotQuery,
  confirmCopilotAction
};
