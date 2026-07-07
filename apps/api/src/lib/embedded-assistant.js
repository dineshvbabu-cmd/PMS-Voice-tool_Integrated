"use strict";

const EMBEDDED_ASSISTANT_VERSION = "0.1.0";

const pageCatalog = {
  pms: {
    maintenanceForecast: {
      label: "Maintenance Forecast",
      route: "/pmsOverview/maintenanceForecast",
      readAction: "maintenance_list",
      writeActions: ["close_job", "postponement"]
    },
    defects: {
      label: "Defects",
      route: "/Defect/DefectList",
      readAction: "defects_list",
      writeActions: ["defect_report", "defect_close", "postponement"]
    },
    certificates: {
      label: "Certificates",
      route: "/Certificate/CertificateList",
      readAction: "certificates_list",
      writeActions: []
    }
  },
  purchase: {
    requisitionTracking: {
      label: "Requisition Tracking",
      route: "/Requisition/RequisitionTracking",
      readAction: "requisitions_list",
      writeActions: ["requisition_create", "workflow_action"]
    },
    requisitionCreate: {
      label: "Purchase Requisition",
      route: "/Requisition/Requisition",
      readAction: "inventory_items",
      writeActions: ["requisition_create"]
    },
    purchaseOrders: {
      label: "Purchase Orders",
      route: "/PurchaseOrder/PurchaseOrder",
      readAction: "purchase_orders_list",
      writeActions: ["workflow_action", "material_receipt_followup"]
    },
    quoteComparison: {
      label: "Quote Comparison",
      route: "/ExtractedQuotation/ExtractedQuotation",
      readAction: "quote_comparison",
      writeActions: ["supplier_recommendation"]
    }
  }
};

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function containsAny(text, values) {
  return values.some((value) => text.includes(value));
}

function classifyEmbeddedIntent(query) {
  const text = normalize(query);

  if (containsAny(text, ["quote", "quotation", "supplier comparison", "best supplier", "vendor comparison"])) {
    return {
      targetSystem: "purchase",
      targetPageKey: "quoteComparison",
      action: "quote_comparison",
      safetyLevel: "read_recommendation",
      confirmationRequired: false
    };
  }

  if (containsAny(text, ["requisition", "raise request", "purchase request", "spares", "stores", "inventory"])) {
    return {
      targetSystem: "purchase",
      targetPageKey: containsAny(text, ["create", "raise", "new"]) ? "requisitionCreate" : "requisitionTracking",
      action: containsAny(text, ["create", "raise", "new"]) ? "requisition_create" : "requisitions_list",
      safetyLevel: containsAny(text, ["create", "raise", "new"]) ? "write_draft" : "read_only",
      confirmationRequired: containsAny(text, ["create", "raise", "new"])
    };
  }

  if (containsAny(text, ["purchase order", "po ", "material receipt", "invoice", "delivery status"])) {
    return {
      targetSystem: "purchase",
      targetPageKey: "purchaseOrders",
      action: "purchase_orders_list",
      safetyLevel: "read_only",
      confirmationRequired: false
    };
  }

  if (containsAny(text, ["defect", "deficiency"])) {
    return {
      targetSystem: "pms",
      targetPageKey: "defects",
      action: "defects_list",
      safetyLevel: containsAny(text, ["close", "complete", "report", "create"]) ? "write_draft" : "read_only",
      confirmationRequired: containsAny(text, ["close", "complete", "report", "create"])
    };
  }

  if (containsAny(text, ["certificate", "survey", "expiry", "expire"])) {
    return {
      targetSystem: "pms",
      targetPageKey: "certificates",
      action: "certificates_list",
      safetyLevel: "read_only",
      confirmationRequired: false
    };
  }

  return {
    targetSystem: "pms",
    targetPageKey: "maintenanceForecast",
    action: containsAny(text, ["close", "complete"]) ? "close_job" : containsAny(text, ["postpone", "defer"]) ? "postponement" : "maintenance_list",
    safetyLevel: containsAny(text, ["close", "complete", "postpone", "defer"]) ? "write_draft" : "read_only",
    confirmationRequired: containsAny(text, ["close", "complete", "postpone", "defer"])
  };
}

function createEmbeddedAssistantPlan({ query, pageContext = {}, userContext = {} }) {
  const intent = classifyEmbeddedIntent(query);
  const page = pageCatalog[intent.targetSystem][intent.targetPageKey];
  const isAlreadyOnTargetPage =
    normalize(pageContext.systemKey) === intent.targetSystem &&
    normalize(pageContext.route || "").includes(normalize(page.route));

  return {
    version: EMBEDDED_ASSISTANT_VERSION,
    query,
    targetSystem: intent.targetSystem,
    targetPage: {
      key: intent.targetPageKey,
      label: page.label,
      route: page.route,
      alreadyOnPage: isAlreadyOnTargetPage
    },
    action: intent.action,
    safetyLevel: intent.safetyLevel,
    confirmationRequired: intent.confirmationRequired,
    executionMode: intent.confirmationRequired ? "draft_then_confirm" : "read_and_present",
    api: {
      queryEndpoint: "/api/copilot/query",
      confirmEndpoint: "/api/copilot/confirm",
      systemKey: intent.targetSystem
    },
    shellInstructions: [
      isAlreadyOnTargetPage
        ? "Keep the user on the current page and refresh page context."
        : `Navigate the host app to ${page.route}.`,
      "Call /api/copilot/query with the natural-language command and active Mazik session.",
      intent.confirmationRequired
        ? "Render the prepared draft beside the live Mazik page and wait for explicit user confirmation."
        : "Render results in the assistant panel and highlight matching rows on the current page when row IDs are available.",
      intent.confirmationRequired
        ? "Only call /api/copilot/confirm after the user approves the visible draft."
        : "Do not perform write actions for this request."
    ],
    audit: {
      userId: userContext.userId || "",
      tenantId: userContext.tenantId || "",
      sourceRoute: pageContext.route || "",
      sourceSystem: pageContext.systemKey || "",
      requiresAuditLog: true
    }
  };
}

function createEmbeddedManifest() {
  return {
    version: EMBEDDED_ASSISTANT_VERSION,
    name: "Atlas Embedded VoiceOps",
    mountModes: ["react_component", "iframe_widget", "script_tag"],
    requiredHostCapabilities: [
      "getCurrentUser",
      "getCurrentRoute",
      "navigateToRoute",
      "getMazikAuthSession",
      "showConfirmationDialog",
      "highlightRows"
    ],
    pageCatalog,
    events: [
      "assistant:opened",
      "assistant:listening",
      "assistant:transcribed",
      "assistant:plan_created",
      "assistant:query_completed",
      "assistant:action_drafted",
      "assistant:action_confirmed",
      "assistant:error"
    ]
  };
}

module.exports = {
  EMBEDDED_ASSISTANT_VERSION,
  pageCatalog,
  classifyEmbeddedIntent,
  createEmbeddedAssistantPlan,
  createEmbeddedManifest
};
