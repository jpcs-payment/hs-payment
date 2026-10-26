import { sendApprovalEmail } from "../server/email-core.mjs";

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    response.status(204).end();
    return;
  }
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const result = await sendApprovalEmail(body?.payment, { verify: true });
    response.status(result.status).json(result.body);
  } catch (error) {
    console.error("Approval email function error:", error instanceof Error ? error.message : error);
    response.status(500).json({ error: "The email function could not process the request." });
  }
}
