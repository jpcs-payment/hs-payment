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

const deliveryAttempts = new Map();
const deliveryWindowMs = 10 * 60 * 1000;
const maxDeliveryAttempts = 3;

const isRateLimited = (key) => {
  const now = Date.now();
  const previous = deliveryAttempts.get(key) ?? [];
  const recent = previous.filter((timestamp) => now - timestamp < deliveryWindowMs);
  if (recent.length >= maxDeliveryAttempts) {
    deliveryAttempts.set(key, recent);
    return true;
  }
  recent.push(now);
  deliveryAttempts.set(key, recent);
  return false;
};

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
  const qrNote = payLater ? "This QR can be used for attendance. Your payment remains Not Paid Yet until it is collected and recorded by an admin." : "Download the attached PNG before attending.";
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
  payLater ? "The attendance QR is attached and can be used for event entry. Your payment remains Not Paid Yet until it is collected and recorded by an admin." : "The attendance QR code is attached to this email.",
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
  const reject = (error) => ({ error, payment: null });
  if (!supabaseUrl || !serviceRoleKey) return reject("Server payment verification is not configured. Set SUPABASE_SERVICE_ROLE_KEY for deployed email functions.");
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const paymentResponse = await fetch(`${supabaseUrl}/rest/v1/hs-payments?id=eq.${encodeURIComponent(payment.id)}&select=*`, { headers });
  if (!paymentResponse.ok) return reject("The payment could not be verified.");
  const paymentRows = await paymentResponse.json();
  const storedPayment = Array.isArray(paymentRows) ? paymentRows[0] : undefined;
  if (!storedPayment) return reject("The payment could not be verified.");
  const payerResponse = await fetch(`${supabaseUrl}/rest/v1/hs-payers?id=eq.${encodeURIComponent(storedPayment.payer_id)}&select=email,name`, { headers });
  if (!payerResponse.ok) return reject("The payer could not be verified.");
  const payerRows = await payerResponse.json();
  const payer = Array.isArray(payerRows) ? payerRows[0] : undefined;
  const isMatchingRecord = payer
    && String(payer.email).toLowerCase() === payment.email.trim().toLowerCase()
    && String(payer.name).trim().toLowerCase() === payment.studentName.trim().toLowerCase()
    && storedPayment.reference === payment.reference
    && storedPayment.offering_name === payment.offeringName
    && storedPayment.method === payment.method
    && String(storedPayment.ticket_id ?? "") === payment.ticketId
    && String(storedPayment.ticket_qr_value ?? "") === payment.ticketQrValue
    && Number(storedPayment.amount) === Number(payment.amount)
    && String(storedPayment.school_level ?? "") === String(payment.schoolLevel ?? "")
    && String(storedPayment.year_level ?? "") === String(payment.yearLevel ?? "")
    && String(storedPayment.strand ?? "") === String(payment.strand ?? "")
    && String(storedPayment.course ?? "") === String(payment.course ?? "")
    && storedPayment.payment_mode === (payLater ? "PayLater" : "PayNow")
    && storedPayment.status === (payLater ? "Pending" : "Approved")
    && storedPayment.payment_state === (payLater ? "Unpaid" : "Paid");
  if (!isMatchingRecord) return reject("The payment details no longer match the stored record.");
  if (!payLater && storedPayment.receipt_number !== payment.receiptNumber) return reject("The receipt details no longer match the stored record.");
  if (!payLater && String(storedPayment.approved_at ?? "") !== String(payment.approvedAt ?? "")) return reject("The approval details no longer match the stored record.");
  if (payLater && new Date(storedPayment.payment_deadline_at).getTime() !== new Date(payment.paymentDeadlineAt).getTime()) return reject("The Pay Later deadline no longer matches the stored record.");
  const canonicalPayment = {
    ...payment,
    id: String(storedPayment.id),
    studentName: String(payer.name),
    email: String(payer.email),
    offeringName: String(storedPayment.offering_name),
    amount: Number(storedPayment.amount),
    reference: String(storedPayment.reference),
    method: storedPayment.method,
    allocations: storedPayment.allocations,
    schoolLevel: storedPayment.school_level,
    yearLevel: String(storedPayment.year_level),
    strand: storedPayment.strand ?? undefined,
    course: storedPayment.course ?? undefined,
    paymentMode: storedPayment.payment_mode,
    paymentState: storedPayment.payment_state,
    paymentDeadlineAt: storedPayment.payment_deadline_at ?? undefined,
    status: storedPayment.status,
    receiptNumber: storedPayment.receipt_number ?? undefined,
    ticketId: storedPayment.ticket_id ?? undefined,
    ticketQrValue: storedPayment.ticket_qr_value ?? undefined,
    approvedAt: storedPayment.approved_at ?? undefined,
  };
  return { error: null, payment: canonicalPayment };
};

const verifyAdminAuthorization = async (authorization) => {
  const { supabaseUrl, serviceRoleKey } = config();
  if (!supabaseUrl || !serviceRoleKey) return "Server admin verification is not configured.";
  if (typeof authorization !== "string" || !/^Bearer\s+\S+$/i.test(authorization)) return "Admin authentication is required.";
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceRoleKey, Authorization: authorization } });
  if (!authResponse.ok) return "Admin authentication is invalid.";
  const user = await authResponse.json();
  const email = typeof user?.email === "string" ? user.email.trim() : "";
  if (!email) return "Admin authentication is invalid.";
  const adminResponse = await fetch(`${supabaseUrl}/rest/v1/hs-admins?email=eq.${encodeURIComponent(email)}&select=email`, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } });
  if (!adminResponse.ok) return "Admin access could not be verified.";
  const admins = await adminResponse.json();
  return Array.isArray(admins) && admins.length ? null : "Only a registered JPCS admin can send approval emails.";
};

const beginEmailDelivery = async (payment) => {
  const { supabaseUrl, serviceRoleKey } = config();
  if (!supabaseUrl || !serviceRoleKey) return { error: "Server email delivery tracking is not configured." };
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const since = new Date(Date.now() - deliveryWindowMs).toISOString();
  const attemptsResponse = await fetch(`${supabaseUrl}/rest/v1/hs-email-deliveries?payment_id=eq.${encodeURIComponent(payment.id)}&created_at=gte.${encodeURIComponent(since)}&select=id`, { headers });
  if (!attemptsResponse.ok) return { error: "Email delivery tracking is unavailable." };
  const attempts = await attemptsResponse.json();
  if (Array.isArray(attempts) && attempts.length >= maxDeliveryAttempts) return { limited: true };
  const insertResponse = await fetch(`${supabaseUrl}/rest/v1/hs-email-deliveries`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ payment_id: payment.id, provider: "Brevo", status: "Failed", error_message: "Delivery attempt started" }),
  });
  if (!insertResponse.ok) return { error: "Email delivery tracking is unavailable." };
  const inserted = await insertResponse.json();
  return { id: Array.isArray(inserted) ? inserted[0]?.id : undefined };
};

const finishEmailDelivery = async (attemptId, status, providerMessageId, errorMessage) => {
  if (!attemptId) return;
  const { supabaseUrl, serviceRoleKey } = config();
  if (!supabaseUrl || !serviceRoleKey) return;
  await fetch(`${supabaseUrl}/rest/v1/hs-email-deliveries?id=eq.${encodeURIComponent(attemptId)}`, {
    method: "PATCH",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ status, provider_message_id: providerMessageId, error_message: errorMessage }),
  });
};

const sendEmail = async (payment, payLater, { verify = false, requireAdmin = false, authorization, requestKey } = {}) => {
  const rateKey = `${payLater ? "pay-later" : "approval"}:${requestKey || payment?.id || payment?.email || "unknown"}`;
  if (isRateLimited(rateKey)) return { status: 429, body: { error: "Too many email delivery attempts. Try again later." } };
  const validationError = validatePayment(payment, payLater);
  if (validationError) return { status: 400, body: { error: validationError } };
  if (requireAdmin) {
    const adminError = await verifyAdminAuthorization(authorization);
    if (adminError) return { status: 403, body: { error: adminError } };
  }
  let deliveryPayment = payment;
  if (verify) {
    const verificationError = await verifyPaymentRecord(payment, payLater);
    if (verificationError.error) return { status: 403, body: { error: verificationError.error } };
    deliveryPayment = verificationError.payment;
  }
  const deliveryAttempt = await beginEmailDelivery(deliveryPayment);
  if (deliveryAttempt.error) return { status: 503, body: { error: deliveryAttempt.error } };
  if (deliveryAttempt.limited) return { status: 429, body: { error: "Too many email delivery attempts. Try again later." } };
  const { apiKey, from, fromName, replyTo } = config();
  if (!apiKey || !isEmail(from)) return { status: 503, body: { error: "Brevo is not configured. Set BREVO_API_KEY and BREVO_FROM_EMAIL in the deployment environment." } };

  const qrBuffer = await QRCode.toBuffer(deliveryPayment.ticketQrValue, { width: 520, margin: 2, errorCorrectionLevel: "H", color: { dark: "#0B1F3A", light: "#FFFFFF" } });
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: fromName, email: from },
      to: [{ email: deliveryPayment.email.trim(), name: deliveryPayment.studentName.trim() }],
      replyTo: { email: replyTo },
      subject: `Your JPCS - LCC ${deliveryPayment.offeringName} ${payLater ? "Pay Later reservation" : "confirmation"}`,
      htmlContent: createHtml(deliveryPayment, payLater),
      textContent: createText(deliveryPayment, payLater),
      attachment: [{ content: qrBuffer.toString("base64"), name: "jpcs-lcc-attendance-qr.png" }],
      tags: ["jpcs-payment", payLater ? "pay-later" : "film-showing"],
    }),
  });
  let body = {};
  try { body = await response.json(); } catch { body = {}; }
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : "Brevo rejected the email.";
    await finishEmailDelivery(deliveryAttempt.id, "Failed", null, message);
    return { status: 502, body: { error: message } };
  }
  await finishEmailDelivery(deliveryAttempt.id, "Sent", body?.messageId ?? null, null);
  return { status: 200, body: { emailId: body?.messageId ?? null } };
};

export const sendApprovalEmail = (payment, options) => sendEmail(payment, false, options);
export const sendPayLaterEmail = (payment, options) => sendEmail(payment, true, options);
