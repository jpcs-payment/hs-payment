import "dotenv/config";
import http from "node:http";
import { isEmailConfigured, sendApprovalEmail, sendPayLaterEmail } from "./email-core.mjs";
import { PublicSubmissionError, submitPayment } from "./payment-core.mjs";

const parsedPort = Number.parseInt(process.env.EMAIL_SERVER_PORT ?? "8787", 10);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 8787;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_SUBMISSION_BODY_BYTES = 8 * 1024 * 1024;
const requestAttempts = new Map();

const setResponseHeaders = (response) => {
  response.setHeader("Cache-Control", "no-store");
};

const sendJson = (response, status, body) => {
  setResponseHeaders(response);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
};

const isRateLimited = (key) => {
  const now = Date.now();
  const recent = (requestAttempts.get(key) ?? []).filter((timestamp) => now - timestamp < 10 * 60 * 1000);
  if (recent.length >= 10) {
    requestAttempts.set(key, recent);
    return true;
  }
  recent.push(now);
  requestAttempts.set(key, recent);
  return false;
};

const readJson = (request, maxBytes = MAX_BODY_BYTES) => new Promise((resolve, reject) => {
  let body = "";
  let size = 0;
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    size += Buffer.byteLength(chunk);
    if (size > maxBytes) {
      reject(new Error("Request body is too large."));
      request.destroy();
      return;
    }
    body += chunk;
  });
  request.on("end", () => {
    try { resolve(JSON.parse(body)); } catch { reject(new Error("Request body must be valid JSON.")); }
  });
  request.on("error", reject);
});

const server = http.createServer(async (request, response) => {
  setResponseHeaders(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/api/health") {
    sendJson(response, 200, { ok: true, configured: isEmailConfigured() });
    return;
  }
  if (request.method !== "POST" || !["/api/submit-payment", "/api/send-approval-email", "/api/send-pay-later-email"].includes(request.url)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  try {
    const requestKey = `${request.socket.remoteAddress ?? "unknown"}:${request.url}`;
    if (isRateLimited(requestKey)) {
      sendJson(response, 429, { error: "Too many email delivery attempts. Try again later." });
      return;
    }
    const body = await readJson(request, request.url === "/api/submit-payment" ? MAX_SUBMISSION_BODY_BYTES : MAX_BODY_BYTES);
    if (request.url === "/api/submit-payment") {
      const payment = await submitPayment(body?.payment, { requestKey });
      sendJson(response, 201, { payment });
      return;
    }
    const result = request.url === "/api/send-pay-later-email"
      ? await sendPayLaterEmail(body?.payment, { verify: true, requestKey })
      : await sendApprovalEmail(body?.payment, { verify: true, requireAdmin: true, authorization: request.headers.authorization, requestKey });
    sendJson(response, result.status, result.body);
  } catch (error) {
    const status = error instanceof PublicSubmissionError ? error.status : 500;
    if (status >= 500) console.error("Local API server error:", error instanceof Error ? error.message : error);
    sendJson(response, status, { error: error instanceof PublicSubmissionError ? error.message : "The local API server could not process the request." });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`JPCS email server listening at http://127.0.0.1:${PORT}`);
  if (!isEmailConfigured()) console.warn("Brevo is not configured. Add BREVO_API_KEY and BREVO_FROM_EMAIL to .env.");
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
