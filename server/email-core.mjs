import QRCode from "qrcode";

const QR_PREFIX = "JPCS-LCC-TICKET:";
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const config = () => ({
  apiKey: process.env.BREVO_API_KEY?.trim(),
  from: (process.env.BREVO_FROM_EMAIL ?? "jpcslccpayment@gmail.com").trim(),
  fromName: (process.env.BREVO_FROM_NAME ?? "JPCS - LCC Payment Portal").trim(),
  replyTo: (process.env.BREVO_REPLY_TO ?? "jpcs.payment@gmail.com").trim(),
  supabaseUrl: (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, ""),
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
});

export const isEmailConfigured = () => {
  const { apiKey, from } = config();
  return Boolean(apiKey && isEmail(from));
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

const paymentDetails = (payment) => [payment.schoolLevel, payment.yearLevel, payment.strand, payment.course].filter(Boolean).join(" · ") || "Not provided";
const allocationDetails = (payment) => Array.isArray(payment.allocations) ? payment.allocations.map((allocation) => `${allocation.recipient}: ${formatCurrency(Number(allocation.amount))}`).join(" · ") : "See payment record";
const field = (label, value) => `<td style="width:50%;padding:9px 10px;border:1px solid #d9e2ef;border-radius:10px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word"><div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#7a8799;font-weight:700">${escapeHtml(label)}</div><div style="margin-top:5px;color:#0b1f3a;font-size:13px;font-weight:700;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(value)}</div></td>`;

const createHtml = (payment, payLater) => {
  const firstName = payment.studentName.trim().split(/\s+/)[0];
  const statusTitle = payLater ? "Payment reserved" : "Payment confirmed";
  const subtitle = payLater ? "Your Pay Later reservation is ready." : "Junior Philippines Computer Studies";
  const intro = payLater
    ? `Your reservation for <strong style="color:#0b1f3a">${escapeHtml(payment.offeringName)}</strong> is <strong style="color:#b66a00">Not Paid Yet</strong>. Pay using ${escapeHtml(payment.method)} before the deadline, then keep this email for event entry.`
    : `Your payment for <strong style="color:#0b1f3a">${escapeHtml(payment.offeringName)}</strong> has been confirmed. Keep this email and the attached QR code for event check-in.`;
  const rows = payLater
    ? `<tr>${field("Reference", payment.reference)}${field("Amount", formatCurrency(Number(payment.amount)))}</tr><tr>${field("Method", payment.method)}${field("Deadline", formatDateTime(payment.paymentDeadlineAt))}</tr><tr>${field("School details", paymentDetails(payment))}${field("Status", "Not Paid Yet")}</tr>`
    : `<tr>${field("Reference", payment.reference)}${field("Receipt", payment.receiptNumber)}</tr><tr>${field("Amount", formatCurrency(Number(payment.amount)))}${field("Method", payment.method)}</tr><tr>${field("School details", paymentDetails(payment))}${field("Confirmed", formatDateTime(payment.approvedAt))}</tr><tr>${field("Allocations", allocationDetails(payment))}${field("Ticket ID", payment.ticketId)}</tr>`;
  const qrNote = payLater ? "The QR becomes valid after an admin confirms your payment." : "Download the attached PNG before attending.";
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f4f7fb;color:#17243a;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:28px 16px"><div style="overflow:hidden;border:1px solid #d9e2ef;border-radius:18px;background:#ffffff"><div style="padding:24px;background:#0b1f3a;color:#ffffff"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#bfd4ed;font-weight:700">JPCS - LCC Payment Portal</div><div style="margin-top:8px;font-size:24px;font-weight:800">${statusTitle}</div><div style="margin-top:7px;font-size:13px;color:#d8e7f7">${subtitle}</div></div><div style="padding:28px 24px"><p style="margin:0;font-size:16px;font-weight:700;color:#0b1f3a">Hi ${escapeHtml(firstName)},</p><p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#60708a">${intro}</p><table role="presentation" style="width:100%;margin:22px 0 0;border-spacing:7px;table-layout:fixed">${rows}</table><div style="margin:24px auto 0;max-width:300px;padding:18px;text-align:center;border:1px solid #d9e2ef;border-radius:16px;background:#f4f7fb"><div style="font-size:14px;font-weight:800;color:#0b1f3a">Attendance QR included</div><div style="margin-top:8px;font-family:monospace;font-size:12px;font-weight:700;letter-spacing:.05em;color:#0b1f3a">${escapeHtml(payment.ticketId)}</div><div style="margin-top:8px;font-size:11px;color:#7a8799">${qrNote}</div></div></div><div style="padding:18px 24px;border-top:1px solid #d9e2ef;background:#f4f7fb;font-size:11px;line-height:1.6;color:#7a8799">JPCS - LCC · Junior Philippines Computer Studies · ${payLater ? "Keep this email and pay before the deadline." : "Payment confirmation"}</div></div></div></body></html>`;
};

const createText = (payment, payLater) => [
  payLater ? "JPCS - LCC Pay Later reservation" : "JPCS - LCC payment confirmed",
  "",
  `Hi ${payment.studentName.trim().split(/\s+/)[0]},`,
  payLater ? `Your reservation for ${payment.offeringName} is Not Paid Yet.` : `Your payment for ${payment.offeringName} has been confirmed.`,
  "",
  `Reference: ${payment.reference}`,
  `Amount: ${formatCurrency(Number(payment.amount))}`,
  `Method: ${payment.method}`,
  ...(payLater ? [`Deadline: ${formatDateTime(payment.paymentDeadlineAt)}`, "Status: Not Paid Yet"] : [`Receipt: ${payment.receiptNumber}`, `School details: ${paymentDetails(payment)}`, `Allocations: ${allocationDetails(payment)}`, `Confirmed: ${formatDateTime(payment.approvedAt)}`]),
  `Ticket ID: ${payment.ticketId}`,
  "",
  payLater ? "The attendance QR is attached and becomes valid after an admin confirms your payment." : "The attendance QR code is attached to this email.",
].join("\n");

const validatePayment = (payment, payLater) => {
  if (!payment || typeof payment !== "object") return "Payment data is required.";
  if (payLater ? payment.status !== "Pending" || payment.paymentState !== "Unpaid" : payment.status !== "Approved") return payLater ? "Only unpaid Pay Later payments can be emailed." : "Only approved payments can be emailed.";
  const requiredStrings = payLater ? ["id", "studentName", "email", "offeringName", "reference", "ticketId", "ticketQrValue", "method"] : ["id", "studentName", "email", "offeringName", "reference", "receiptNumber", "ticketId", "ticketQrValue", "approvedAt", "method"];
  if (requiredStrings.some((fieldName) => typeof payment[fieldName] !== "string" || !payment[fieldName].trim())) return payLater ? "Pay Later payment data is incomplete." : "Approved payment data is incomplete.";
  if (!isEmail(payment.email.trim())) return "The recipient email is invalid.";
  if (!Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0) return "The payment amount is invalid.";
  if (payment.ticketQrValue !== `${QR_PREFIX}${payment.ticketId}`) return payLater ? "The attendance QR value is invalid." : "The ticket QR value is invalid.";
  if (payLater && (!payment.paymentDeadlineAt || Number.isNaN(new Date(payment.paymentDeadlineAt).getTime()))) return "The Pay Later deadline is invalid.";
  return null;
};

const verifyPaymentRecord = async (payment, payLater) => {
  const { supabaseUrl, serviceRoleKey } = config();
  if (!supabaseUrl || !serviceRoleKey) return "Server payment verification is not configured. Set SUPABASE_SERVICE_ROLE_KEY for deployed email functions.";
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const paymentResponse = await fetch(`${supabaseUrl}/rest/v1/hs-payments?id=eq.${encodeURIComponent(payment.id)}&select=*`, { headers });
  if (!paymentResponse.ok) return "The payment could not be verified.";
  const paymentRows = await paymentResponse.json();
  const storedPayment = Array.isArray(paymentRows) ? paymentRows[0] : undefined;
  if (!storedPayment) return "The payment could not be verified.";
  const payerResponse = await fetch(`${supabaseUrl}/rest/v1/hs-payers?id=eq.${encodeURIComponent(storedPayment.payer_id)}&select=email,name`, { headers });
  if (!payerResponse.ok) return "The payer could not be verified.";
  const payerRows = await payerResponse.json();
  const payer = Array.isArray(payerRows) ? payerRows[0] : undefined;
  const isMatchingRecord = payer
    && String(payer.email).toLowerCase() === payment.email.trim().toLowerCase()
    && storedPayment.reference === payment.reference
    && String(storedPayment.ticket_id ?? "") === payment.ticketId
    && String(storedPayment.ticket_qr_value ?? "") === payment.ticketQrValue
    && Number(storedPayment.amount) === Number(payment.amount)
    && storedPayment.payment_mode === (payLater ? "PayLater" : "PayNow")
    && storedPayment.status === (payLater ? "Pending" : "Approved")
    && storedPayment.payment_state === (payLater ? "Unpaid" : "Paid");
  if (!isMatchingRecord) return "The payment details no longer match the stored record.";
  if (!payLater && storedPayment.receipt_number !== payment.receiptNumber) return "The receipt details no longer match the stored record.";
  return null;
};

const sendEmail = async (payment, payLater, { verify = false } = {}) => {
  const validationError = validatePayment(payment, payLater);
  if (validationError) return { status: 400, body: { error: validationError } };
  if (verify) {
    const verificationError = await verifyPaymentRecord(payment, payLater);
    if (verificationError) return { status: 403, body: { error: verificationError } };
  }
  const { apiKey, from, fromName, replyTo } = config();
  if (!apiKey || !isEmail(from)) return { status: 503, body: { error: "Brevo is not configured. Set BREVO_API_KEY and BREVO_FROM_EMAIL in the deployment environment." } };

  const qrBuffer = await QRCode.toBuffer(payment.ticketQrValue, { width: 520, margin: 2, errorCorrectionLevel: "H", color: { dark: "#0B1F3A", light: "#FFFFFF" } });
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: fromName, email: from },
      to: [{ email: payment.email.trim(), name: payment.studentName.trim() }],
      replyTo: { email: replyTo },
      subject: `Your JPCS - LCC ${payment.offeringName} ${payLater ? "Pay Later reservation" : "confirmation"}`,
      htmlContent: createHtml(payment, payLater),
      textContent: createText(payment, payLater),
      attachment: [{ content: qrBuffer.toString("base64"), name: "jpcs-lcc-attendance-qr.png" }],
      tags: ["jpcs-payment", payLater ? "pay-later" : "film-showing"],
    }),
  });
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) return { status: 502, body: { error: typeof body?.message === "string" ? body.message : "Brevo rejected the email." } };
  return { status: 200, body: { emailId: body?.messageId ?? null } };
};

export const sendApprovalEmail = (payment, options) => sendEmail(payment, false, options);
export const sendPayLaterEmail = (payment, options) => sendEmail(payment, true, options);
