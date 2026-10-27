import { PublicSubmissionError, submitPayment } from "../server/payment-core.mjs";

export const config = {
  api: {
    bodyParser: { sizeLimit: "8mb" },
  },
};

export default async function handler(request, response) {
  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }
  if (request.method !== "POST") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }
  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const payment = await submitPayment(body?.payment, { requestKey: request.headers["x-real-ip"] ?? request.headers["x-forwarded-for"] ?? request.socket?.remoteAddress });
    response.status(201).json({ payment });
  } catch (error) {
    const status = error instanceof PublicSubmissionError ? error.status : 500;
    if (status >= 500) console.error("Payment submission function error:", error instanceof Error ? error.message : error);
    response.status(status).json({ error: error instanceof PublicSubmissionError ? error.message : "The payment could not be submitted." });
  }
}
