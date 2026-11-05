import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const paymentProofBucket = "hs-payment-proofs";
const maxProofBytes = 3 * 1024 * 1024;
const submissionWindowMs = 10 * 60 * 1000;
const maxEmailSubmissions = 5;
const maxIpSubmissions = 20;
const emailAlreadyUsedMessage = "email has been used";
const duplicateEmailConstraint = "hs_payments_email_once_idx";
const allowedStrands = new Set(["ABM", "GAS", "HUMSS", "STEM", "HE", "ICT"]);

const config = () => ({
  supabaseUrl: (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim(),
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
});

export class PublicSubmissionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "PublicSubmissionError";
    this.status = status;
  }
}

const parseProofImage = (value) => {
  if (typeof value !== "string" || !value) return null;
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new PublicSubmissionError("Choose a valid PNG, JPG, or WEBP proof image.");
  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > maxProofBytes) throw new PublicSubmissionError("Choose an image smaller than 3 MB.");
  const isPng = mime === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = mime === "image/jpeg" && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const isWebp = mime === "image/webp" && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (!isPng && !isJpeg && !isWebp) throw new PublicSubmissionError("The proof image content does not match its file type.");
  return { mime, buffer, extension: mime === "image/jpeg" ? "jpg" : mime.split("/")[1] };
};

const normalizeInput = (input) => {
  if (!input || typeof input !== "object") throw new PublicSubmissionError("Payment data is required.");
  const payment = input;
  const rawAttendeeNames = Array.isArray(payment.attendeeNames) ? payment.attendeeNames : [payment.studentName];
  const attendeeNames = rawAttendeeNames.map((name) => typeof name === "string" ? name.trim() : "");
  const studentName = attendeeNames[0] ?? "";
  const email = typeof payment.email === "string" ? payment.email.trim().toLowerCase() : "";
  const schoolLevel = typeof payment.schoolLevel === "string" ? payment.schoolLevel : "";
  const yearLevel = typeof payment.yearLevel === "string" ? payment.yearLevel.trim() : "";
  const method = typeof payment.method === "string" ? payment.method : "";
  const paymentMode = typeof payment.paymentMode === "string" ? payment.paymentMode : "";
  if (!studentName || studentName.length > 160) throw new PublicSubmissionError("A valid student name is required.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new PublicSubmissionError("A valid email address is required.");
  if (!yearLevel || yearLevel.length > 80) throw new PublicSubmissionError("A valid year level is required.");
  if (!["Junior High School", "Senior High School", "College"].includes(schoolLevel)) throw new PublicSubmissionError("The selected school level is invalid.");
  if (!["Cash", "GCash", "MariBank"].includes(method)) throw new PublicSubmissionError("The selected payment method is invalid.");
  if (!["PayNow", "PayLater"].includes(paymentMode)) throw new PublicSubmissionError("The selected payment timing is invalid.");
  const strand = typeof payment.strand === "string" ? payment.strand.trim() : undefined;
  const course = typeof payment.course === "string" ? payment.course.trim() : undefined;
  if (schoolLevel === "Senior High School" && (!strand || !allowedStrands.has(strand))) throw new PublicSubmissionError("Choose a valid Senior High School strand.");
  if (schoolLevel === "College" && !course) throw new PublicSubmissionError("A course is required for College payers.");
  const proofImage = paymentMode === "PayNow" && method !== "Cash" ? parseProofImage(payment.proofImage) : null;
  if (paymentMode === "PayNow" && method !== "Cash" && !proofImage) throw new PublicSubmissionError("Proof of payment is required for cashless payments.");
  if (!payment.offeringId || typeof payment.offeringId !== "string") throw new PublicSubmissionError("The selected payment type is invalid.");
  if (!attendeeNames.length || attendeeNames.some((name) => !name || name.length > 160)) throw new PublicSubmissionError("Each attendee must have a valid name.");
  if (new Set(attendeeNames.map((name) => name.toLowerCase())).size !== attendeeNames.length) throw new PublicSubmissionError("Each attendee name must be unique.");
  const idempotencyKey = typeof payment.idempotencyKey === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payment.idempotencyKey) ? payment.idempotencyKey : undefined;
  return { idempotencyKey, studentName, attendeeNames, email, schoolLevel, yearLevel, strand, course, offeringId: payment.offeringId, method, paymentMode, proofImage };
};

const hashValue = (value, secret) => createHash("sha256").update(`${secret}:${value}`).digest("hex");

const isDuplicateEmailError = (error) => {
  const message = String(error?.message ?? "").toLowerCase();
  const details = String(error?.details ?? "").toLowerCase();
  return (error?.code === "P0001" && (message === emailAlreadyUsedMessage || details.includes("email_already_used")))
    || (error?.code === "23505" && (message.includes(duplicateEmailConstraint) || details.includes(duplicateEmailConstraint)));
};

const checkSubmissionRateLimit = async (client, email, requestKey, secret) => {
  const ipHash = requestKey ? hashValue(requestKey, secret) : undefined;
  const { data, error } = await client.rpc("hs_claim_submission_slot", { p_email: email, p_ip_hash: ipHash ?? null, p_email_limit: maxEmailSubmissions, p_ip_limit: maxIpSubmissions, p_window_seconds: Math.floor(submissionWindowMs / 1000) });
  if (error) throw error;
  if (data !== true) throw new PublicSubmissionError("Too many payment submissions. Try again later.", 429);
};

const withAttendees = async (client, payment) => {
  const { data, error } = await client
    .from("hs-payment-attendees")
    .select("*")
    .eq("payment_id", payment.id)
    .order("position", { ascending: true });
  if (error) throw error;
  return { ...payment, attendees: data ?? [] };
};

export async function submitPayment(input, { requestKey } = {}) {
  const { supabaseUrl, serviceRoleKey } = config();
  if (!supabaseUrl || !serviceRoleKey) throw new PublicSubmissionError("The secure payment submission service is not configured.", 503);
  const payment = normalizeInput(input);
  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const paymentId = payment.idempotencyKey ?? randomUUID();
  const existingResponse = await client.from("hs-payments").select("*").eq("id", paymentId).maybeSingle();
  if (existingResponse.error) throw existingResponse.error;
  if (existingResponse.data) {
    const payerResponse = await client.from("hs-payers").select("email,name,school_level,year_level,strand,course").eq("id", existingResponse.data.payer_id).maybeSingle();
    if (payerResponse.error) throw payerResponse.error;
    const existingPayer = payerResponse.data;
    const existingPayment = await withAttendees(client, existingResponse.data);
    const existingNames = Array.isArray(existingPayment.attendees) ? existingPayment.attendees.map((attendee) => String(attendee.name).trim()) : [existingPayer?.name];
    const sameSubmission = existingPayer?.email === payment.email
      && JSON.stringify(existingNames) === JSON.stringify(payment.attendeeNames)
      && existingPayer.school_level === payment.schoolLevel
      && existingPayer.year_level === payment.yearLevel
      && (existingPayer.strand ?? undefined) === payment.strand
      && (existingPayer.course ?? undefined) === payment.course
      && existingResponse.data.offering_id === payment.offeringId
      && existingResponse.data.method === payment.method
      && existingResponse.data.payment_mode === payment.paymentMode
      && Boolean(existingResponse.data.proof_path) === Boolean(payment.proofImage);
    if (!sameSubmission) throw new PublicSubmissionError("This payment submission key is already in use.", 409);
    return existingPayment;
  }
  const settingsResponse = await client.from("hs-site-settings").select("is_open,public_message,allow_multiple_names,max_names").eq("site_key", "public-payment").maybeSingle();
  if (settingsResponse.error) throw settingsResponse.error;
  const siteSettings = settingsResponse.data;
  if (!siteSettings?.is_open) throw new PublicSubmissionError(siteSettings?.public_message || "The payment portal is temporarily closed while we update it. Please check back soon.", 423);
  const maxNames = siteSettings.allow_multiple_names ? Math.min(20, Math.max(2, Number(siteSettings.max_names) || 10)) : 1;
  if (payment.attendeeNames.length > maxNames) throw new PublicSubmissionError(`The payment portal allows at most ${maxNames} attendee name${maxNames === 1 ? "" : "s"}.`);
  await checkSubmissionRateLimit(client, payment.email, requestKey, serviceRoleKey);

  const offeringResponse = await client.from("hs-offerings").select("active,archived_at").eq("id", payment.offeringId).maybeSingle();
  if (offeringResponse.error) throw offeringResponse.error;
  const offering = offeringResponse.data;
  if (!offering?.active || offering.archived_at) throw new PublicSubmissionError("The selected payment type is not available.");
  const payerId = randomUUID();
  let proofPath;
  try {
    if (payment.proofImage) {
      proofPath = `${paymentId}/${randomUUID()}.${payment.proofImage.extension}`;
      const { error } = await client.storage.from(paymentProofBucket).upload(proofPath, payment.proofImage.buffer, { contentType: payment.proofImage.mime, upsert: false });
      if (error) throw error;
    }
    const { data, error } = await client.rpc("hs_submit_payment", {
      p_payment_id: paymentId,
      p_payer_id: payerId,
      p_student_name: payment.studentName,
      p_email: payment.email,
      p_school_level: payment.schoolLevel,
      p_year_level: payment.yearLevel,
      p_strand: payment.strand ?? null,
      p_course: payment.course ?? null,
      p_offering_id: payment.offeringId,
      p_method: payment.method,
      p_payment_mode: payment.paymentMode,
      p_proof_path: proofPath ?? null,
      p_attendee_names: payment.attendeeNames,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) ?? null;
    if (!row?.id) throw new Error("The payment was not returned by the database.");
    return withAttendees(client, row);
  } catch (error) {
    if (proofPath) {
      try { await client.storage.from(paymentProofBucket).remove([proofPath]); } catch { /* Keep the original submission error. */ }
    }
    if (error?.code === "23505" || isDuplicateEmailError(error)) {
      const existingResponse = await client.from("hs-payments").select("*").eq("id", paymentId).maybeSingle();
      if (!existingResponse.error && existingResponse.data) return withAttendees(client, existingResponse.data);
    }
    if (isDuplicateEmailError(error)) throw new PublicSubmissionError(emailAlreadyUsedMessage, 409);
    if (error instanceof PublicSubmissionError) throw error;
    throw error;
  }
}
