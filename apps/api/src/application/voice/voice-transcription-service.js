"use strict";

const { URL } = require("url");

function audioExtension(mimeType) {
  const normalized = String(mimeType || "").toLowerCase();

  if (normalized.includes("webm")) {
    return "webm";
  }
  if (normalized.includes("wav")) {
    return "wav";
  }
  if (normalized.includes("mp4")) {
    return "mp4";
  }
  if (normalized.includes("mpeg") || normalized.includes("mp3")) {
    return "mp3";
  }
  if (normalized.includes("m4a")) {
    return "m4a";
  }

  return "webm";
}

function createVoiceTranscriptionService({ settings }) {
  async function transcribeVoiceToEnglish(audioBuffer, mimeType) {
    const fileBlob = new Blob([audioBuffer], { type: mimeType || "audio/webm" });
    const form = new FormData();
    form.set("file", fileBlob, `voice-capture.${audioExtension(mimeType)}`);
    form.set("model", settings.openAiTranscribeModel);
    form.set(
      "prompt",
      [
        "Maritime maintenance and procurement copilot.",
        "Expect accented English and mixed-language speech from Indian, Filipino, Russian, European, Australian, American, and Latin crews.",
        "Expect vessel names, job codes, work orders, overdue maintenance, defects, certificates, requisitions, purchase orders, material receipts, davit, lifeboat, purifier, survey, spare parts, and engine room terminology.",
        "Return clear operational English."
      ].join(" ")
    );

    const endpoint = new URL(
      "audio/transcriptions",
      settings.openAiApiBase.endsWith("/") ? settings.openAiApiBase : `${settings.openAiApiBase}/`
    ).toString();

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: form
    });

    const rawText = await response.text();
    let parsed;
    try {
      parsed = rawText ? JSON.parse(rawText) : {};
    } catch {
      parsed = { text: rawText };
    }

    if (!response.ok) {
      throw new Error(parsed.error?.message || parsed.message || `OpenAI voice transcription failed with status ${response.status}`);
    }

    return {
      transcript: String(parsed.text || "").trim(),
      model: settings.openAiTranscribeModel,
      endpoint
    };
  }

  return {
    transcribeVoiceToEnglish
  };
}

module.exports = {
  audioExtension,
  createVoiceTranscriptionService
};
