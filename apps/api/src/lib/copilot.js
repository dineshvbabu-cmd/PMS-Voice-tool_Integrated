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

function firstNumber(text, pattern) {
  const value = firstMatch(text, pattern);
  return value || "";
}

function findNumericJobId(text) {
  return (
    firstNumber(text, /ship component job link\s*[:#-]?\s*(\d+)/i) ||
    firstNumber(text, /job(?:\s+id)?\s*[:#-]?\s*(\d{4,8})/i) ||
    firstNumber(text, /\b(\d{4,8})\b/)
  );
}

function findJobReference(text) {
  return findNumericJobId(text) || firstMatch(text, /((?:wo|job)[-\s]?\d+)/i);
}

function findDate(text) {
  return firstMatch(text, /(\d{4}-\d{2}-\d{2})/);
}

function findNumberLike(text, pattern) {
  return firstMatch(text, pattern);
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
            "You route maritime PMS and procurement requests for Mazik systems.",
            "Return strict JSON with keys action, normalizedEnglish, params, explanation.",
            "Supported actions are due_jobs, job_detail, close_job, postponement, requisition, procurement_followup, help.",
            "For close_job params, use jobId, completionDate, closureDescription, maintenanceCauseId, overdueRemarks, currentCounterValue.",
            "For postponement params, use jobId, postponeMode, postponeDate, postponeFrequency, postponeReasonId, remarks, approvedBy, currentDueDate.",
            "For requisition params, prefer requisitionPayload when the user provides structured JSON. If not, include whatever fields were stated such as vesselId, workflow, title, description.",
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

  if (text.includes("detail") || text.includes("instruction") || text.includes("read job") || text.includes("read maintenance")) {
    return {
      action: "job_detail",
      normalizedEnglish: query,
      params: { jobId }
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

  if (text.includes("postpone") || text.includes("defer")) {
    const postponeFrequency = findNumberLike(query, /(?:frequency|interval)\s*[:#-]?\s*(\d+(?:\.\d+)?)/i);
    const postponeDate = firstMatch(
      query,
      /(?:postpone(?:\s+till)?|defer(?:\s+till)?|until|to)\s+(\d{4}-\d{2}-\d{2})/i
    ) || date;

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

  if (text.includes("requisition") || text.includes("raise req") || text.includes("raise purchase")) {
    return {
      action: "requisition",
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

  if (text.includes("procurement") || text.includes("purchase") || text.includes("supplier") || text.includes("po")) {
    return {
      action: "procurement_followup",
      normalizedEnglish: query,
      params: {}
    };
  }

  return {
    action: "due_jobs",
    normalizedEnglish: query,
    params: {
      keyword: description || ""
    }
  };
}

async function routePrompt(query, systemKey) {
  if (!OPENAI_API_KEY) {
    return routeLocally(query);
  }

  try {
    return await routeWithOpenAI(query, systemKey);
  } catch {
    return routeLocally(query);
  }
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

  if (result.body.data !== undefined) {
    return result.body.data;
  }

  return result.body;
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
    Excel: false,
    Type: "Direct",
    Site: "Office",
    ...rest,
    KeyWord: normalizedKeyword
  };
}

function buildPurchaseTrackingQuery(overrides = {}) {
  const { KeyWord, keyword, ...rest } = overrides || {};
  const normalizedKeyword = KeyWord ?? keyword ?? "";
  return {
    PageNumber: 1,
    PageSize: 200,
    Status: 0,
    KeyWord: normalizedKeyword,
    VesselId: 0,
    FleetId: 0,
    targetLoc: "Office",
    track: "Requisition Track",
    stage: 0,
    category: 0,
    fromDate: "",
    toDate: "",
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

function isOverdueRow(row) {
  return normalize(row?.jobStatus).includes("overdue");
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
    (isOverdueRow(row) ? closureDescription : "");

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
  if (isOverdueRow(row) && !payload.overDueRemarks) {
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

function draftResponse(intent, normalizedEnglish, reply, payload, missingFields) {
  return {
    intent,
    normalizedEnglish,
    reply,
    result: {
      draft: true,
      missingFields,
      payload
    }
  };
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
          ? "I can inspect requisition tracking, requisition detail, workflow logs, delivery details, procurement follow-up, and submit a live requisition when you provide the full Mazik payload."
          : "I can inspect maintenance forecast data, read maintenance detail, submit live close-job requests, and submit live postponement requests when the required Mazik fields are present.",
      result: null
    };
  }

  if (!session) {
    return {
      intent: "Authentication required",
      normalizedEnglish,
      reply: `Log into ${targetSystem} first so I can call the live Mazik API.`,
      result: null
    };
  }

  if (action === "job_detail") {
    if (systemKey === "purchase") {
      return {
        intent: "Maintenance detail",
        normalizedEnglish,
        reply: "Maintenance drill-down belongs to PMS Link. Switch the active system to PMS Link for this request.",
        result: null
      };
    }

    const result = await client.getJobDetail(systemKey, session, routed.params?.jobId || "");
    return {
      intent: "Maintenance detail",
      normalizedEnglish,
      reply: summarizeResult(result),
      result
    };
  }

  if (action === "close_job") {
    if (systemKey === "purchase") {
      return {
        intent: "Close maintenance",
        normalizedEnglish,
        reply: "Maintenance completion belongs to PMS Link. Switch the active system to PMS Link for this request.",
        result: null
      };
    }

    const context = await resolvePmsJobContext(client, session, routed.params?.jobId || "");
    if (!context.ok) {
      return draftResponse(
        "Close maintenance draft",
        normalizedEnglish,
        context.error,
        routed.params || {},
        ["shipComponentJobLinkId"]
      );
    }

    const { payload, missingFields } = buildCloseJobPayload(context, routed.params || {});
    if (missingFields.length) {
      return draftResponse(
        "Close maintenance draft",
        normalizedEnglish,
        `I resolved the live maintenance record, but I still need ${missingFields.join(", ")} before I can submit the Mazik close-job action.`,
        payload,
        missingFields
      );
    }

    const result = await client.closeJob(systemKey, session, context.jobId, payload);
    return {
      intent: "Close maintenance",
      normalizedEnglish,
      reply: summarizeResult(result),
      result: {
        submittedPayload: payload,
        response: result
      }
    };
  }

  if (action === "postponement") {
    if (systemKey === "purchase") {
      return {
        intent: "Postponement",
        normalizedEnglish,
        reply: "Postponement requests belong to PMS Link. Switch the active system to PMS Link for this request.",
        result: null
      };
    }

    const context = await resolvePmsJobContext(client, session, routed.params?.jobId || "");
    if (!context.ok) {
      return draftResponse(
        "Postponement draft",
        normalizedEnglish,
        context.error,
        routed.params || {},
        ["shipComponentJobLinkId"]
      );
    }

    const { payload, missingFields } = buildPostponementPayload(context, routed.params || {});
    if (missingFields.length) {
      return draftResponse(
        "Postponement draft",
        normalizedEnglish,
        `I resolved the live maintenance record, but I still need ${missingFields.join(", ")} before I can submit the Mazik postponement.`,
        payload,
        missingFields
      );
    }

    const result = await client.createPostponement(systemKey, session, payload);
    return {
      intent: "Postponement",
      normalizedEnglish,
      reply: summarizeResult(result),
      result: {
        submittedPayload: payload,
        response: result
      }
    };
  }

  if (action === "requisition") {
    if (systemKey !== "purchase") {
      return {
        intent: "Requisition",
        normalizedEnglish,
        reply: "Live requisition creation belongs to Purchase Link. Switch the active system to Purchase Link for this request.",
        result: null
      };
    }

    const { payload, missingFields } = buildRequisitionPayload(routed.params || {});
    if (missingFields.length) {
      return draftResponse(
        "Requisition draft",
        normalizedEnglish,
        "The live Mazik requisition endpoint is wired, but it needs the full `Requisition/items/templateItems/workflow` payload. Include that JSON in your request and I can submit it.",
        payload,
        missingFields
      );
    }

    const result = await client.createRequisition(systemKey, session, payload);
    return {
      intent: "Requisition",
      normalizedEnglish,
      reply: summarizeResult(result),
      result: {
        submittedPayload: payload,
        response: result
      }
    };
  }

  if (action === "procurement_followup") {
    if (systemKey !== "purchase") {
      return {
        intent: "Procurement follow-up",
        normalizedEnglish,
        reply: "Procurement follow-up belongs to Purchase Link. Switch the active system to Purchase Link for this request.",
        result: null
      };
    }

    const result = await client.procurementFollowUp(
      systemKey,
      session,
      buildPurchaseTrackingQuery(routed.params || {})
    );
    return {
      intent: "Procurement follow-up",
      normalizedEnglish,
      reply: summarizeResult(result),
      result
    };
  }

  if (systemKey === "purchase") {
    return {
      intent: "Maintenance forecast",
      normalizedEnglish,
      reply: "Maintenance forecasting belongs to PMS Link. Switch the active system to PMS Link for this request.",
      result: null
    };
  }

  const result = await client.listDueJobs(
    systemKey,
    session,
    buildPmsForecastQuery(routed.params || {})
  );
  return {
    intent: "Maintenance forecast",
    normalizedEnglish,
    reply: summarizeResult(result),
    result
  };
}

module.exports = {
  executeCopilotQuery
};
