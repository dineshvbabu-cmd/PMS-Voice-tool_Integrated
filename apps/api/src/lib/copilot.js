"use strict";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_LANGUAGE_MODEL = process.env.OPENAI_LANGUAGE_MODEL || "gpt-5.4-mini";

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
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
  const requisitionPayload = parseEmbeddedJson(query);

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

  if (text.includes("create requisition") || text.includes("raise requisition") || text.includes("raise purchase")) {
    return {
      action: "requisition_create",
      normalizedEnglish: query,
      params: {
        linkedJobId: jobId,
        vesselId: findNumberLike(query, /vessel\s*(?:id)?\s*[:#-]?\s*(\d+)/i),
        workflow: findNumberLike(query, /workflow\s*(?:id)?\s*[:#-]?\s*(\d+)/i),
        title: description || "Requisition generated from copilot request",
        description,
        requisitionPayload
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

  if (text.includes("certificate") || text.includes("survey")) {
    let type = "Default";
    if (text.includes("overdue")) {
      type = "Overdue";
    } else if (text.includes("due in 15")) {
      type = "Due in 15 Days";
    } else if (text.includes("due in 30")) {
      type = "Due in 30 Days";
    } else if (text.includes("due in 60")) {
      type = "Due in 60 Days";
    } else if (text.includes("coming due") || text.includes("due")) {
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
        keyword: description || ""
      }
    };
  }

  if (text.includes("defect")) {
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
    } else if (text.includes("coming due") || text.includes("due")) {
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
        keyword: description || ""
      }
    };
  }

  if (text.includes("requisition")) {
    return {
      action: "requisitions_list",
      normalizedEnglish: query,
      params: {
        statusText: firstMatch(query, /status\s*[:\-]?\s*([a-z0-9 -]+)/i) || "",
        keyword: description || ""
      }
    };
  }

  if (text.includes("purchase order") || text.includes("po status") || text.includes("po ") || text.includes("material receipt") || text.includes("invoice")) {
    return {
      action: "purchase_orders_list",
      normalizedEnglish: query,
      params: {
        statusText: firstMatch(query, /status\s*[:\-]?\s*([a-z0-9 -]+)/i) || "",
        keyword: description || ""
      }
    };
  }

  if (text.includes("detail") || text.includes("instruction") || text.includes("read job") || text.includes("read maintenance")) {
    return {
      action: "maintenance_detail",
      normalizedEnglish: query,
      params: { jobId }
    };
  }

  if (text.includes("maintenance") || text.includes("job") || text.includes("overdue") || text.includes("critical") || text.includes("non critical")) {
    return {
      action: "maintenance_list",
      normalizedEnglish: query,
      params: {
        overdueOnly: text.includes("overdue"),
        dueOnly: text.includes("coming due") || /\bdue\b/.test(text),
        criticalOnly: text.includes("critical") && !text.includes("non critical"),
        nonCriticalOnly: text.includes("non critical"),
        keyword: description || "",
        dueWindowDays: findNumberLike(query, /next\s+(\d+)\s+days/i) || findNumberLike(query, /due in\s+(\d+)\s+days/i)
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
    text.includes("maintenance") ||
    text.includes("work order") ||
    text.includes("workorder") ||
    text.includes("job") ||
    /\bwo[-\s]?\d+/i.test(query) ||
    (text.includes("overdue") && !text.includes("defect") && !text.includes("certificate") && !text.includes("requisition"));

  const defectSignals = text.includes("defect");
  const certificateSignals = text.includes("certificate") || text.includes("survey");
  const requisitionSignals = text.includes("requisition");
  const purchaseSignals =
    !requisitionSignals &&
    (text.includes("purchase order") ||
      text.includes("po ") ||
      text.includes("po status") ||
      text.includes("material receipt") ||
      text.includes("invoice"));

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

    return true;
  });
}

function applyPurchaseStatusFilter(rows, statusText) {
  if (!statusText) {
    return rows || [];
  }

  const target = normalize(statusText);
  return (rows || []).filter((row) => normalize(row.currentStatus).includes(target));
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
      { label: "Read detail", promptTemplate: "Read the maintenance detail for ship component job link {{shipComponentJobLinkId}}" },
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

function buildDefectPresentation(result) {
  const totals = result.body?.total || {};
  const rows = Array.isArray(result.body?.data) ? result.body.data : [];

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
  const rows = Array.isArray(result.body?.data) ? result.body.data : [];
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

function buildRequisitionListPresentation(result) {
  const rows = Array.isArray(result.body?.data) ? result.body.data : [];
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

function buildPurchaseOrderPresentation(result) {
  const rows = Array.isArray(result.body?.data) ? result.body.data : [];
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
      { label: "Show requisition", promptTemplate: "Show requisition {{requisitionId}} detail with workflow log and delivery info" }
    ],
    actionTarget: "purchaseOrders"
  });
}

function buildRequisitionDetailPresentation(detail, workflow, delivery) {
  return {
    type: "detail",
    title: "Requisition detail",
    subtitle: detail?.documentHeader || `Requisition ${detail?.requisitionId || ""}`.trim(),
    fields: [
      { label: "Vessel", value: detail?.vessel?.vesselName },
      { label: "Origin", value: detail?.originSite },
      { label: "Type", value: detail?.pmOrderType?.orderTypes },
      { label: "Priority", value: detail?.pmPreference?.description },
      { label: "Department", value: detail?.departments?.departmentName },
      { label: "Status", value: detail?.approvedReq },
      { label: "Description", value: detail?.descriptionData },
      { label: "Order reference", value: detail?.orderReferenceNames },
      { label: "Target date", value: formatDate(detail?.targetDate) },
      { label: "Delivery info", value: delivery ? JSON.stringify(delivery) : "" },
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

async function executeCopilotQuery({ client, session, query, systemKey }) {
  const routed = await routePrompt(query, systemKey);
  const action = routed.action || "help";
  const targetSystem = systemKey === "purchase" ? "Purchase Link" : "PMS Link";
  const normalizedEnglish = routed.normalizedEnglish || query;

  if (action === "help") {
    return {
      intent: "Capabilities",
      normalizedEnglish,
      reply:
        systemKey === "purchase"
          ? "I can list requisitions, PO status, material receipt visibility, show requisition detail, and prepare requisition-create actions."
          : "I can list maintenance, overdue jobs, critical jobs, defects, certificates, and prepare close or postponement actions.",
      result: null,
      presentation: null
    };
  }

  if (!session) {
    return {
      intent: "Authentication required",
      normalizedEnglish,
      reply: `Log into ${targetSystem} first so I can call the live Mazik API.`,
      result: null,
      presentation: null
    };
  }

  if (action === "maintenance_detail") {
    if (systemKey === "purchase") {
      return {
        intent: "Maintenance detail",
        normalizedEnglish,
        reply: "Maintenance drill-down belongs to PMS Link. Switch the active system to PMS Link for this request.",
        result: null,
        presentation: null
      };
    }

    const result = await client.getJobDetail(systemKey, session, routed.params?.jobId || "");
    const detail = unwrapResultData(result);
    return {
      intent: "Maintenance detail",
      normalizedEnglish,
      reply: summarizeResult(result),
      result,
      presentation: result.ok ? buildMaintenanceDetailPresentation(detail) : null
    };
  }

  if (action === "maintenance_list") {
    if (systemKey === "purchase") {
      return {
        intent: "Maintenance jobs",
        normalizedEnglish,
        reply: "Maintenance jobs belong to PMS Link. Switch the active system to PMS Link for this request.",
        result: null,
        presentation: null
      };
    }

    const result = await client.listDueJobs(systemKey, session, buildPmsForecastQuery(routed.params || {}));
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
      reply,
      result,
      presentation
    };
  }

  if (action === "defects_list") {
    if (systemKey === "purchase") {
      return {
        intent: "Defects",
        normalizedEnglish,
        reply: "Defect management belongs to PMS Link. Switch the active system to PMS Link for this request.",
        result: null,
        presentation: null
      };
    }

    const result = await client.listDefects(systemKey, session, buildDefectQuery(routed.params || {}));
    return {
      intent: "Defects",
      normalizedEnglish,
      reply: summarizeResult(result),
      result,
      presentation: result.ok ? buildDefectPresentation(result) : null
    };
  }

  if (action === "certificates_list") {
    if (systemKey === "purchase") {
      return {
        intent: "Certificates and surveys",
        normalizedEnglish,
        reply: "Certificate tracking belongs to PMS Link. Switch the active system to PMS Link for this request.",
        result: null,
        presentation: null
      };
    }

    const result = await client.listCertificates(systemKey, session, buildCertificateQuery(routed.params || {}));
    return {
      intent: "Certificates and surveys",
      normalizedEnglish,
      reply: summarizeResult(result),
      result,
      presentation: result.ok ? buildCertificatePresentation(result, routed.params || {}) : null
    };
  }

  if (action === "requisitions_list") {
    if (systemKey !== "purchase") {
      return {
        intent: "Requisitions",
        normalizedEnglish,
        reply: "Requisition tracking belongs to Purchase Link. Switch the active system to Purchase Link for this request.",
        result: null,
        presentation: null
      };
    }

    const result = await client.procurementFollowUp(
      systemKey,
      session,
      buildPurchaseTrackingQuery({ ...(routed.params || {}), track: "Requisition Track" })
    );
    if (result.ok && routed.params?.statusText) {
      result.body.data = applyPurchaseStatusFilter(Array.isArray(result.body?.data) ? result.body.data : [], routed.params.statusText);
    }

    return {
      intent: "Requisitions",
      normalizedEnglish,
      reply: summarizeResult(result),
      result,
      presentation: result.ok ? buildRequisitionListPresentation(result) : null
    };
  }

  if (action === "purchase_orders_list") {
    if (systemKey !== "purchase") {
      return {
        intent: "Purchase orders",
        normalizedEnglish,
        reply: "Purchase order tracking belongs to Purchase Link. Switch the active system to Purchase Link for this request.",
        result: null,
        presentation: null
      };
    }

    const result = await client.procurementFollowUp(
      systemKey,
      session,
      buildPurchaseTrackingQuery({ ...(routed.params || {}), track: "PO Track" })
    );
    if (result.ok && routed.params?.statusText) {
      result.body.data = applyPurchaseStatusFilter(Array.isArray(result.body?.data) ? result.body.data : [], routed.params.statusText);
    }

    return {
      intent: "Purchase orders",
      normalizedEnglish,
      reply: summarizeResult(result),
      result,
      presentation: result.ok ? buildPurchaseOrderPresentation(result) : null
    };
  }

  if (action === "requisition_detail") {
    if (systemKey !== "purchase") {
      return {
        intent: "Requisition detail",
        normalizedEnglish,
        reply: "Requisition detail belongs to Purchase Link. Switch the active system to Purchase Link for this request.",
        result: null,
        presentation: null
      };
    }

    const detailResult = await client.getRequisitionDetail(systemKey, session, routed.params?.requisitionId || "");
    const workflowResult = routed.params?.includeWorkflow
      ? await client.getRequisitionLog(systemKey, session, routed.params?.requisitionId || "")
      : null;
    const deliveryResult = routed.params?.includeDelivery
      ? await client.getRequisitionDeliveryInfo(systemKey, session, routed.params?.requisitionId || "")
      : null;

    const detail = unwrapResultData(detailResult);
    const workflow = unwrapResultData(workflowResult);
    const delivery = unwrapResultData(deliveryResult);

    return {
      intent: "Requisition detail",
      normalizedEnglish,
      reply: summarizeResult(detailResult),
      result: {
        detail: detailResult,
        workflow: workflowResult,
        delivery: deliveryResult
      },
      presentation: detailResult.ok ? buildRequisitionDetailPresentation(detail, workflow, delivery) : null
    };
  }

  if (action === "close_job") {
    if (systemKey === "purchase") {
      return {
        intent: "Close maintenance",
        normalizedEnglish,
        reply: "Maintenance completion belongs to PMS Link. Switch the active system to PMS Link for this request.",
        result: null,
        presentation: null
      };
    }

    const context = await resolvePmsJobContext(client, session, routed.params?.jobId || "");
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
      "I parsed the live maintenance completion payload. Confirm in the UI to submit it to Mazik.",
      {
        action: "close_job",
        systemKey,
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
    if (systemKey === "purchase") {
      return {
        intent: "Postponement",
        normalizedEnglish,
        reply: "Postponement requests belong to PMS Link. Switch the active system to PMS Link for this request.",
        result: null,
        presentation: null
      };
    }

    const context = await resolvePmsJobContext(client, session, routed.params?.jobId || "");
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
      "I parsed the live postponement payload. Confirm in the UI to submit it to Mazik.",
      {
        action: "postponement",
        systemKey,
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
    if (systemKey !== "purchase") {
      return {
        intent: "Requisition creation",
        normalizedEnglish,
        reply: "Live requisition creation belongs to Purchase Link. Switch the active system to Purchase Link for this request.",
        result: null,
        presentation: null
      };
    }

    const { payload, missingFields } = buildRequisitionPayload(routed.params || {});
    if (missingFields.length) {
      return buildDraftResult(
        "Requisition draft",
        normalizedEnglish,
        "The live Mazik requisition endpoint is wired, but it needs the full `Requisition/items/templateItems/workflow` payload. Include that JSON in your request and I can submit it.",
        payload,
        missingFields,
        buildPayloadPresentation(
          "Requisition draft",
          "Review the parsed requisition payload and supply the full Mazik structure.",
          payload,
          missingFields,
          "requisition_create"
        )
      );
    }

    return buildPendingConfirmation(
      "Requisition ready",
      normalizedEnglish,
      "I parsed the requisition payload. Confirm in the UI to submit it to Mazik.",
      {
        action: "requisition_create",
        systemKey,
        payload
      },
      buildPayloadPresentation(
        "Requisition ready",
        "Review and confirm this requisition payload before it is submitted to Mazik.",
        payload,
        [],
        "requisition_create"
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
