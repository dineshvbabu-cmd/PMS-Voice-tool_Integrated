"use strict";

function applySettingsPatch(settings, body = {}) {
  Object.assign(settings, {
    pmsWebBaseUrl: body.pmsWebBaseUrl ?? settings.pmsWebBaseUrl,
    pmsApiBaseUrl: body.pmsApiBaseUrl ?? settings.pmsApiBaseUrl,
    pmsMaintenanceForecastUrl: body.pmsMaintenanceForecastUrl ?? settings.pmsMaintenanceForecastUrl,
    pmsDueJobsPath: body.pmsDueJobsPath ?? settings.pmsDueJobsPath,
    pmsJobDetailPath: body.pmsJobDetailPath ?? settings.pmsJobDetailPath,
    pmsCloseJobPath: body.pmsCloseJobPath ?? settings.pmsCloseJobPath,
    pmsPostponementPath: body.pmsPostponementPath ?? settings.pmsPostponementPath,
    pmsRequisitionPath: body.pmsRequisitionPath ?? settings.pmsRequisitionPath,
    purchaseWebBaseUrl: body.purchaseWebBaseUrl ?? settings.purchaseWebBaseUrl,
    purchaseApiBaseUrl: body.purchaseApiBaseUrl ?? settings.purchaseApiBaseUrl,
    purchaseRequisitionTrackingUrl: body.purchaseRequisitionTrackingUrl ?? settings.purchaseRequisitionTrackingUrl,
    purchaseRequisitionPath: body.purchaseRequisitionPath ?? settings.purchaseRequisitionPath,
    purchaseFollowupPath: body.purchaseFollowupPath ?? settings.purchaseFollowupPath
  });

  return settings;
}

module.exports = {
  applySettingsPatch
};
