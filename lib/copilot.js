"use strict";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_LANGUAGE_MODEL = process.env.OPENAI_LANGUAGE_MODEL || "gpt-5.4-mini";

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function findJobId(text) {
  const match = String(text || "").match(/wo[-\s]?\d+/i);
  return match ? match[0].toUpperCase().replace(/\s+/, "-") : "";
}

function findDate(text) {
  const match = String(text || "").match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function findDescription(text) {
  const match = String(text || "").match(/(?:description|notes?|because)\s*[:\-]?\s*(.+)$/i);
  return match ? match[1].trim() : "";
}

async function routeWithOpenAI(query) {
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
            "Return strict JSON with keys action, normalizedEnglish, params.",
            "Supported actions are due_jobs, job_detail, close_job, postponement, requisition, procurement_followup, probe, help."
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

  if (text.includes("detail") || text.includes("instruction") || text.includes("read job")) {
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

  if (text.includes("requisition") || text.includes("raise req")) {
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

  if (text.includes("probe")) {
    return {
      action: "probe",
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

async function routePrompt(query) {
  if (!OPENAI_API_KEY) {
    return routeLocally(query);
  }

  try {
    return await routeWithOpenAI(query);
  } catch {
    return routeLocally(query);
  }
}

async function executeCopilotQuery({ client, session, query, systemKey }) {
  const routed = await routePrompt(query);
  const action = routed.action || "help";
  const targetSystem = systemKey === "purchase" ? "Purchase Link" : "PMS Link";

  if (action === "help") {
    return {
      intent: "Capabilities",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: systemKey === "purchase"
        ? "I can log into Purchase Link, probe requisition and follow-up endpoints, raise requisitions, and track procurement workflows once the live paths are configured."
        : "I can log into PMS Link, probe maintenance endpoints, fetch due jobs, read a job detail, close a job, raise a postponement, and raise connected requisitions once the live paths are configured.",
      result: null
    };
  }

  if (!session) {
    return {
      intent: "Authentication required",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: "Log into PMS Link first so I can call the live Mazik API.",
      result: null
    };
  }

  if (action === "probe") {
    const result = await client.probe(systemKey, systemKey === "purchase" ? "purchaseRequisitionPath" : "pmsDueJobsPath", session, {});
    return {
      intent: "Endpoint probe",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: result.ok
        ? "The configured due-jobs endpoint responded successfully."
        : "The configured due-jobs endpoint did not return a successful response.",
      result
    };
  }

  if (action === "job_detail") {
    if (systemKey === "purchase") {
      return {
        intent: "Job detail",
        normalizedEnglish: routed.normalizedEnglish || query,
        reply: "Job-detail lookups belong to PMS Link. Switch the target system to PMS Link for maintenance drill-down.",
        result: null
      };
    }

    const result = await client.getJobDetail(systemKey, session, routed.params?.jobId || "");
    return {
      intent: "Job detail",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: result.ok
        ? `Fetched detail for ${routed.params?.jobId || "the selected job"}.`
        : "I could not fetch that job detail from the configured PMS Link endpoint.",
      result
    };
  }

  if (action === "close_job") {
    if (systemKey === "purchase") {
      return {
        intent: "Close job",
        normalizedEnglish: routed.normalizedEnglish || query,
        reply: "Job closure belongs to PMS Link. Switch the target system to PMS Link for maintenance completion workflows.",
        result: null
      };
    }

    const result = await client.closeJob(systemKey, session, routed.params?.jobId || "", {
      completedDate: routed.params?.completionDate || "",
      closureDescription: routed.params?.closureDescription || ""
    });
    return {
      intent: "Close job",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: result.ok
        ? `Submitted closure request for ${routed.params?.jobId || "the selected job"}.`
        : "I could not submit that closure request to PMS Link.",
      result
    };
  }

  if (action === "postponement") {
    if (systemKey === "purchase") {
      return {
        intent: "Postponement",
        normalizedEnglish: routed.normalizedEnglish || query,
        reply: "Postponement requests belong to PMS Link. Switch the target system to PMS Link for maintenance deferrals.",
        result: null
      };
    }

    const result = await client.createPostponement(systemKey, session, routed.params || {});
    return {
      intent: "Postponement",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: result.ok
        ? "Submitted the postponement request to the configured PMS Link endpoint."
        : "I could not submit that postponement request.",
      result
    };
  }

  if (action === "requisition") {
    const result = await client.createRequisition(systemKey, session, routed.params || {});
    return {
      intent: "Requisition",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: result.ok
        ? `Submitted the requisition request to the configured ${targetSystem} endpoint.`
        : `I could not submit that requisition request to ${targetSystem}.`,
      result
    };
  }

  if (action === "procurement_followup") {
    const result = await client.procurementFollowUp(systemKey, session, {});
    return {
      intent: "Procurement follow-up",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: result.ok
        ? `Fetched procurement follow-up data from the configured ${targetSystem} endpoint.`
        : `I could not fetch procurement follow-up from ${targetSystem}.`,
      result
    };
  }

  if (systemKey === "purchase") {
    return {
      intent: "Due jobs",
      normalizedEnglish: routed.normalizedEnglish || query,
      reply: "Due-job and maintenance forecast queries belong to PMS Link. Switch the target system to PMS Link for maintenance forecasting.",
      result: null
    };
  }

  const result = await client.listDueJobs(systemKey, session, {});
  return {
    intent: "Due jobs",
    normalizedEnglish: routed.normalizedEnglish || query,
    reply: result.ok
      ? "Fetched due-job data from the configured PMS Link endpoint."
      : "I could not fetch due-job data from the configured endpoint.",
    result
  };
}

module.exports = {
  executeCopilotQuery
};
