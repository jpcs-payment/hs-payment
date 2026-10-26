import "dotenv/config";
import http from "node:http";
import { isEmailConfigured, sendApprovalEmail, sendPayLaterEmail } from "./email-core.mjs";

const parsedPort = Number.parseInt(process.env.EMAIL_SERVER_PORT ?? "8787", 10);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 8787;
const MAX_BODY_BYTES = 256 * 1024;

const setResponseHeaders = (response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Cache-Control", "no-store");
};

const sendJson = (response, status, body) => {
  setResponseHeaders(response);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
};

const readJson = (request) => new Promise((resolve, reject) => {
  let body = "";
  let size = 0;
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    size += Buffer.byteLength(chunk);
    if (size > MAX_BODY_BYTES) {
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
  if (request.method !== "POST" || !["/api/send-approval-email", "/api/send-pay-later-email"].includes(request.url)) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  try {
    const body = await readJson(request);
    const result = request.url === "/api/send-pay-later-email" ? await sendPayLaterEmail(body?.payment) : await sendApprovalEmail(body?.payment);
    sendJson(response, result.status, result.body);
  } catch (error) {
    console.error("Brevo email server error:", error instanceof Error ? error.message : error);
    sendJson(response, 500, { error: "The local email server could not process the request." });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`JPCS email server listening at http://127.0.0.1:${PORT}`);
  if (!isEmailConfigured()) console.warn("Brevo is not configured. Add BREVO_API_KEY and BREVO_FROM_EMAIL to .env.");
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
