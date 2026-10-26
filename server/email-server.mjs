import "dotenv/config";
import http from "node:http";
import QRCode from "qrcode";

const parsedPort = Number.parseInt(process.env.EMAIL_SERVER_PORT ?? "8787", 10);
const PORT = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 8787;
const MAX_BODY_BYTES = 256 * 1024;
const QR_PREFIX = "JPCS-LCC-TICKET:";
const apiKey = process.env.BREVO_API_KEY?.trim();
const from = (process.env.BREVO_FROM_EMAIL ?? "jpcslccpayment@gmail.com").trim();
const fromName = (process.env.BREVO_FROM_NAME ?? "JPCS - LCC Payment Portal").trim();
const replyTo = (process.env.BREVO_REPLY_TO ?? "jpcs.payment@gmail.com").trim();

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

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatCurrency = (amount) => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 2,
}).format(amount);

const formatDateTime = (value) => new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
}).format(new Date(value));

const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

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
    try {
      resolve(JSON.parse(body));
    } catch {
      reject(new Error("Request body must be valid JSON."));
    }
  });
  request.on("error", reject);
});

const validatePayment = (payment) => {
  if (!payment || typeof payment !== "object") return "Payment data is required.";
  if (payment.status !== "Approved") return "Only approved payments can be emailed.";

  const requiredStrings = ["id", "studentName", "email", "offeringName", "reference", "receiptNumber", "ticketId", "ticketQrValue", "approvedAt", "method"];
  if (requiredStrings.some((field) => typeof payment[field] !== "string" || !payment[field].trim())) return "Approved payment data is incomplete.";
  if (!isEmail(payment.email.trim())) return "The recipient email is invalid.";
  if (!Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0) return "The payment amount is invalid.";
  if (payment.ticketQrValue !== `${QR_PREFIX}${payment.ticketId}`) return "The ticket QR value is invalid.";
  return null;
};

const createEmailMarkup = (payment) => {
  const firstName = payment.studentName.trim().split(/\s+/)[0];
  const amount = formatCurrency(Number(payment.amount));
  const approvedAt = formatDateTime(payment.approvedAt);
  const schoolDetails = [payment.schoolLevel, payment.yearLevel, payment.strand, payment.course].filter(Boolean).join(" · ");
  const allocations = Array.isArray(payment.allocations) ? payment.allocations.map((allocation) => `${allocation.recipient}: ${formatCurrency(Number(allocation.amount))}`).join(" · ") : "See payment record";
  const field = (label, value) => `<td style="width:50%;padding:9px 10px;border:1px solid #d9e2ef;border-radius:10px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word"><div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#7a8799;font-weight:700">${escapeHtml(label)}</div><div style="margin-top:5px;color:#0b1f3a;font-size:13px;font-weight:700;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(value)}</div></td>`;

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f4f7fb;color:#17243a;font-family:Arial,sans-serif">
    <div style="max-width:640px;margin:0 auto;padding:28px 16px">
      <div style="overflow:hidden;border:1px solid #d9e2ef;border-radius:18px;background:#ffffff">
        <div style="padding:24px;background:#0b1f3a;color:#ffffff">
          <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#bfd4ed;font-weight:700">JPCS - LCC Payment Portal</div>
          <div style="margin-top:8px;font-size:24px;font-weight:800">Payment confirmed</div>
          <div style="margin-top:7px;font-size:13px;color:#d8e7f7">Junior Philippines Computer Studies</div>
        </div>
        <div style="padding:28px 24px">
          <p style="margin:0;font-size:16px;font-weight:700;color:#0b1f3a">Hi ${escapeHtml(firstName)},</p>
          <p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#60708a">Your payment for <strong style="color:#0b1f3a">${escapeHtml(payment.offeringName)}</strong> has been confirmed. Keep this email and the attached QR code for event check-in.</p>
           <table role="presentation" style="width:100%;margin:22px 0 0;border-spacing:7px;table-layout:fixed"><tr>${field("Reference", payment.reference)}${field("Receipt", payment.receiptNumber)}</tr><tr>${field("Amount", amount)}${field("Method", payment.method)}</tr><tr>${field("School details", schoolDetails || "Not provided")}${field("Confirmed", approvedAt)}</tr><tr>${field("Allocations", allocations)}${field("Ticket ID", payment.ticketId)}</tr></table>
          <div style="margin:24px auto 0;max-width:300px;padding:18px;text-align:center;border:1px solid #d9e2ef;border-radius:16px;background:#f4f7fb">
            <div style="font-size:14px;font-weight:800;color:#0b1f3a">Attendance QR attached</div>
            <div style="margin-top:8px;font-family:monospace;font-size:12px;font-weight:700;letter-spacing:.05em;color:#0b1f3a">${escapeHtml(payment.ticketId)}</div>
            <div style="margin-top:8px;font-size:11px;color:#7a8799">Download the attached PNG before attending.</div>
          </div>
        </div>
        <div style="padding:18px 24px;border-top:1px solid #d9e2ef;background:#f4f7fb;font-size:11px;line-height:1.6;color:#7a8799">JPCS - LCC · Junior Philippines Computer Studies · Payment confirmation</div>
      </div>
    </div>
  </body>
</html>`;
};

const createTextBody = (payment) => [
  "JPCS - LCC payment confirmed",
  "",
  `Hi ${payment.studentName.trim().split(/\s+/)[0]},`,
  `Your payment for ${payment.offeringName} has been confirmed.`,
  "",
  `Reference: ${payment.reference}`,
  `Receipt: ${payment.receiptNumber}`,
  `Amount: ${formatCurrency(Number(payment.amount))}`,
  `Method: ${payment.method}`,
  `School details: ${[payment.schoolLevel, payment.yearLevel, payment.strand, payment.course].filter(Boolean).join(" · ") || "Not provided"}`,
  `Allocations: ${Array.isArray(payment.allocations) ? payment.allocations.map((allocation) => `${allocation.recipient}: ${formatCurrency(Number(allocation.amount))}`).join(" · ") : "See payment record"}`,
  `Confirmed: ${formatDateTime(payment.approvedAt)}`,
  `Ticket ID: ${payment.ticketId}`,
  "",
  "The attendance QR code is attached to this email.",
].join("\n");

const sendApprovalEmail = async (payment) => {
  const validationError = validatePayment(payment);
  if (validationError) return { status: 400, body: { error: validationError } };
  if (!apiKey || !isEmail(from)) return { status: 503, body: { error: "Brevo is not configured. Set BREVO_API_KEY and BREVO_FROM_EMAIL in .env." } };

  const qrBuffer = await QRCode.toBuffer(payment.ticketQrValue, {
    width: 520,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#0B1F3A", light: "#FFFFFF" },
  });
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: fromName, email: from },
      to: [{ email: payment.email.trim(), name: payment.studentName.trim() }],
      replyTo: { email: replyTo },
      subject: `Your JPCS - LCC ${payment.offeringName} confirmation`,
      htmlContent: createEmailMarkup(payment),
      textContent: createTextBody(payment),
      attachment: [{ content: qrBuffer.toString("base64"), name: "jpcs-lcc-attendance-qr.png" }],
      tags: ["jpcs-payment", "film-showing"],
    }),
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : "Brevo rejected the email.";
    return { status: 502, body: { error: message } };
  }
  return { status: 200, body: { emailId: body?.messageId ?? null } };
};

const server = http.createServer(async (request, response) => {
  setResponseHeaders(response);
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/api/health") {
    sendJson(response, 200, { ok: true, configured: Boolean(apiKey && isEmail(from)) });
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/send-approval-email") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  try {
    const body = await readJson(request);
    const result = await sendApprovalEmail(body?.payment);
    sendJson(response, result.status, result.body);
  } catch (error) {
    console.error("Brevo email server error:", error instanceof Error ? error.message : error);
    sendJson(response, 500, { error: "The local email server could not process the request." });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`JPCS email server listening at http://127.0.0.1:${PORT}`);
  if (!apiKey || !isEmail(from)) console.warn("Brevo is not configured. Add BREVO_API_KEY and BREVO_FROM_EMAIL to .env.");
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
