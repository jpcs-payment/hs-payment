import { sendApprovalEmail } from "../server/email-core.mjs";

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    setCorsHeaders(request, response);
    response.status(204).end();
    return;
  }
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  setCorsHeaders(request, response);
  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const result = await sendApprovalEmail(body?.payment, { verify: true, requireAdmin: true, authorization: request.headers.authorization, requestKey: request.headers["x-forwarded-for"] ?? request.socket?.remoteAddress });
    response.status(result.status).json(result.body);
  } catch (error) {
    console.error("Approval email function error:", error instanceof Error ? error.message : error);
    response.status(500).json({ error: "The email function could not process the request." });
  }
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  const allowedOrigin = process.env.APP_ORIGIN?.trim();
  if (allowedOrigin && origin === allowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.setHeader("Vary", "Origin");
  }
}
