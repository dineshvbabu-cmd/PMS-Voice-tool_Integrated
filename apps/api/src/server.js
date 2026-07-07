"use strict";

const http = require("http");
const { createApiHandler } = require("./app");
const { createSettings } = require("./lib/settings");
const inventory = require("./lib/inventory");
const { PMSLinkClient } = require("./lib/pmslink-client");
const copilot = require("./lib/copilot");
const embeddedAssistant = require("./lib/embedded-assistant");
const settingsService = require("./application/settings/settings-service");
const { createBootstrapService } = require("./application/bootstrap/bootstrap-service");
const { createBrowserSessionStore } = require("./application/session/browser-session-store");
const { createVoiceTranscriptionService } = require("./application/voice/voice-transcription-service");
const { readBody, readBinaryBody } = require("./infrastructure/http/body-reader");
const { createCors } = require("./infrastructure/http/cors");
const { createResponder } = require("./infrastructure/http/responder");

const PORT = Number(process.env.PORT || 3100);
const settings = createSettings();
const sessionStore = createBrowserSessionStore();
const cors = createCors({ settings });
const responder = createResponder({ writeCorsHeaders: cors.writeCorsHeaders });
const bootstrapService = createBootstrapService({
  settings,
  sessionStore,
  samplePrompts: inventory.samplePrompts
});
const voiceTranscriptionService = createVoiceTranscriptionService({ settings });

const handleRequest = createApiHandler({
  settings,
  sessionStore,
  clientFactory: () => new PMSLinkClient(settings),
  bootstrapService,
  voiceTranscriptionService,
  readBody,
  readBinaryBody,
  sendJson: responder.sendJson,
  sendEmpty: responder.sendEmpty,
  writeCorsHeaders: cors.writeCorsHeaders,
  inventory,
  copilot,
  embeddedAssistant,
  settingsService
});

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`@pms-voice/api listening on http://localhost:${PORT}`);
});
