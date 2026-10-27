import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const paymentProofBucket = "hs-payment-proofs";
const maxProofBytes = 3 * 1024 * 1024;
const submissionWindowMs = 10 * 60 * 1000;
const maxEmailSubmissions = 5;
const maxIpSubmissions = 20;

const config = () => ({
  supabaseUrl: (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").trim(),
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  rateLimitSalt: process.env.RATE_LIMIT_SALT?.trim() ?? "jpcs-payment-rate-limit",
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
  if (!buffer.length || buffer.length > maxProofBytes) throw new PublicSubmissionError("Choose an image smaller than 5 MB.");
  const isPng = mime === "image/png" && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = mime === "image/jpeg" && buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
  const isWebp = mime === "image/webp" && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (!isPng && !isJpeg && !isWebp) throw new PublicSubmissionError("The proof image content does not match its file type.");
  return { mime, buffer, extension: mime === "image/jpeg" ? "jpg" : mime.split("/")[1] };
};

const normalizeInput = (input) => {
  if (!input || typeof input !== "object") throw new PublicSubmissionError("Payment data is required.");
  const payment = input;
  const studentName = typeof payment.studentName === "string" ? payment.studentName.trim() : "";
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
  if (schoolLevel === "Senior High School" && !strand) throw new PublicSubmissionError("A strand is required for Senior High School payers.");
  if (schoolLevel === "College" && !course) throw new PublicSubmissionError("A course is required for College payers.");
  const senderAccountName = typeof payment.senderAccountName === "string" ? payment.senderAccountName.trim() : undefined;
  const senderReference = typeof payment.senderReference === "string" ? payment.senderReference.trim() : undefined;
  const proofImage = paymentMode === "PayNow" && method !== "Cash" ? parseProofImage(payment.proofImage) : null;
  if (paymentMode === "PayNow" && method !== "Cash" && (!senderAccountName || !senderReference || !proofImage)) throw new PublicSubmissionError("Sender account, payment reference, and proof are required for cashless payments.");
  if (!payment.offeringId || typeof payment.offeringId !== "string") throw new PublicSubmissionError("The selected payment type is invalid.");
  const idempotencyKey = typeof payment.idempotencyKey === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payment.idempotencyKey) ? payment.idempotencyKey : undefined;
  return { idempotencyKey, studentName, email, schoolLevel, yearLevel, strand, course, offeringId: payment.offeringId, method, paymentMode, senderAccountName, senderReference, proofImage };
};

const hashValue = (value, salt) => createHash("sha256").update(`${salt}:${value}`).digest("hex");

const checkSubmissionRateLimit = async (client, email, requestKey, salt) => {
  const ipHash = requestKey ? hashValue(requestKey, salt) : undefined;
  const { data, error } = await client.rpc("hs_claim_submission_slot", { p_email: email, p_ip_hash: ipHash ?? null, p_email_limit: maxEmailSubmissions, p_ip_limit: maxIpSubmissions, p_window_seconds: Math.floor(submissionWindowMs / 1000) });
  if (error) throw error;
  if (data !== true) throw new PublicSubmissionError("Too many payment submissions. Try again later.", 429);
};

export async function submitPayment(input, { requestKey } = {}) {
  const { supabaseUrl, serviceRoleKey, rateLimitSalt } = config();
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
    const sameSubmission = existingPayer?.email === payment.email
      && existingPayer.name === payment.studentName
      && existingPayer.school_level === payment.schoolLevel
      && existingPayer.year_level === payment.yearLevel
      && (existingPayer.strand ?? undefined) === payment.strand
      && (existingPayer.course ?? undefined) === payment.course
      && existingResponse.data.offering_id === payment.offeringId
      && existingResponse.data.method === payment.method
      && existingResponse.data.payment_mode === payment.paymentMode
      && (existingResponse.data.sender_account_name ?? undefined) === (payment.senderAccountName ?? undefined)
      && (existingResponse.data.sender_reference ?? undefined) === (payment.senderReference ?? undefined);
    if (!sameSubmission) throw new PublicSubmissionError("This payment submission key is already in use.", 409);
    return existingResponse.data;
  }
  await checkSubmissionRateLimit(client, payment.email, requestKey, rateLimitSalt);

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
      p_sender_account_name: payment.senderAccountName ?? null,
      p_sender_reference: payment.senderReference ?? null,
      p_proof_path: proofPath ?? null,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) ?? null;
    if (!row?.id) throw new Error("The payment was not returned by the database.");
    return row;
  } catch (error) {
    if (proofPath) {
      try { await client.storage.from(paymentProofBucket).remove([proofPath]); } catch { /* Keep the original submission error. */ }
    }
    if (error?.code === "23505") {
      const existingResponse = await client.from("hs-payments").select("*").eq("id", paymentId).maybeSingle();
      if (!existingResponse.error && existingResponse.data) return existingResponse.data;
    }
    if (error instanceof PublicSubmissionError) throw error;
    throw error;
  }
}
