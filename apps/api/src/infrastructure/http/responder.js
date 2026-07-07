"use strict";

function createResponder({ writeCorsHeaders }) {
  function sendJson(req, res, statusCode, body, headers = {}) {
    const payload = JSON.stringify(body);
    writeCorsHeaders(req, res);
    res.writeHead(statusCode, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(payload),
      ...headers
    });
    res.end(payload);
  }

  function sendEmpty(req, res, statusCode) {
    writeCorsHeaders(req, res);
    res.writeHead(statusCode);
    res.end();
  }

  return {
    sendJson,
    sendEmpty
  };
}

module.exports = {
  createResponder
};
