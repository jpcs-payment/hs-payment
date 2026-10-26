import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cloneInitialData } from "../data/seed";
import { createTicketQrValue } from "../lib/branding";
import { sendApprovalEmail as deliverApprovalEmail, sendPayLaterEmail as deliverPayLaterEmail } from "../lib/email";
import { initials, createReference } from "../lib/utils";
import { requireSupabase, supabase } from "../lib/supabase";
import type {
  AppData,
  NewPaymentInput,
  NewPaymentOfferingInput,
  PaymentAllocation,
  PaymentMethodConfig,
  PaymentOffering,
  PaymentRecord,
  SchoolLevel,
  Session,
  Student,
  TicketCheckInResult,
} from "../types";

interface AppContextValue {
  data: AppData;
  session: Session | null;
  authLoading: boolean;
  dataLoading: boolean;
  dataError: string | null;
  login: (session: Session) => void;
  logout: () => void;
  retryData: () => Promise<void>;
  signInAdmin: (email: string, password: string) => Promise<void>;
  submitPayment: (input: NewPaymentInput) => Promise<PaymentRecord>;
  approvePayment: (paymentId: string) => Promise<PaymentRecord | undefined>;
  rejectPayment: (paymentId: string, reason: string) => Promise<PaymentRecord | undefined>;
  sendApprovalEmail: (payment: PaymentRecord) => Promise<PaymentRecord | undefined>;
  sendPayLaterEmail: (payment: PaymentRecord) => Promise<PaymentRecord | undefined>;
  markPayLaterReceived: (paymentId: string) => Promise<PaymentRecord | undefined>;
  checkInTicket: (value: string) => Promise<TicketCheckInResult>;
  undoAttendance: (paymentId: string) => Promise<PaymentRecord | undefined>;
  createOffering: (input: NewPaymentOfferingInput) => Promise<PaymentOffering>;
  saveOffering: (offering: PaymentOffering) => Promise<void>;
  archiveOffering: (offeringId: string) => Promise<void>;
  restoreOffering: (offeringId: string) => Promise<void>;
  archivePayer: (payerId: string) => Promise<void>;
  restorePayer: (payerId: string) => Promise<void>;
  deletePayerPermanently: (payerId: string) => Promise<void>;
  savePaymentMethod: (method: PaymentMethodConfig) => Promise<void>;
  resetDemo: () => void;
}

type DbRow = Record<string, any>;

const AppContext = createContext<AppContextValue | undefined>(undefined);

const createUuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const schoolLevels: SchoolLevel[] = ["Junior High School", "Senior High School", "College"];

const toAllocations = (value: unknown, amount: number): PaymentAllocation[] => {
  if (Array.isArray(value)) {
    const allocations = value
      .map((item) => {
        if (!item || typeof item !== "object") return undefined;
        const row = item as { recipient?: unknown; amount?: unknown };
        const recipient = typeof row.recipient === "string" ? row.recipient.trim() : "";
        const allocationAmount = typeof row.amount === "number" ? row.amount : Number(row.amount);
        return recipient && Number.isFinite(allocationAmount) ? { recipient, amount: allocationAmount } : undefined;
      })
      .filter((item): item is PaymentAllocation => Boolean(item));
    if (allocations.length) return allocations;
  }

  if (value && typeof value === "object") {
    const split = value as { jpcs?: unknown; ssg?: unknown };
    const jpcs = typeof split.jpcs === "number" ? split.jpcs : amount;
    const ssg = typeof split.ssg === "number" ? split.ssg : 0;
    return ssg > 0 ? [{ recipient: "JPCS", amount: jpcs }, { recipient: "SSG", amount: ssg }] : [{ recipient: "JPCS", amount: jpcs }];
  }

  return [{ recipient: "JPCS", amount }];
};

const mapOffering = (row: DbRow): PaymentOffering => {
  const amount = Number(row.amount) || 0;
  const configuredLevels = Array.isArray(row.applicable_school_levels) ? row.applicable_school_levels.filter((level: unknown): level is SchoolLevel => typeof level === "string" && schoolLevels.includes(level as SchoolLevel)) : [];
  return {
    id: String(row.id),
    slug: String(row.slug ?? ""),
    name: String(row.name),
    description: String(row.description ?? ""),
    amount,
    active: Boolean(row.active),
    availableMethods: Array.isArray(row.available_methods) ? row.available_methods : ["Cash", "GCash", "MariBank"],
    applicableSchoolLevels: configuredLevels.length ? configuredLevels : schoolLevels,
    allocations: toAllocations(row.allocations ?? row.revenue_split, amount),
    payLaterMethods: Array.isArray(row.pay_later_methods) ? row.pay_later_methods : [],
    payLaterDeadlineAt: row.pay_later_deadline_at ?? undefined,
    archivedAt: row.archived_at ?? undefined,
  };
};

const mapMethod = (row: DbRow): PaymentMethodConfig => ({
  id: row.id,
  enabled: Boolean(row.enabled),
  accountName: String(row.account_name ?? ""),
  accountNumber: String(row.account_number ?? ""),
  instructions: String(row.instructions ?? ""),
  qrImage: row.qr_image ?? undefined,
});

const mapPayer = (row: DbRow): Student => ({
  id: String(row.id),
  name: String(row.name ?? ""),
  email: String(row.email ?? ""),
  schoolLevel: row.school_level,
  yearLevel: String(row.year_level ?? ""),
  strand: row.strand ?? undefined,
  course: row.course ?? undefined,
  avatar: String(row.avatar ?? initials(String(row.name ?? ""))),
  archivedAt: row.archived_at ?? undefined,
});

const mapPayment = (row: DbRow, payers: Map<string, Student>, offerings: Map<string, PaymentOffering>): PaymentRecord => {
  const payer = payers.get(String(row.payer_id));
  const offering = offerings.get(String(row.offering_id));
  const amount = Number(row.amount) || offering?.amount || 0;
  return {
    id: String(row.id),
    reference: String(row.reference),
    studentId: String(row.payer_id),
    studentName: payer?.name ?? String(row.student_name ?? ""),
    email: payer?.email ?? String(row.email ?? ""),
    schoolLevel: payer?.schoolLevel ?? row.school_level,
    yearLevel: payer?.yearLevel ?? String(row.year_level ?? ""),
    strand: payer?.strand ?? row.strand ?? undefined,
    course: payer?.course ?? row.course ?? undefined,
    offeringId: String(row.offering_id),
    offeringName: String(row.offering_name ?? offering?.name ?? "Film Showing"),
    amount,
    allocations: toAllocations(row.allocations ?? row.revenue_split, amount),
    method: row.method,
    paymentMode: row.payment_mode === "PayLater" ? "PayLater" : "PayNow",
    paymentState: row.payment_state === "Paid" ? "Paid" : row.payment_state === "Unpaid" ? "Unpaid" : row.payment_state === "Rejected" ? "Rejected" : row.payment_state === "Cancelled" ? "Cancelled" : row.status === "Approved" ? "Paid" : row.status === "Rejected" ? "Rejected" : "AwaitingReview",
    paymentDeadlineAt: row.payment_deadline_at ?? undefined,
    senderAccountName: row.sender_account_name ?? undefined,
    senderReference: row.sender_reference ?? undefined,
    proofPath: row.proof_path ?? undefined,
    proofImage: row.proof_url ?? undefined,
    submittedAt: String(row.submitted_at),
    status: row.status,
    rejectionReason: row.rejection_reason ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    approvedByName: row.approved_by_name ?? undefined,
    approvedByEmail: row.approved_by_email ?? undefined,
    paidAt: row.paid_at ?? undefined,
    paidByName: row.paid_by_name ?? undefined,
    paidByEmail: row.paid_by_email ?? undefined,
    receiptNumber: row.receipt_number ?? undefined,
    ticketId: row.ticket_id ?? undefined,
    ticketQrValue: row.ticket_qr_value ?? undefined,
    emailDeliveryStatus: row.email_delivery_status ?? undefined,
    emailSentAt: row.email_sent_at ?? undefined,
    emailId: row.email_id ?? undefined,
    emailDeliveryError: row.email_delivery_error ?? undefined,
    attendedAt: row.attended_at ?? undefined,
  };
};

const dataUrlToBlob = (value: string) => {
  const [header, body] = value.split(",", 2);
  if (!header || !body) throw new Error("The proof image could not be read.");
  const mime = header.match(/data:([^;]+);base64/i)?.[1] ?? "image/jpeg";
  const binary = window.atob(body);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return { blob: new Blob([bytes], { type: mime }), mime };
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => cloneInitialData());
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(Boolean(supabase));
  const [dataError, setDataError] = useState<string | null>(null);

  const loadData = async (admin = false) => {
    setDataLoading(true);
    setDataError(null);
    try {
      const client = requireSupabase();
      const offeringsQuery = client.from("hs-offerings").select("*").order("created_at", { ascending: true });
      const methodsQuery = client.from("hs-payment-methods").select("*").order("id", { ascending: true });
      if (!admin) {
        offeringsQuery.eq("active", true).is("archived_at", null);
        methodsQuery.eq("enabled", true);
      }
      const [offeringsResponse, methodsResponse] = await Promise.all([
        offeringsQuery,
        methodsQuery,
      ]);
      if (offeringsResponse.error) throw offeringsResponse.error;
      if (methodsResponse.error) throw methodsResponse.error;

      const offerings = (offeringsResponse.data ?? []).map(mapOffering);
      const paymentMethods = (methodsResponse.data ?? []).map(mapMethod);
      if (!admin) {
        setData((current) => ({ ...current, offerings, paymentMethods }));
        return;
      }

      const [payersResponse, paymentsResponse] = await Promise.all([
        client.from("hs-payers").select("*").order("created_at", { ascending: false }),
        client.from("hs-payments").select("*").order("submitted_at", { ascending: false }),
      ]);
      if (payersResponse.error) throw payersResponse.error;
      if (paymentsResponse.error) throw paymentsResponse.error;
      const students = (payersResponse.data ?? []).map(mapPayer);
      const payers = new Map(students.map((payer) => [payer.id, payer]));
      const offeringMap = new Map(offerings.map((offering) => [offering.id, offering]));
      const payments = (paymentsResponse.data ?? []).map((payment) => mapPayment(payment, payers, offeringMap));
      setData({ students, offerings, paymentMethods, payments, developers: [] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The payment data could not be loaded.";
      setDataError(message);
      throw error;
    } finally {
      setDataLoading(false);
    }
  };

  const getAdminAuthProfile = async () => {
    const client = requireSupabase();
    const { data: authData } = await client.auth.getSession();
    const email = authData.session?.user.email;
    if (!email) return null;
    const { data: admin, error } = await client.from("hs-admins").select("email, display_name").eq("email", email).maybeSingle();
    if (error) throw error;
    if (!admin) return null;
    return { email: String(admin.email), name: String(admin.display_name ?? admin.email) };
  };

  useEffect(() => {
    if (!supabase) {
      setDataLoading(false);
      setAuthLoading(false);
      return undefined;
    }

    let mounted = true;
    const syncSession = async () => {
      try {
        const admin = await getAdminAuthProfile();
        if (!mounted) return;
        setSession(admin ? { role: "admin", adminName: admin.name, adminEmail: admin.email } : null);
        await loadData(Boolean(admin));
      } catch {
        if (mounted) setData(cloneInitialData());
        if (mounted) setDataError("The payment data could not be loaded.");
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };
    void syncSession();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void syncSession();
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const login = (nextSession: Session) => setSession(nextSession);

  const logout = () => {
    setSession(null);
    if (supabase) void supabase.auth.signOut();
  };

  const retryData = async () => {
    try {
      await loadData(session?.role === "admin");
    } catch {
      // The load error is exposed through dataError for the retry UI.
    }
  };

  const signInAdmin = async (email: string, password: string) => {
    const client = requireSupabase();
    const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    const admin = await getAdminAuthProfile();
    if (!admin) {
      await client.auth.signOut();
      throw new Error("This Supabase account is not registered as a JPCS admin.");
    }
    setSession({ role: "admin", adminName: admin.name, adminEmail: admin.email });
    await loadData(true);
  };

  const submitPayment = async (input: NewPaymentInput) => {
    const client = requireSupabase();
    const offering = data.offerings.find((item) => item.id === input.offeringId && item.active && !item.archivedAt);
    if (!offering) throw new Error("The Film Showing payment type is not available.");
    if (!offering.applicableSchoolLevels.includes(input.schoolLevel)) throw new Error("That payment type is not available for the selected school level.");
    if (!offering.availableMethods.includes(input.method)) throw new Error("That payment method is not available.");
    if (input.paymentMode === "PayLater") {
      if (!offering.payLaterMethods.includes(input.method)) throw new Error("Pay Later is not enabled for this payment method.");
      if (!offering.payLaterDeadlineAt || new Date(offering.payLaterDeadlineAt).getTime() <= Date.now()) throw new Error("The Pay Later deadline has passed or is not configured.");
    }

    const paymentId = createUuid();
    const payerId = createUuid();
    const isPayLater = input.paymentMode === "PayLater";
    const ticketId = isPayLater ? `TKT-${new Date().getFullYear().toString().slice(-2)}${createUuid().replace(/-/g, "").slice(0, 8).toUpperCase()}` : undefined;
    const ticketQrValue = ticketId ? createTicketQrValue(ticketId) : undefined;
    let proofPath: string | undefined;
    let proofUrl: string | undefined;

    if (input.proofImage && !isPayLater) {
      const { blob, mime } = dataUrlToBlob(input.proofImage);
      const extension = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
      proofPath = `${paymentId}/${createUuid()}.${extension}`;
      const { error: uploadError } = await client.storage.from("hs-payment-proofs").upload(proofPath, blob, { contentType: mime, upsert: false });
      if (uploadError) throw uploadError;
      proofUrl = client.storage.from("hs-payment-proofs").getPublicUrl(proofPath).data.publicUrl;
    }

    const payer: Student = {
      id: payerId,
      name: input.studentName,
      email: input.email,
      schoolLevel: input.schoolLevel,
      yearLevel: input.yearLevel,
      strand: input.strand,
      course: input.course,
      avatar: initials(input.studentName),
    };
    const { error: payerError } = await client.from("hs-payers").insert({
      id: payerId,
      name: payer.name,
      email: payer.email,
      school_level: payer.schoolLevel,
      year_level: payer.yearLevel,
      strand: payer.strand ?? null,
      course: payer.course ?? null,
      avatar: payer.avatar,
    });
    if (payerError) throw payerError;

    const reference = createReference("PAY");
    const submittedAt = new Date().toISOString();
    const { error: paymentError } = await client.from("hs-payments").insert({
      id: paymentId,
      reference,
      payer_id: payerId,
      offering_id: offering.id,
      offering_name: offering.name,
      amount: offering.amount,
      allocations: offering.allocations,
      payment_mode: input.paymentMode,
      payment_state: isPayLater ? "Unpaid" : "AwaitingReview",
      payment_deadline_at: isPayLater ? offering.payLaterDeadlineAt : null,
      method: input.method,
      sender_account_name: input.senderAccountName ?? null,
      sender_reference: input.senderReference ?? null,
      proof_path: proofPath ?? null,
      proof_url: proofUrl ?? null,
      submitted_at: submittedAt,
      status: "Pending",
      ticket_id: ticketId ?? null,
      ticket_qr_value: ticketQrValue ?? null,
    });
    if (paymentError) throw paymentError;

    const payment: PaymentRecord = {
      ...input,
      id: paymentId,
      studentId: payerId,
      reference,
      offeringName: offering.name,
      amount: offering.amount,
      allocations: offering.allocations,
      proofImage: proofUrl,
      submittedAt,
      status: "Pending",
      paymentMode: input.paymentMode,
      paymentState: isPayLater ? "Unpaid" : "AwaitingReview",
      paymentDeadlineAt: isPayLater ? offering.payLaterDeadlineAt : undefined,
      ticketId,
      ticketQrValue,
    };
    setData((current) => ({ ...current, students: [payer, ...current.students], payments: [payment, ...current.payments] }));
    return payment;
  };

  const approvePayment = async (paymentId: string) => {
    const client = requireSupabase();
    const currentPayment = data.payments.find((payment) => payment.id === paymentId);
    if (!currentPayment) return undefined;
    if (currentPayment.status === "Approved") return currentPayment;
    const receiptNumber = currentPayment.receiptNumber ?? createReference("RCPT");
    const ticketId = currentPayment.ticketId ?? `TKT-${new Date().getFullYear().toString().slice(-2)}${createUuid().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const ticketQrValue = currentPayment.ticketQrValue ?? createTicketQrValue(ticketId);
    const { data: updatedRow, error } = await client.rpc("hs_approve_payment", {
      p_payment_id: paymentId,
      p_receipt_number: receiptNumber,
      p_ticket_id: ticketId,
      p_ticket_qr_value: ticketQrValue,
    });
    if (error) throw error;
    const row = ((Array.isArray(updatedRow) ? updatedRow[0] : updatedRow) ?? {}) as DbRow;
    const approvedPayment = {
      ...currentPayment,
      status: "Approved" as const,
      paymentState: "Paid" as const,
      paidAt: String(row.paid_at ?? row.approved_at ?? new Date().toISOString()),
      paidByName: row.paid_by_name ?? row.approved_by_name ?? undefined,
      paidByEmail: row.paid_by_email ?? row.approved_by_email ?? undefined,
      approvedAt: String(row.approved_at ?? new Date().toISOString()),
      approvedByName: row.approved_by_name ?? undefined,
      approvedByEmail: row.approved_by_email ?? undefined,
      receiptNumber: String(row.receipt_number ?? receiptNumber),
      ticketId: String(row.ticket_id ?? ticketId),
      ticketQrValue: String(row.ticket_qr_value ?? ticketQrValue),
      rejectionReason: undefined,
    };
    setData((current) => ({ ...current, payments: current.payments.map((payment) => payment.id === paymentId ? approvedPayment : payment) }));
    return approvedPayment;
  };

  const markPayLaterReceived = async (paymentId: string) => {
    const client = requireSupabase();
    const currentPayment = data.payments.find((payment) => payment.id === paymentId);
    if (!currentPayment) return undefined;
    if (currentPayment.paymentMode !== "PayLater") throw new Error("Only Pay Later payments can use this action.");
    if (currentPayment.status === "Approved" && currentPayment.paymentState === "Paid") return currentPayment;
    const receiptNumber = currentPayment.receiptNumber ?? createReference("RCPT");
    const ticketId = currentPayment.ticketId ?? `TKT-${new Date().getFullYear().toString().slice(-2)}${createUuid().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const ticketQrValue = currentPayment.ticketQrValue ?? createTicketQrValue(ticketId);
    const { data: updatedRow, error } = await client.rpc("hs_mark_pay_later_received", {
      p_payment_id: paymentId,
      p_receipt_number: receiptNumber,
      p_ticket_id: ticketId,
      p_ticket_qr_value: ticketQrValue,
    });
    if (error) throw error;
    const row = ((Array.isArray(updatedRow) ? updatedRow[0] : updatedRow) ?? {}) as DbRow;
    const paidPayment = {
      ...currentPayment,
      status: "Approved" as const,
      paymentState: "Paid" as const,
      paidAt: String(row.paid_at ?? new Date().toISOString()),
      paidByName: row.paid_by_name ?? undefined,
      paidByEmail: row.paid_by_email ?? undefined,
      approvedAt: String(row.approved_at ?? new Date().toISOString()),
      approvedByName: row.approved_by_name ?? undefined,
      approvedByEmail: row.approved_by_email ?? undefined,
      receiptNumber: String(row.receipt_number ?? receiptNumber),
      ticketId: String(row.ticket_id ?? ticketId),
      ticketQrValue: String(row.ticket_qr_value ?? ticketQrValue),
      rejectionReason: undefined,
    };
    setData((current) => ({ ...current, payments: current.payments.map((payment) => payment.id === paymentId ? paidPayment : payment) }));
    return paidPayment;
  };

  const rejectPayment = async (paymentId: string, reason: string) => {
    const client = requireSupabase();
    const currentPayment = data.payments.find((payment) => payment.id === paymentId);
    if (!currentPayment || currentPayment.status === "Approved") return currentPayment;
    const { data: updatedRow, error } = await client.rpc("hs_reject_payment", { p_payment_id: paymentId, p_reason: reason });
    if (error) throw error;
    const row = ((Array.isArray(updatedRow) ? updatedRow[0] : updatedRow) ?? {}) as DbRow;
    const wasApproved = row.status === "Approved";
    const rejectedPayment = {
      ...currentPayment,
      status: wasApproved ? "Approved" as const : "Rejected" as const,
      paymentState: wasApproved ? "Paid" as const : currentPayment.paymentMode === "PayLater" ? "Unpaid" as const : "Rejected" as const,
      rejectionReason: wasApproved ? row.rejection_reason ?? currentPayment.rejectionReason : String(row.rejection_reason ?? reason),
      approvedAt: wasApproved ? row.approved_at ?? currentPayment.approvedAt : undefined,
      approvedByName: wasApproved ? row.approved_by_name ?? currentPayment.approvedByName : undefined,
      approvedByEmail: wasApproved ? row.approved_by_email ?? currentPayment.approvedByEmail : undefined,
      receiptNumber: wasApproved ? row.receipt_number ?? currentPayment.receiptNumber : undefined,
      ticketId: wasApproved ? row.ticket_id ?? currentPayment.ticketId : undefined,
      ticketQrValue: wasApproved ? row.ticket_qr_value ?? currentPayment.ticketQrValue : undefined,
    };
    setData((current) => ({ ...current, payments: current.payments.map((payment) => payment.id === paymentId ? rejectedPayment : payment) }));
    return rejectedPayment;
  };

  const updateEmailState = async (paymentId: string, values: Record<string, unknown>) => {
    const client = requireSupabase();
    const { error } = await client.from("hs-payments").update(values).eq("id", paymentId);
    if (error) throw error;
    let updated: PaymentRecord | undefined;
    setData((current) => ({
      ...current,
      payments: current.payments.map((payment) => {
        if (payment.id !== paymentId) return payment;
        updated = { ...payment, emailDeliveryStatus: values.email_delivery_status as PaymentRecord["emailDeliveryStatus"] ?? payment.emailDeliveryStatus, emailSentAt: values.email_sent_at as string | undefined ?? payment.emailSentAt, emailId: values.email_id as string | undefined ?? payment.emailId, emailDeliveryError: values.email_delivery_error as string | undefined };
        return updated;
      }),
    }));
    return updated;
  };

  const sendApprovalEmail = async (payment: PaymentRecord) => {
    if (payment.status !== "Approved") return undefined;
    await updateEmailState(payment.id, { email_delivery_status: "Sending", email_delivery_error: null });
    try {
      const response = await deliverApprovalEmail(payment);
      const sentAt = new Date().toISOString();
      const sent = await updateEmailState(payment.id, { email_delivery_status: "Sent", email_sent_at: sentAt, email_id: response.emailId ?? null, email_delivery_error: null });
      return sent ?? { ...payment, emailDeliveryStatus: "Sent" as const, emailSentAt: sentAt, emailId: response.emailId ?? undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : "The approval email could not be sent.";
      await updateEmailState(payment.id, { email_delivery_status: "Failed", email_delivery_error: message });
      throw error;
    }
  };

  const sendPayLaterEmail = async (payment: PaymentRecord) => {
    if (payment.paymentMode !== "PayLater") return undefined;
    // Public submissions cannot update the admin-only email audit fields, so delivery must not be blocked by that optional write.
    try {
      await updateEmailState(payment.id, { email_delivery_status: "Sending", email_delivery_error: null });
    } catch {
      // Continue with the email request for anonymous Pay Later submissions.
    }
    try {
      const response = await deliverPayLaterEmail(payment);
      const sentAt = new Date().toISOString();
      try {
        const sent = await updateEmailState(payment.id, { email_delivery_status: "Sent", email_sent_at: sentAt, email_id: response.emailId ?? null, email_delivery_error: null });
        return sent ?? { ...payment, emailDeliveryStatus: "Sent" as const, emailSentAt: sentAt, emailId: response.emailId ?? undefined };
      } catch {
        return { ...payment, emailDeliveryStatus: "Sent" as const, emailSentAt: sentAt, emailId: response.emailId ?? undefined };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The Pay Later email could not be sent.";
      try {
        await updateEmailState(payment.id, { email_delivery_status: "Failed", email_delivery_error: message });
      } catch {
        // The delivery error is still surfaced to the student even if the audit write is unavailable.
      }
      throw error;
    }
  };

  const checkInTicket = async (value: string): Promise<TicketCheckInResult> => {
    const client = requireSupabase();
    const scannedValue = value.trim();
    const payment = data.payments.find((item) => item.ticketId && (scannedValue === item.ticketId || scannedValue === item.ticketQrValue));
    if (!payment) return { ok: false, kind: "invalid", message: "This QR code does not match an active JPCS ticket or Pay Later reservation." };
    const paymentPending = payment.paymentMode === "PayLater" && payment.paymentState === "Unpaid" && payment.status === "Pending";
    if (payment.status !== "Approved" && !paymentPending) return { ok: false, kind: "invalid", message: "This QR code is not active yet. An admin must approve the payment or reservation first." };
    if (payment.attendedAt) return { ok: false, kind: "already-checked-in", payment, paymentPending };
    const attendedAt = new Date().toISOString();
    const { data: updated, error } = await client.from("hs-payments").update({ attended_at: attendedAt }).eq("id", payment.id).is("attended_at", null).select("attended_at").maybeSingle();
    if (error) throw error;
    if (!updated) {
      const { data: existing } = await client.from("hs-payments").select("attended_at").eq("id", payment.id).single();
      return { ok: false, kind: "already-checked-in", payment: { ...payment, attendedAt: existing?.attended_at ?? attendedAt }, paymentPending };
    }
    const checkedInPayment = { ...payment, attendedAt };
    setData((current) => ({ ...current, payments: current.payments.map((item) => item.id === payment.id ? checkedInPayment : item) }));
    return { ok: true, kind: "checked-in", payment: checkedInPayment, paymentPending };
  };

  const undoAttendance = async (paymentId: string) => {
    const client = requireSupabase();
    const currentPayment = data.payments.find((payment) => payment.id === paymentId);
    if (!currentPayment) return undefined;
    const { error } = await client.from("hs-payments").update({ attended_at: null }).eq("id", paymentId).not("attended_at", "is", null);
    if (error) throw error;
    const updatedPayment = { ...currentPayment, attendedAt: undefined };
    setData((current) => ({ ...current, payments: current.payments.map((payment) => payment.id === paymentId ? updatedPayment : payment) }));
    return updatedPayment;
  };

  const setOfferingArchived = async (offeringId: string, archivedAt: string | null) => {
    const client = requireSupabase();
    const { error } = await client.from("hs-offerings").update({ archived_at: archivedAt }).eq("id", offeringId);
    if (error) throw error;
    setData((current) => ({ ...current, offerings: current.offerings.map((offering) => offering.id === offeringId ? { ...offering, archivedAt: archivedAt ?? undefined } : offering) }));
  };

  const archiveOffering = async (offeringId: string) => setOfferingArchived(offeringId, new Date().toISOString());
  const restoreOffering = async (offeringId: string) => setOfferingArchived(offeringId, null);

  const setPayerArchived = async (payerId: string, archivedAt: string | null) => {
    const client = requireSupabase();
    const { error } = await client.from("hs-payers").update({ archived_at: archivedAt }).eq("id", payerId);
    if (error) throw error;
    setData((current) => ({ ...current, students: current.students.map((student) => student.id === payerId ? { ...student, archivedAt: archivedAt ?? undefined } : student) }));
  };

  const archivePayer = async (payerId: string) => setPayerArchived(payerId, new Date().toISOString());
  const restorePayer = async (payerId: string) => setPayerArchived(payerId, null);

  const deletePayerPermanently = async (payerId: string) => {
    const client = requireSupabase();
    const proofPaths = data.payments
      .filter((payment) => payment.studentId === payerId && payment.proofPath)
      .map((payment) => payment.proofPath as string);
    for (let offset = 0; offset < proofPaths.length; offset += 1000) {
      const { error: proofError } = await client.storage.from("hs-payment-proofs").remove(proofPaths.slice(offset, offset + 1000));
      if (proofError) throw proofError;
    }
    const { error } = await client.rpc("hs_delete_payer_permanently", { p_payer_id: payerId });
    if (error) {
      const { error: retryError } = await client.rpc("hs_delete_payer_permanently", { p_payer_id: payerId });
      if (retryError) throw error;
    }
    setData((current) => ({
      ...current,
      students: current.students.filter((student) => student.id !== payerId),
      payments: current.payments.filter((payment) => payment.studentId !== payerId),
    }));
  };

  const createOffering = async (input: NewPaymentOfferingInput) => {
    const client = requireSupabase();
    const { data: row, error } = await client.from("hs-offerings").insert({
      slug: input.slug.trim().toLowerCase(),
      name: input.name.trim(),
      description: input.description.trim(),
      amount: input.amount,
      active: input.active,
      available_methods: input.availableMethods,
      applicable_school_levels: input.applicableSchoolLevels,
      allocations: input.allocations,
      pay_later_methods: input.payLaterMethods,
      pay_later_deadline_at: input.payLaterDeadlineAt ?? null,
    }).select("*").single();
    if (error) throw error;
    const offering = mapOffering(row);
    setData((current) => ({ ...current, offerings: [...current.offerings, offering] }));
    return offering;
  };

  const saveOffering = async (offering: PaymentOffering) => {
    const client = requireSupabase();
    const { error } = await client.from("hs-offerings").update({
      slug: offering.slug.trim().toLowerCase(),
      name: offering.name.trim(),
      description: offering.description.trim(),
      amount: offering.amount,
      active: offering.active,
      available_methods: offering.availableMethods,
      applicable_school_levels: offering.applicableSchoolLevels,
      allocations: offering.allocations,
      pay_later_methods: offering.payLaterMethods,
      pay_later_deadline_at: offering.payLaterDeadlineAt ?? null,
    }).eq("id", offering.id);
    if (error) throw error;
    setData((current) => ({ ...current, offerings: current.offerings.map((item) => item.id === offering.id ? offering : item) }));
  };

  const savePaymentMethod = async (method: PaymentMethodConfig) => {
    const client = requireSupabase();
    const { error } = await client.from("hs-payment-methods").update({
      enabled: method.enabled,
      account_name: method.accountName.trim(),
      account_number: method.accountNumber.trim(),
      instructions: method.instructions.trim(),
      qr_image: method.qrImage ?? null,
    }).eq("id", method.id);
    if (error) throw error;
    setData((current) => ({ ...current, paymentMethods: current.paymentMethods.map((item) => item.id === method.id ? method : item) }));
  };

  const resetDemo = () => {
    if (session?.role === "admin") void loadData(true);
    else void loadData(false);
  };

  return (
    <AppContext.Provider value={{ data, session, authLoading, dataLoading, dataError, login, logout, retryData, signInAdmin, submitPayment, approvePayment, markPayLaterReceived, rejectPayment, sendApprovalEmail, sendPayLaterEmail, checkInTicket, undoAttendance, createOffering, saveOffering, archiveOffering, restoreOffering, archivePayer, restorePayer, deletePayerPermanently, savePaymentMethod, resetDemo }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
};
