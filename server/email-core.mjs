import { createTicketQrImage } from "./ticket-qr-image.mjs";

const QR_PREFIX = "JPCS-LCC-TICKET:";
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const config = () => ({
  apiKey: process.env.BREVO_API_KEY?.trim(),
  from: (process.env.BREVO_FROM_EMAIL ?? "jpcslccpayment@gmail.com").trim(),
  fromName: (process.env.BREVO_FROM_NAME ?? "Junior Philippines Computer Society").trim(),
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
const attendeesFor = (payment) => Array.isArray(payment?.attendees) && payment.attendees.length
  ? payment.attendees
  : [{ name: payment?.studentName, position: 1, ticketId: payment?.ticketId, ticketQrValue: payment?.ticketQrValue }];
const attendeeNames = (payment) => attendeesFor(payment).map((attendee) => String(attendee.name ?? "").trim()).filter(Boolean);
const attendeeListHtml = (payment) => attendeesFor(payment).map((attendee, index) => `<li style="margin:0 0 7px;color:#0b1f3a"><strong>${escapeHtml(attendee.name)}</strong>${payment.generateQr !== false ? `<span style="color:#7a8799"> · Ticket ${escapeHtml(attendee.ticketId ?? `#${index + 1}`)}</span>` : ""}</li>`).join("");
const attendeeListText = (payment) => attendeesFor(payment).map((attendee, index) => `${index + 1}. ${attendee.name}${payment.generateQr !== false ? ` · Ticket ${attendee.ticketId ?? "-"}` : ""}`).join("\n");
const attachmentBaseName = (name, index) => {
  const normalized = String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return normalized || `attendee-${index + 1}`;
};
const field = (label, value) => `<td style="width:50%;padding:9px 10px;border:1px solid #d9e2ef;border-radius:10px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word"><div style="font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#7a8799;font-weight:700">${escapeHtml(label)}</div><div style="margin-top:5px;color:#0b1f3a;font-size:13px;font-weight:700;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(value)}</div></td>`;

const createHtmlContent = (payment, payLater) => {
  const firstName = attendeeNames(payment)[0]?.split(/\s+/)[0] ?? "there";
  const names = attendeeNames(payment);
  const statusTitle = payLater ? "Payment reserved" : "Payment confirmed";
  const subtitle = payLater ? "Your Pay Later reservation is ready." : "Junior Philippines Computer Society";
  const intro = payLater
    ? `Your reservation for <strong style="color:#0b1f3a">${escapeHtml(payment.offeringName)}</strong> is <strong style="color:#b66a00">Not Paid Yet</strong>. Pay using ${escapeHtml(payment.method)} before the deadline, then keep this email for event entry.`
    : `Your payment for <strong style="color:#0b1f3a">${escapeHtml(payment.offeringName)}</strong> has been confirmed. ${payment.generateQr !== false ? "Keep this email and the attached QR code for event check-in." : "Keep this email for your payment confirmation."}`;
  const reminder = payment.generateQr !== false ? `<p style="margin:14px 0 0;font-size:13px;line-height:1.7;color:#60708a;font-style:italic"><strong>REMINDER:</strong> Please download your QR codes before going to the auditorium because internet access may not be available.</p>` : "";
  const rows = payLater
    ? `<tr>${field("Reference", payment.reference)}${field("Total", formatCurrency(Number(payment.amount)))}</tr><tr>${field("Names", `${names.length} attendee${names.length === 1 ? "" : "s"}`)}${field("Method", payment.method)}</tr><tr>${field("School details", paymentDetails(payment))}${field("Deadline", formatDateTime(payment.paymentDeadlineAt))}</tr><tr>${field("Status", "Not Paid Yet")}${field("Price per name", formatCurrency(Number(payment.amount) / names.length))}</tr>`
    : `<tr>${field("Reference", payment.reference)}${field("Receipt", payment.receiptNumber)}</tr><tr>${field("Total", formatCurrency(Number(payment.amount)))}${field("Method", payment.method)}</tr><tr>${field("Names", `${names.length} attendee${names.length === 1 ? "" : "s"}`)}${field("School details", paymentDetails(payment))}</tr><tr>${field("Confirmed", formatDateTime(payment.approvedAt))}${field("Status", "Paid")}</tr>`;
  const qrNote = payment.generateQr !== false
    ? payLater ? "A separate QR is attached for each attendee. The payment remains Not Paid Yet until it is collected and recorded by an admin." : "A separate QR is attached for each attendee. Download the matching PNG before attending."
    : "Keep this email and take a screenshot of this confirmation for your records. The payment details and attendee list are included.";
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f4f7fb;color:#17243a;font-family:Arial,sans-serif"><div style="max-width:640px;margin:0 auto;padding:28px 16px"><div style="overflow:hidden;border:1px solid #d9e2ef;border-radius:18px;background:#ffffff"><div style="padding:24px;background:#0b1f3a;color:#ffffff"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#bfd4ed;font-weight:700">Junior Philippines Computer Society</div><div style="margin-top:8px;font-size:24px;font-weight:800">${statusTitle}</div><div style="margin-top:7px;font-size:13px;color:#d8e7f7">${subtitle}</div></div><div style="padding:28px 24px"><p style="margin:0;font-size:16px;font-weight:700;color:#0b1f3a">Hi ${escapeHtml(firstName)},</p><p style="margin:14px 0 0;font-size:14px;line-height:1.7;color:#60708a">${intro}</p>${reminder}<table role="presentation" style="width:100%;margin:22px 0 0;border-spacing:7px;table-layout:fixed">${rows}</table><div style="margin-top:20px;padding:16px;border:1px solid #d9e2ef;border-radius:16px;background:#f4f7fb"><div style="font-size:14px;font-weight:800;color:#0b1f3a">Attendees and tickets</div><ul style="margin:12px 0 0;padding-left:20px;font-size:13px;line-height:1.6">${attendeeListHtml(payment)}</ul></div><div style="margin:18px auto 0;max-width:360px;padding:18px;text-align:center;border:1px solid #d9e2ef;border-radius:16px;background:#f4f7fb"><div style="font-size:14px;font-weight:800;color:#0b1f3a">Attendance QR list included</div><div style="margin-top:8px;font-size:11px;line-height:1.6;color:#7a8799">${qrNote}</div></div></div><div style="padding:18px 24px;border-top:1px solid #d9e2ef;background:#f4f7fb;font-size:11px;line-height:1.6;color:#7a8799">JPCS-LCC. Payment Confirmation</div></div></div></body></html>`;
};

const createHtml = (payment, payLater) => {
  const hasQr = payment.generateQr !== false;
  return createHtmlContent(payment, payLater)
    .replace("Attendees and tickets", hasQr ? "Attendees and tickets" : "Attendees")
    .replace("Attendance QR list included", hasQr ? "Attendance QR list included" : "Attendance details")
    .replace("then keep this email for event entry.", hasQr ? "then keep this email for event entry." : "then keep this email.");
};

const createText = (payment, payLater) => [
  payLater ? "Junior Philippines Computer Society - Pay Later reservation" : "Junior Philippines Computer Society - payment confirmed",
  "",
  `Hi ${payment.studentName.trim().split(/\s+/)[0]},`,
  payLater ? `Your reservation for ${payment.offeringName} is Not Paid Yet.` : `Your payment for ${payment.offeringName} has been confirmed.`,
  "",
  `Reference: ${payment.reference}`,
  `Total: ${formatCurrency(Number(payment.amount))}`,
  `Attendees: ${attendeeNames(payment).length}`,
  `Method: ${payment.method}`,
  ...(payLater ? [`Deadline: ${formatDateTime(payment.paymentDeadlineAt)}`, "Status: Not Paid Yet"] : [`Receipt: ${payment.receiptNumber}`, `School details: ${paymentDetails(payment)}`, `Confirmed: ${formatDateTime(payment.approvedAt)}`]),
  "",
  payment.generateQr !== false ? "Attendees and tickets:" : "Attendees:",
  attendeeListText(payment),
  "",
  payment.generateQr !== false ? payLater ? "The attendance QR is attached and can be used for event entry. Your payment remains Not Paid Yet until it is collected and recorded by an admin." : "The attendance QR code is attached to this email." : "Keep this email and take a screenshot of this confirmation for your records.",
  ...(payment.generateQr !== false ? ["REMINDER: Please download your QR codes before going to the auditorium because internet access may not be available."] : []),
  "",
  "JPCS-LCC. Payment Confirmation",
].join("\n");

const validatePayment = (payment, payLater) => {
  if (!payment || typeof payment !== "object") return "Payment data is required.";
  if (payLater ? payment.status !== "Pending" || payment.paymentState !== "Unpaid" : payment.status !== "Approved") return payLater ? "Only unpaid Pay Later payments can be emailed." : "Only approved payments can be emailed.";
  const requiredStrings = payLater ? ["id", "studentName", "email", "offeringName", "reference", "method"] : ["id", "studentName", "email", "offeringName", "reference", "receiptNumber", "approvedAt", "method"];
  if (requiredStrings.some((fieldName) => typeof payment[fieldName] !== "string" || !payment[fieldName].trim())) return payLater ? "Pay Later payment data is incomplete." : "Approved payment data is incomplete.";
  if (!isEmail(payment.email.trim())) return "The recipient email is invalid.";
  if (!Number.isFinite(Number(payment.amount)) || Number(payment.amount) <= 0) return "The payment amount is invalid.";
  const attendees = attendeesFor(payment);
  if (!attendees.length || attendees.some((attendee) => typeof attendee.name !== "string" || !attendee.name.trim())) return "The attendee list is incomplete.";
  if (payment.generateQr !== false && attendees.some((attendee) => typeof attendee.ticketId !== "string" || !attendee.ticketId.trim() || typeof attendee.ticketQrValue !== "string" || attendee.ticketQrValue !== `${QR_PREFIX}${attendee.ticketId}`)) return payLater ? "The attendance QR list is incomplete." : "The ticket QR list is incomplete.";
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
  const attendeesResponse = await fetch(`${supabaseUrl}/rest/v1/hs-payment-attendees?payment_id=eq.${encodeURIComponent(storedPayment.id)}&select=id,name,position,ticket_id,ticket_qr_value,attended_at&order=position.asc`, { headers });
  if (!attendeesResponse.ok) return reject("The attendee tickets could not be verified.");
  const storedAttendees = await attendeesResponse.json();
  const canonicalAttendees = Array.isArray(storedAttendees) && storedAttendees.length
    ? storedAttendees
    : [{ id: `${storedPayment.id}-legacy`, name: payer?.name, position: 1, ticket_id: storedPayment.ticket_id, ticket_qr_value: storedPayment.ticket_qr_value, attended_at: storedPayment.attended_at }];
  const submittedAttendees = attendeesFor(payment);
  const storedParentTicketId = String(storedPayment.ticket_id ?? "");
  const storedParentQrValue = String(storedPayment.ticket_qr_value ?? "");
  const parentTicketMatches = payLater && !storedParentTicketId && !storedParentQrValue
    ? true
    : storedParentTicketId === String(payment.ticketId ?? "")
      && storedParentQrValue === String(payment.ticketQrValue ?? "");
  const attendeesMatch = canonicalAttendees.length === submittedAttendees.length
    && canonicalAttendees.every((storedAttendee, index) => {
      const submittedAttendee = submittedAttendees[index];
      return String(storedAttendee.name).trim().toLowerCase() === String(submittedAttendee?.name ?? "").trim().toLowerCase()
        && String(storedAttendee.ticket_id ?? "") === String(submittedAttendee?.ticketId ?? "")
        && String(storedAttendee.ticket_qr_value ?? "") === String(submittedAttendee?.ticketQrValue ?? "");
    });
  const isMatchingRecord = payer
    && String(payer.email).toLowerCase() === payment.email.trim().toLowerCase()
    && String(payer.name).trim().toLowerCase() === payment.studentName.trim().toLowerCase()
    && storedPayment.reference === payment.reference
    && storedPayment.offering_name === payment.offeringName
    && storedPayment.method === payment.method
     && parentTicketMatches
    && Number(storedPayment.amount) === Number(payment.amount)
    && String(storedPayment.school_level ?? "") === String(payment.schoolLevel ?? "")
    && String(storedPayment.year_level ?? "") === String(payment.yearLevel ?? "")
    && String(storedPayment.strand ?? "") === String(payment.strand ?? "")
    && String(storedPayment.course ?? "") === String(payment.course ?? "")
    && storedPayment.payment_mode === (payLater ? "PayLater" : "PayNow")
    && storedPayment.status === (payLater ? "Pending" : "Approved")
    && storedPayment.payment_state === (payLater ? "Unpaid" : "Paid")
    && attendeesMatch;
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
    generateQr: storedPayment.generate_qr !== false,
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
    attendees: canonicalAttendees.map((attendee) => ({
      id: String(attendee.id),
      name: String(attendee.name),
      position: Number(attendee.position) || 1,
      ticketId: attendee.ticket_id ?? undefined,
      ticketQrValue: attendee.ticket_qr_value ?? undefined,
      attendedAt: attendee.attended_at ?? undefined,
    })),
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

const updatePaymentEmailState = async (paymentId, values) => {
  const { supabaseUrl, serviceRoleKey } = config();
  if (!supabaseUrl || !serviceRoleKey) return { error: "Server email delivery tracking is not configured." };
  const response = await fetch(`${supabaseUrl}/rest/v1/hs-payments?id=eq.${encodeURIComponent(paymentId)}`, {
    method: "PATCH",
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(values),
  });
  return response.ok ? { error: null } : { error: "Server email delivery tracking is unavailable." };
};

const claimEmailDelivery = async (payment) => {
  const { supabaseUrl, serviceRoleKey } = config();
  if (!supabaseUrl || !serviceRoleKey) return { error: "Server email delivery tracking is not configured." };
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  const paymentId = encodeURIComponent(payment.id);
  const sentAttemptResponse = await fetch(`${supabaseUrl}/rest/v1/hs-email-deliveries?payment_id=eq.${paymentId}&status=eq.Sent&select=id&limit=1`, { headers });
  if (!sentAttemptResponse.ok) return { error: "Server email delivery tracking is unavailable." };
  const sentAttempts = await sentAttemptResponse.json();
  if (Array.isArray(sentAttempts) && sentAttempts.length) return { sent: true };

  const claimResponse = await fetch(`${supabaseUrl}/rest/v1/hs-payments?id=eq.${paymentId}&or=(email_delivery_status.is.null,email_delivery_status.eq.Failed)`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ email_delivery_status: "Sending", email_delivery_error: null }),
  });
  if (!claimResponse.ok) return { error: "Server email delivery tracking is unavailable." };
  const claimedRows = await claimResponse.json();
  if (Array.isArray(claimedRows) && claimedRows.length) return { claimed: true };

  const statusResponse = await fetch(`${supabaseUrl}/rest/v1/hs-payments?id=eq.${paymentId}&select=email_delivery_status`, { headers });
  if (!statusResponse.ok) return { error: "Server email delivery tracking is unavailable." };
  const statusRows = await statusResponse.json();
  const status = Array.isArray(statusRows) ? statusRows[0]?.email_delivery_status : undefined;
  if (status === "Sent") return { sent: true };
  if (status === "Sending") return { inProgress: true };
  return { error: "The payment email could not be claimed for delivery." };
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
  const deliveryClaim = await claimEmailDelivery(deliveryPayment);
  if (deliveryClaim.error) return { status: 503, body: { error: deliveryClaim.error } };
  if (deliveryClaim.sent) return { status: 409, body: { error: "This payment confirmation email has already been sent." } };
  if (deliveryClaim.inProgress) return { status: 409, body: { error: "This payment confirmation email is already being sent." } };
  const deliveryAttempt = await beginEmailDelivery(deliveryPayment);
  if (deliveryAttempt.error) {
    await updatePaymentEmailState(deliveryPayment.id, { email_delivery_status: "Failed", email_delivery_error: deliveryAttempt.error });
    return { status: 503, body: { error: deliveryAttempt.error } };
  }
  if (deliveryAttempt.limited) {
    const message = "Too many email delivery attempts. Try again later.";
    await updatePaymentEmailState(deliveryPayment.id, { email_delivery_status: "Failed", email_delivery_error: message });
    return { status: 429, body: { error: message } };
  }
  const { apiKey, from, fromName, replyTo } = config();
  if (!apiKey || !isEmail(from)) {
    const message = "Brevo is not configured. Set BREVO_API_KEY and BREVO_FROM_EMAIL in the deployment environment.";
    await finishEmailDelivery(deliveryAttempt.id, "Failed", null, message);
    await updatePaymentEmailState(deliveryPayment.id, { email_delivery_status: "Failed", email_delivery_error: message });
    return { status: 503, body: { error: message } };
  }

  try {
    const usedAttachmentNames = new Set();
    const qrAttachments = deliveryPayment.generateQr === false ? undefined : await Promise.all(attendeesFor(deliveryPayment).map(async (attendee, index) => {
      const qrBuffer = await createTicketQrImage({ value: attendee.ticketQrValue, name: attendee.name, ticketId: attendee.ticketId });
      const baseName = attachmentBaseName(attendee.name, index);
      let fileName = baseName;
      let suffix = 2;
      while (usedAttachmentNames.has(fileName)) fileName = `${baseName}-${suffix++}`;
      usedAttachmentNames.add(fileName);
      return {
        content: qrBuffer.toString("base64"),
        name: `${fileName}.png`,
      };
    }));
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { accept: "application/json", "api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: fromName, email: from },
        to: [{ email: deliveryPayment.email.trim(), name: attendeeNames(deliveryPayment)[0] ?? deliveryPayment.studentName.trim() }],
        replyTo: { email: replyTo },
        subject: `Your ${deliveryPayment.offeringName} ${payLater ? "Pay Later reservation" : "payment confirmation"} | Junior Philippines Computer Society`,
        htmlContent: createHtml(deliveryPayment, payLater),
        textContent: createText(deliveryPayment, payLater),
        ...(qrAttachments ? { attachment: qrAttachments } : {}),
        tags: ["jpcs-payment", payLater ? "pay-later" : "film-showing"],
      }),
    });
    let body = {};
    try { body = await response.json(); } catch { body = {}; }
    if (!response.ok) {
      const message = typeof body?.message === "string" ? body.message : "Brevo rejected the email.";
      await finishEmailDelivery(deliveryAttempt.id, "Failed", null, message);
      await updatePaymentEmailState(deliveryPayment.id, { email_delivery_status: "Failed", email_delivery_error: message });
      return { status: 502, body: { error: message } };
    }
    const emailId = body?.messageId ?? null;
    const sentAt = new Date().toISOString();
    await finishEmailDelivery(deliveryAttempt.id, "Sent", emailId, null);
    await updatePaymentEmailState(deliveryPayment.id, { email_delivery_status: "Sent", email_sent_at: sentAt, email_id: emailId, email_delivery_error: null });
    return { status: 200, body: { emailId, emailSentAt: sentAt } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The email could not be delivered.";
    await finishEmailDelivery(deliveryAttempt.id, "Failed", null, message);
    await updatePaymentEmailState(deliveryPayment.id, { email_delivery_status: "Failed", email_delivery_error: message });
    return { status: 502, body: { error: message } };
  }
};

export const sendApprovalEmail = (payment, options) => sendEmail(payment, false, options);
export const sendPayLaterEmail = (payment, options) => sendEmail(payment, true, options);
