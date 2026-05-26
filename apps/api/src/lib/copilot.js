"use strict";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_LANGUAGE_MODEL = process.env.OPENAI_LANGUAGE_MODEL || "gpt-5.4-mini";

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function findJobId(text) {
  const match = String(text || "").match(/(?:wo[-\s]?\d+|\b\d{4,6}\b)/i);
  return match ? match[0].toUpperCase().replace(/\s+/, "-") : "";
}

function findDate(text) {
  const match = String(text || "").match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function findDescription(text) {
  const match = String(text || "").match(/(?:description|notes?|because|reason)\s*[:\-]?\s*(.+)$/i);
  return match ? match[1].trim() : "";
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
            "You route maritime PMS and procurement requests.",
            "Return strict JSON with keys action, normalizedEnglish, params, explanation.",
            "Supported actions are due_jobs, job_detail, close_job, postponement, requisition, procurement_followup, help.",
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
  const jobId = findJobId(query);
  const date = findDate(query);
  const description = findDescription(query);

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
        closureDescription: description
      }
    };
  }

  if (text.includes("postpone") || text.includes("defer")) {
    return {
      action: "postponement",
      normalizedEnglish: query,
      params: {
        jobId,
        requestedDueDate: date,
        reason: description || "Awaiting user reason"
      }
    };
  }

  if (text.includes("requisition") || text.includes("raise req") || text.includes("raise purchase")) {
    return {
      action: "requisition",
      normalizedEnglish: query,
      params: {
        linkedJobId: jobId,
        title: description || "Requisition generated from copilot request"
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
    params: {}
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
    return result.body?.error || result.rawText || "The endpoint did not return a successful response.";
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

async function executeCopilotQuery({ client, session, query, systemKey }) {
  const routed = await routePrompt(query, systemKey);
  const action = routed.action || "help";
  const targetSystem = systemKey === "purchase" ? "Purchase Link" : "PMS Link";

  if (action === "help") {
    return {
      intent: "Capabilities",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply:
        systemKey === "purchase"
          ? "I can inspect requisition tracking, workflow logs, delivery details, and procurement follow-up from Purchase Link."
          : "I can inspect maintenance forecast data, read maintenance detail, and prepare close or postponement actions for PMS Link.",
      result: null
    };
  }

  if (!session) {
    return {
      intent: "Authentication required",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: `Log into ${targetSystem} first so I can call the live Mazik API.`,
      result: null
    };
  }

  if (action === "job_detail") {
    if (systemKey === "purchase") {
      return {
        intent: "Maintenance detail",
        normalizedEnglish: routed.normalizedEnglish || query,
        reply: "Maintenance drill-down belongs to PMS Link. Switch the active system to PMS Link for this request.",
        result: null
      };
    }

    const result = await client.getJobDetail(systemKey, session, routed.params?.jobId || "");
    return {
      intent: "Maintenance detail",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: summarizeResult(result),
      result
    };
  }

  if (action === "close_job") {
    if (systemKey === "purchase") {
      return {
        intent: "Close maintenance",
        normalizedEnglish: routed.normalizedEnglish || query,
        reply: "Maintenance completion belongs to PMS Link. Switch the active system to PMS Link for this request.",
        result: null
      };
    }

    if (!client.settings.pmsCloseJobPath) {
      return {
        intent: "Close maintenance draft",
        normalizedEnglish: routed.normalizedEnglish || query,
        reply: "The live close-job endpoint is not configured yet, so I prepared a draft payload instead.",
        result: {
          draft: true,
          payload: {
            jobId: routed.params?.jobId || "",
            completedDate: routed.params?.completionDate || "",
            closureDescription: routed.params?.closureDescription || ""
          }
        }
      };
    }

    const result = await client.closeJob(systemKey, session, routed.params?.jobId || "", {
      completedDate: routed.params?.completionDate || "",
      closureDescription: routed.params?.closureDescription || ""
    });
    return {
      intent: "Close maintenance",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: summarizeResult(result),
      result
    };
  }

  if (action === "postponement") {
    if (systemKey === "purchase") {
      return {
        intent: "Postponement",
        normalizedEnglish: routed.normalizedEnglish || query,
        reply: "Postponement requests belong to PMS Link. Switch the active system to PMS Link for this request.",
        result: null
      };
    }

    if (!client.settings.pmsPostponementPath) {
      return {
        intent: "Postponement draft",
        normalizedEnglish: routed.normalizedEnglish || query,
        reply: "The live postponement endpoint is not configured yet, so I prepared a draft request instead.",
        result: {
          draft: true,
          payload: routed.params || {}
        }
      };
    }

    const result = await client.createPostponement(systemKey, session, routed.params || {});
    return {
      intent: "Postponement",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: summarizeResult(result),
      result
    };
  }

  if (action === "requisition") {
    if (!(systemKey === "purchase" ? client.settings.purchaseRequisitionPath : client.settings.pmsRequisitionPath)) {
      return {
        intent: "Requisition draft",
        normalizedEnglish: routed.normalizedEnglish || query,
        reply: "The live requisition write endpoint is not configured yet, so I prepared a draft payload instead.",
        result: {
          draft: true,
          payload: routed.params || {}
        }
      };
    }

    const result = await client.createRequisition(systemKey, session, routed.params || {});
    return {
      intent: "Requisition",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: summarizeResult(result),
      result
    };
  }

  if (action === "procurement_followup") {
    if (systemKey !== "purchase") {
      return {
        intent: "Procurement follow-up",
        normalizedEnglish: routed.normalizedEnglish || query,
        reply: "Procurement follow-up belongs to Purchase Link. Switch the active system to Purchase Link for this request.",
        result: null
      };
    }

    const result = await client.procurementFollowUp(systemKey, session, {});
    return {
      intent: "Procurement follow-up",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: summarizeResult(result),
      result
    };
  }

  if (systemKey === "purchase") {
    return {
      intent: "Maintenance forecast",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: "Maintenance forecasting belongs to PMS Link. Switch the active system to PMS Link for this request.",
      result: null
    };
  }

  const result = await client.listDueJobs(systemKey, session, {});
  return {
    intent: "Maintenance forecast",
    normalizedEnglish: routed.normalizedEnglish || query,
    reply: summarizeResult(result),
    result
  };
}

module.exports = {
  executeCopilotQuery
};
