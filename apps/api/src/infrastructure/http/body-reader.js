"use strict";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });

    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readBinaryBody(req, maxBytes = 26 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        reject(new Error("Audio payload too large"));
        req.destroy();
        return;
      }

      chunks.push(Buffer.from(chunk));
    });

    req.on("end", () => resolve(Buffer.concat(chunks, totalBytes)));
    req.on("error", reject);
  });
}

module.exports = {
  readBody,
  readBinaryBody
};
