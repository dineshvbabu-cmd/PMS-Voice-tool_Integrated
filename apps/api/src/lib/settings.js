"use strict";

function createSettings() {
  return {
    product: {
      name: "Atlas VoiceOps",
      subtitle: "Mazik Connector Studio"
    },
    pmsWebBaseUrl: process.env.PMSLINK_WEB_BASE || "https://livepms.maziksolutions.com/",
    pmsApiBaseUrl: process.env.PMSLINK_API_BASE || "https://livepmsapi.maziksolutions.com/api/",
    pmsMaintenanceForecastUrl:
      process.env.PMSLINK_FORECAST_URL || "https://livepms.maziksolutions.com/pmsOverview/maintenanceForecast",
    pmsDueJobsPath:
      process.env.PMSLINK_DUE_JOBS_PATH || "ShipMaster/shipMaintenanceDirectCompleteBySP",
    pmsJobDetailPath:
      process.env.PMSLINK_JOB_DETAIL_PATH || "ShipMaster/shipMaintenanceForecastById/{jobId}",
    pmsCloseJobPath: process.env.PMSLINK_CLOSE_JOB_PATH || "",
    pmsPostponementPath: process.env.PMSLINK_POSTPONEMENT_PATH || "",
    pmsRequisitionPath: process.env.PMSLINK_REQUISITION_PATH || "",
    purchaseWebBaseUrl: process.env.PURCHASELINK_WEB_BASE || "https://pclink.maziksolutions.com/",
    purchaseApiBaseUrl:
      process.env.PURCHASELINK_API_BASE || "https://livepmsapi.maziksolutions.com/api/",
    purchaseRequisitionTrackingUrl:
      process.env.PURCHASELINK_TRACKING_URL || "https://pclink.maziksolutions.com/Requisition/RequisitionTracking",
    purchaseRequisitionPath: process.env.PURCHASELINK_REQUISITION_PATH || "",
    purchaseFollowupPath:
      process.env.PURCHASELINK_FOLLOWUP_PATH || "PMRequisitionMaster/purchaseTracksLists",
    openAiLanguageModel: process.env.OPENAI_LANGUAGE_MODEL || "gpt-5.4-mini",
    openAiEnabled: Boolean(process.env.OPENAI_API_KEY),
    corsAllowedOrigins: String(process.env.CORS_ALLOWED_ORIGINS || "*")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  };
}

module.exports = {
  createSettings
};
