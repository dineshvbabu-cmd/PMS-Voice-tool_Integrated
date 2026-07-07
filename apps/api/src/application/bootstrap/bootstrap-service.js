"use strict";

function createBootstrapService({ settings, sessionStore, samplePrompts }) {
  function currentBootstrap(req) {
    const browserSession = sessionStore.getBrowserSession(req);

    return {
      product: settings.product,
      systems: {
        pms: {
          name: "PMS Link",
          webBaseUrl: settings.pmsWebBaseUrl,
          apiBaseUrl: settings.pmsApiBaseUrl,
          landingUrl: settings.pmsMaintenanceForecastUrl
        },
        purchase: {
          name: "Purchase Link",
          webBaseUrl: settings.purchaseWebBaseUrl,
          apiBaseUrl: settings.purchaseApiBaseUrl,
          landingUrl: settings.purchaseRequisitionTrackingUrl
        }
      },
      settings,
      session: {
        pms: sessionStore.sanitizedSystemSession(browserSession?.systems?.pms),
        purchase: sessionStore.sanitizedSystemSession(browserSession?.systems?.purchase)
      },
      discoveredFacts: [
        "Live Mazik auth calls are wired into this backend.",
        "Maintenance forecast and requisition tracking endpoints are preloaded from live captures.",
        "Close job, postponement, and requisition-create endpoints are now preloaded from live captures.",
        "Frontend and backend can now deploy independently on Railway."
      ],
      samplePrompts
    };
  }

  return {
    currentBootstrap
  };
}

module.exports = {
  createBootstrapService
};
