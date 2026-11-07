import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cloneInitialData } from "../data/seed";
import { createTicketQrValue } from "../lib/branding";
import { EmailDeliveryError, sendApprovalEmail as deliverApprovalEmail, sendPayLaterEmail as deliverPayLaterEmail } from "../lib/email";
import { initials, createReference } from "../lib/utils";
import { getPaymentAttendees, getPaymentPayerIds } from "../lib/payment";
import { requireSupabase, supabase } from "../lib/supabase";
import type {
  AppData,
  PaymentAttendee,
  NewPaymentInput,
  NewPaymentOfferingInput,
  PaymentAllocation,
  PaymentMethodConfig,
  PaymentOfferingImageUpdate,
  PaymentOffering,
  PaymentRecord,
  PaymentSiteKey,
  PublicSiteSettings,
  SchoolLevel,
  Session,
  Student,
  TicketCheckInResult,
} from "../types";

export type AdminSiteFilter = "all" | PaymentSiteKey;

interface AppContextValue {
  data: AppData;
  session: Session | null;
  authLoading: boolean;
  dataLoading: boolean;
  dataError: string | null;
  adminSiteFilter: AdminSiteFilter;
  login: (session: Session) => void;
  logout: () => void;
  retryData: () => Promise<void>;
  setAdminSiteFilter: (filter: AdminSiteFilter) => Promise<void>;
  signInAdmin: (email: string, password: string) => Promise<void>;
  submitPayment: (input: NewPaymentInput) => Promise<PaymentRecord>;
  approvePayment: (paymentId: string) => Promise<PaymentRecord | undefined>;
  rejectPayment: (paymentId: string, reason: string) => Promise<PaymentRecord | undefined>;
  sendApprovalEmail: (payment: PaymentRecord) => Promise<PaymentRecord | undefined>;
  sendPayLaterEmail: (payment: PaymentRecord) => Promise<PaymentRecord | undefined>;
  markPayLaterReceived: (paymentId: string) => Promise<PaymentRecord | undefined>;
  checkInTicket: (value: string) => Promise<TicketCheckInResult>;
  undoAttendance: (paymentId: string, attendeeId?: string) => Promise<PaymentRecord | undefined>;
  createOffering: (input: NewPaymentOfferingInput, image?: PaymentOfferingImageUpdate) => Promise<PaymentOffering>;
  saveOffering: (offering: PaymentOffering, image?: PaymentOfferingImageUpdate) => Promise<void>;
  moveOfferingToRecentlyDeleted: (offeringId: string) => Promise<void>;
  restoreOffering: (offeringId: string) => Promise<void>;
  deleteOfferingPermanently: (offeringId: string) => Promise<void>;
  movePayerToRecentlyDeleted: (payerId: string) => Promise<void>;
  restorePayer: (payerId: string) => Promise<void>;
  deletePayerPermanently: (payerId: string) => Promise<void>;
  savePaymentMethod: (method: PaymentMethodConfig) => Promise<void>;
  savePublicSiteSettings: (settings: PublicSiteSettings) => Promise<void>;
  resetDemo: () => void;
}

type DbRow = Record<string, any>;

const AppContext = createContext<AppContextValue | undefined>(undefined);

const createUuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const schoolLevels: SchoolLevel[] = ["Junior High School", "Senior High School", "College"];
const offeringImageBucket = "hs-offering-images";
const paymentProofBucket = "hs-payment-proofs";
const maxOfferingImageBytes = 5 * 1024 * 1024;
const offeringImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const getPublicSiteKey = (): PaymentSiteKey => typeof window !== "undefined" && window.location.pathname.startsWith("/test-payment") ? "test-payment" : "public-payment";
const defaultPublicSiteMessage = "The payment portal is temporarily closed while we update it. Please check back soon.";

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
    generateQr: row.generate_qr !== false,
    allowMultipleNames: Boolean(row.allow_multiple_names),
    maxNames: Math.max(1, Number(row.max_names) || 1),
    availableMethods: Array.isArray(row.available_methods) ? row.available_methods : ["Cash", "GCash", "MariBank"],
    applicableSchoolLevels: configuredLevels.length ? configuredLevels : schoolLevels,
    allocations: toAllocations(row.allocations ?? row.revenue_split, amount),
    payLaterMethods: Array.isArray(row.pay_later_methods) ? row.pay_later_methods : [],
    payLaterDeadlineAt: row.pay_later_deadline_at ?? undefined,
    imagePath: typeof row.image_path === "string" ? row.image_path : undefined,
    imageUrl: typeof row.image_url === "string" ? row.image_url : undefined,
    deletedAt: row.archived_at ?? undefined,
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

const mapSiteSettings = (row?: DbRow | null, fallbackSiteKey: PaymentSiteKey = "public-payment"): PublicSiteSettings => ({
  siteKey: row?.site_key === "test-payment" ? "test-payment" : fallbackSiteKey,
  isOpen: row ? Boolean(row.is_open) : false,
  message: String(row?.public_message ?? defaultPublicSiteMessage),
  allowMultipleNames: Boolean(row?.allow_multiple_names),
  maxNames: Math.min(20, Math.max(1, Number(row?.max_names) || 10)),
  visibleSchoolLevels: Array.isArray(row?.visible_school_levels)
    ? schoolLevels.filter((level) => row.visible_school_levels.includes(level))
    : schoolLevels,
});

const mapPayer = (row: DbRow): Student => ({
  id: String(row.id),
  siteKey: row.site_key === "test-payment" ? "test-payment" : "public-payment",
  name: String(row.name ?? ""),
  email: String(row.email ?? ""),
  schoolLevel: row.school_level,
  yearLevel: String(row.year_level ?? ""),
  section: row.section ?? undefined,
  strand: row.strand ?? undefined,
  course: row.course ?? undefined,
  avatar: String(row.avatar ?? initials(String(row.name ?? ""))),
  deletedAt: row.archived_at ?? undefined,
});

const mapAttendee = (row: DbRow): PaymentAttendee => ({
  id: String(row.id),
  name: String(row.name ?? ""),
  position: Math.max(1, Number(row.position) || 1),
  payerId: row.payer_id ?? undefined,
  ticketId: row.ticket_id ?? undefined,
  ticketQrValue: row.ticket_qr_value ?? undefined,
  attendedAt: row.attended_at ?? undefined,
});

const mapPayment = (row: DbRow, payers: Map<string, Student>, offerings: Map<string, PaymentOffering>, attendeeRows = new Map<string, PaymentAttendee[]>(), inlineAttendees?: PaymentAttendee[]): PaymentRecord => {
  const payer = payers.get(String(row.payer_id));
  const offering = offerings.get(String(row.offering_id));
  const amount = Number(row.amount) || offering?.amount || 0;
  const attendees = inlineAttendees?.length
    ? inlineAttendees
    : attendeeRows.get(String(row.id)) ?? [];
  const firstAttendee = attendees[0];
  const attendeeCount = Math.max(1, Number(row.attendee_count) || attendees.length || 1);
  return {
    id: String(row.id),
    siteKey: row.site_key === "test-payment" ? "test-payment" : payer?.siteKey ?? "public-payment",
    reference: String(row.reference),
    studentId: String(row.payer_id),
    studentName: firstAttendee?.name ?? payer?.name ?? String(row.student_name ?? ""),
    email: payer?.email ?? String(row.payer_email ?? row.email ?? ""),
    schoolLevel: payer?.schoolLevel ?? row.school_level,
    yearLevel: payer?.yearLevel ?? String(row.year_level ?? ""),
    section: payer?.section ?? row.section ?? undefined,
    strand: payer?.strand ?? row.strand ?? undefined,
    course: payer?.course ?? row.course ?? undefined,
    offeringId: String(row.offering_id),
    offeringName: String(row.offering_name ?? offering?.name ?? "Film Showing"),
    amount,
    generateQr: row.generate_qr !== false,
    attendeeCount,
    attendees,
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
    ticketId: row.ticket_id ?? firstAttendee?.ticketId ?? undefined,
    ticketQrValue: row.ticket_qr_value ?? firstAttendee?.ticketQrValue ?? undefined,
    emailDeliveryStatus: row.email_delivery_status ?? undefined,
    emailSentAt: row.email_sent_at ?? undefined,
    emailId: row.email_id ?? undefined,
    emailDeliveryError: row.email_delivery_error ?? undefined,
    attendedAt: row.attended_at ?? firstAttendee?.attendedAt ?? undefined,
  };
};

const fetchPaymentAttendees = async (client: ReturnType<typeof requireSupabase>, paymentId: string) => {
  const { data, error } = await client.from("hs-payment-attendees").select("*").eq("payment_id", paymentId).order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapAttendee);
};

const fetchPaymentRowsForPayer = async (client: ReturnType<typeof requireSupabase>, payerId: string) => {
  const [primaryResponse, attendeeResponse] = await Promise.all([
    client.from("hs-payments").select("id,proof_path").eq("payer_id", payerId),
    client.from("hs-payment-attendees").select("payment_id").eq("payer_id", payerId),
  ]);
  if (primaryResponse.error) throw primaryResponse.error;
  if (attendeeResponse.error) throw attendeeResponse.error;
  const paymentIds = Array.from(new Set([
    ...(primaryResponse.data ?? []).map((row) => String(row.id)),
    ...(attendeeResponse.data ?? []).map((row) => String(row.payment_id)),
  ]));
  if (!paymentIds.length) return [];
  const { data, error } = await client.from("hs-payments").select("id,proof_path").in("id", paymentIds);
  if (error) throw error;
  return data ?? [];
};

const fetchPaymentRowsForOffering = async (client: ReturnType<typeof requireSupabase>, offeringId: string) => {
  const { data, error } = await client.from("hs-payments").select("id,proof_path").eq("offering_id", offeringId);
  if (error) throw error;
  return data ?? [];
};

const dataUrlToBlob = (value: string, label = "image") => {
  const [header, body] = value.split(",", 2);
  if (!header || !body) throw new Error(`The ${label} could not be read.`);
  const mime = header.match(/data:([^;]+);base64/i)?.[1] ?? "image/jpeg";
  const binary = window.atob(body);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return { blob: new Blob([bytes], { type: mime }), mime };
};

const uploadOfferingImage = async (client: ReturnType<typeof requireSupabase>, offeringId: string, dataUrl: string) => {
  const { blob, mime } = dataUrlToBlob(dataUrl, "card image");
  if (!offeringImageTypes.has(mime) || blob.size > maxOfferingImageBytes) {
    throw new Error("Choose a PNG, JPG, or WEBP image smaller than 5 MB.");
  }
  const extension = mime === "image/jpeg" ? "jpg" : mime.split("/")[1];
  const path = `${offeringId}/${createUuid()}.${extension}`;
  const { error } = await client.storage.from(offeringImageBucket).upload(path, blob, { contentType: mime, upsert: false });
  if (error) throw error;
  return { path, url: client.storage.from(offeringImageBucket).getPublicUrl(path).data.publicUrl };
};

const removeOfferingImage = async (client: ReturnType<typeof requireSupabase>, path: string) => {
  const { error } = await client.storage.from(offeringImageBucket).remove([path]);
  if (error) throw error;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => cloneInitialData());
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(Boolean(supabase));
  const [dataError, setDataError] = useState<string | null>(null);
  const [adminSiteFilter, setAdminSiteFilterState] = useState<AdminSiteFilter>("public-payment");

  const loadData = async (admin = false, requestedSiteFilter: AdminSiteFilter = adminSiteFilter) => {
    setDataLoading(true);
    setDataError(null);
    try {
      const client = requireSupabase();
      const offeringsQuery = client.from("hs-offerings").select("*").order("created_at", { ascending: true });
      const methodsQuery = client.from("hs-payment-methods").select("*").order("id", { ascending: true });
      const siteKey = admin ? "public-payment" : getPublicSiteKey();
      const siteSettingsQuery = client.from("hs-site-settings").select("*").eq("site_key", siteKey).maybeSingle();
      const sectionsQuery = client.from("hs-sections").select("section").order("section", { ascending: true });
      if (!admin) {
        offeringsQuery.eq("active", true).is("archived_at", null);
        methodsQuery.eq("enabled", true);
      }
      const [offeringsResponse, methodsResponse, siteSettingsResponse] = await Promise.all([
        offeringsQuery,
        methodsQuery,
        siteSettingsQuery,
      ]);
      if (offeringsResponse.error) throw offeringsResponse.error;
      if (methodsResponse.error) throw methodsResponse.error;
      if (siteSettingsResponse.error) throw siteSettingsResponse.error;
      const sectionsResponse = await sectionsQuery;
      if (sectionsResponse.error) throw sectionsResponse.error;

      const offerings = (offeringsResponse.data ?? []).map(mapOffering);
      const paymentMethods = (methodsResponse.data ?? []).map(mapMethod);
      const sections = Array.from(new Set((sectionsResponse.data ?? []).map((row) => String(row.section ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
      const siteSettings = mapSiteSettings(siteSettingsResponse.data, siteKey);
      if (!admin) {
        setData((current) => ({ ...current, sections, offerings, paymentMethods, siteSettings }));
        return;
      }

      const [payersResponse, paymentsResponse, attendeesResponse] = await Promise.all([
        (requestedSiteFilter === "all" ? client.from("hs-payers").select("*") : client.from("hs-payers").select("*").eq("site_key", requestedSiteFilter)).order("created_at", { ascending: false }),
        (requestedSiteFilter === "all" ? client.from("hs-payments").select("*") : client.from("hs-payments").select("*").eq("site_key", requestedSiteFilter)).order("submitted_at", { ascending: false }),
        client.from("hs-payment-attendees").select("*").order("position", { ascending: true }),
      ]);
      if (payersResponse.error) throw payersResponse.error;
      if (paymentsResponse.error) throw paymentsResponse.error;
      if (attendeesResponse.error) throw attendeesResponse.error;
      const students = (payersResponse.data ?? []).map(mapPayer);
      const payers = new Map(students.map((payer) => [payer.id, payer]));
      const offeringMap = new Map(offerings.map((offering) => [offering.id, offering]));
      const attendeeMap = new Map<string, PaymentAttendee[]>();
      (attendeesResponse.data ?? []).forEach((row) => {
        const paymentId = String(row.payment_id);
        const list = attendeeMap.get(paymentId) ?? [];
        list.push(mapAttendee(row));
        attendeeMap.set(paymentId, list);
      });
      const paymentRows = paymentsResponse.data ?? [];
      const proofPaths = [...new Set(paymentRows.map((payment) => typeof payment.proof_path === "string" ? payment.proof_path : "").filter(Boolean))];
      const proofUrls = new Map<string, string>();
      if (proofPaths.length) {
        const signedResponse = await client.storage.from(paymentProofBucket).createSignedUrls(proofPaths, 86400);
        if (signedResponse.error) throw signedResponse.error;
        signedResponse.data?.forEach((item, index) => {
          if (item.signedUrl) proofUrls.set(proofPaths[index], item.signedUrl);
        });
      }
      const payments = paymentRows
        .map((payment) => mapPayment({ ...payment, proof_url: proofUrls.get(String(payment.proof_path ?? "")) }, payers, offeringMap, attendeeMap))
        .filter((payment) => {
          const offering = offeringMap.get(payment.offeringId);
          if (offering?.deletedAt) return false;
          return !getPaymentPayerIds(payment).some((payerId) => payers.get(payerId)?.deletedAt);
        });
       setData({ students, sections, offerings, paymentMethods, siteSettings, payments, developers: [] });
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
      await loadData(session?.role === "admin", adminSiteFilter);
    } catch {
      // The load error is exposed through dataError for the retry UI.
    }
  };

  const setAdminSiteFilter = async (filter: AdminSiteFilter) => {
    setAdminSiteFilterState(filter);
    if (session?.role !== "admin") return;
    try {
      await loadData(true, filter);
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
    if (!data.siteSettings.isOpen) throw new Error(data.siteSettings.message);
    if (!data.siteSettings.visibleSchoolLevels.includes(input.schoolLevel)) throw new Error("That school level is not currently available.");
    const offering = data.offerings.find((item) => item.id === input.offeringId && item.active && !item.deletedAt);
    if (!offering) throw new Error("The Film Showing payment type is not available.");
    if (!offering.applicableSchoolLevels.includes(input.schoolLevel)) throw new Error("That payment type is not available for the selected school level.");
    if (!offering.availableMethods.includes(input.method)) throw new Error("That payment method is not available.");
    if (input.paymentMode === "PayLater") {
      if (!offering.payLaterMethods.includes(input.method)) throw new Error("Pay Later is not enabled for this payment method.");
      if (!offering.payLaterDeadlineAt || new Date(offering.payLaterDeadlineAt).getTime() <= Date.now()) throw new Error("The Pay Later deadline has passed or is not configured.");
    }
    const attendeeNames = (input.attendeeNames?.length ? input.attendeeNames : [input.studentName])
      .map((name) => name.trim())
      .filter(Boolean);
    const section = input.section.trim();
    if (!section || section.length > 80) throw new Error("Enter a valid section.");
    const maxNames = data.siteSettings.allowMultipleNames ? data.siteSettings.maxNames : 1;
    if (!attendeeNames.length || attendeeNames.length > maxNames) {
      throw new Error(`Add between 1 and ${maxNames} attendee name${maxNames === 1 ? "" : "s"}.`);
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);
    let response: Response;
    try {
      response = await fetch("/api/submit-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ payment: {
             idempotencyKey: input.idempotencyKey,
             siteKey: data.siteSettings.siteKey,
             studentName: attendeeNames[0],
             attendeeNames,
             email: input.email,
             schoolLevel: input.schoolLevel,
             yearLevel: input.yearLevel,
             section,
             strand: input.strand,
            course: input.course,
            offeringId: offering.id,
            method: input.method,
            paymentMode: input.paymentMode,
            proofImage: input.proofImage,
          } }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw new Error("The secure payment submission service timed out.");
      throw new Error("The secure payment submission service is unavailable.");
    } finally {
      window.clearTimeout(timeoutId);
    }
    let body: { error?: string; payment?: DbRow } = {};
    try { body = await response.json() as typeof body; } catch { body = {}; }
    if (!response.ok) throw new Error(body.error ?? "The payment could not be submitted.");
    const row = body.payment ?? {};
    if (!row.id) throw new Error("The payment was not returned by the secure submission service.");
    const payer: Student = {
      id: String(row.payer_id),
      siteKey: data.siteSettings.siteKey,
      name: attendeeNames[0],
      email: input.email.trim(),
      schoolLevel: input.schoolLevel,
      yearLevel: input.yearLevel,
      section,
      strand: input.strand,
      course: input.course,
      avatar: initials(attendeeNames[0]),
    };
    const inlineAttendees = Array.isArray(row.attendees) ? row.attendees.map((attendee: DbRow) => mapAttendee(attendee)) : undefined;
    const attendeePayers = new Map<string, Student>([[payer.id, payer]]);
    inlineAttendees?.forEach((attendee, index) => {
      const payerId = attendee.payerId ?? (index === 0 ? payer.id : undefined);
      if (!payerId) return;
      attendeePayers.set(payerId, {
        id: payerId,
        siteKey: data.siteSettings.siteKey,
        name: attendee.name,
        email: input.email.trim(),
        schoolLevel: input.schoolLevel,
        yearLevel: input.yearLevel,
        section,
        strand: input.strand,
        course: input.course,
        avatar: initials(attendee.name),
      });
    });
    const payment = mapPayment(row, attendeePayers, new Map([[offering.id, offering]]), undefined, inlineAttendees);
    setData((current) => ({
      ...current,
      sections: current.sections.includes(section) ? current.sections : [...current.sections, section].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })),
      students: [...attendeePayers.values(), ...current.students.filter((student) => !attendeePayers.has(student.id))],
      payments: [payment, ...current.payments.filter((item) => item.id !== payment.id)],
    }));
    return payment;
  };

  const approvePayment = async (paymentId: string) => {
    const client = requireSupabase();
    const currentPayment = data.payments.find((payment) => payment.id === paymentId);
    if (!currentPayment) return undefined;
    if (currentPayment.status === "Approved") return currentPayment;
    const receiptNumber = currentPayment.receiptNumber ?? createReference("RCPT");
    const ticketId = currentPayment.ticketId ?? (currentPayment.generateQr ? `TKT-${new Date().getFullYear().toString().slice(-2)}${createUuid().replace(/-/g, "").slice(0, 8).toUpperCase()}` : "");
    const ticketQrValue = currentPayment.ticketQrValue ?? (currentPayment.generateQr ? createTicketQrValue(ticketId) : "");
    const { data: updatedRow, error } = await client.rpc("hs_approve_payment", {
      p_payment_id: paymentId,
      p_receipt_number: receiptNumber,
      p_ticket_id: ticketId,
      p_ticket_qr_value: ticketQrValue,
    });
    if (error) throw error;
    const row = ((Array.isArray(updatedRow) ? updatedRow[0] : updatedRow) ?? {}) as DbRow;
    const attendees = await fetchPaymentAttendees(client, paymentId);
    const firstAttendee = attendees[0];
    const approvedPayment = {
      ...currentPayment,
      attendeeCount: attendees.length || currentPayment.attendeeCount,
      attendees,
      status: "Approved" as const,
      paymentState: "Paid" as const,
      paidAt: String(row.paid_at ?? row.approved_at ?? new Date().toISOString()),
      paidByName: row.paid_by_name ?? row.approved_by_name ?? undefined,
      paidByEmail: row.paid_by_email ?? row.approved_by_email ?? undefined,
      approvedAt: String(row.approved_at ?? new Date().toISOString()),
      approvedByName: row.approved_by_name ?? undefined,
      approvedByEmail: row.approved_by_email ?? undefined,
      receiptNumber: String(row.receipt_number ?? receiptNumber),
      ticketId: row.ticket_id ?? firstAttendee?.ticketId ?? (currentPayment.generateQr ? ticketId : undefined),
      ticketQrValue: row.ticket_qr_value ?? firstAttendee?.ticketQrValue ?? (currentPayment.generateQr ? ticketQrValue : undefined),
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
    const ticketId = currentPayment.ticketId ?? (currentPayment.generateQr ? `TKT-${new Date().getFullYear().toString().slice(-2)}${createUuid().replace(/-/g, "").slice(0, 8).toUpperCase()}` : "");
    const ticketQrValue = currentPayment.ticketQrValue ?? (currentPayment.generateQr ? createTicketQrValue(ticketId) : "");
    const { data: updatedRow, error } = await client.rpc("hs_mark_pay_later_received", {
      p_payment_id: paymentId,
      p_receipt_number: receiptNumber,
      p_ticket_id: ticketId,
      p_ticket_qr_value: ticketQrValue,
    });
    if (error) throw error;
    const row = ((Array.isArray(updatedRow) ? updatedRow[0] : updatedRow) ?? {}) as DbRow;
    const attendees = await fetchPaymentAttendees(client, paymentId);
    const firstAttendee = attendees[0];
    const paidPayment = {
      ...currentPayment,
      attendeeCount: attendees.length || currentPayment.attendeeCount,
      attendees,
      status: "Approved" as const,
      paymentState: "Paid" as const,
      paidAt: String(row.paid_at ?? new Date().toISOString()),
      paidByName: row.paid_by_name ?? undefined,
      paidByEmail: row.paid_by_email ?? undefined,
      approvedAt: String(row.approved_at ?? new Date().toISOString()),
      approvedByName: row.approved_by_name ?? undefined,
      approvedByEmail: row.approved_by_email ?? undefined,
      receiptNumber: String(row.receipt_number ?? receiptNumber),
      ticketId: row.ticket_id ?? firstAttendee?.ticketId ?? (currentPayment.generateQr ? ticketId : undefined),
      ticketQrValue: row.ticket_qr_value ?? firstAttendee?.ticketQrValue ?? (currentPayment.generateQr ? ticketQrValue : undefined),
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
    const attendees = await fetchPaymentAttendees(client, paymentId);
    const rejectedPayment = {
      ...currentPayment,
      attendeeCount: attendees.length || currentPayment.attendeeCount,
      attendees,
      status: wasApproved ? "Approved" as const : "Rejected" as const,
      paymentState: wasApproved ? "Paid" as const : currentPayment.paymentMode === "PayLater" ? "Unpaid" as const : "Rejected" as const,
      rejectionReason: wasApproved ? row.rejection_reason ?? currentPayment.rejectionReason : String(row.rejection_reason ?? reason),
      approvedAt: wasApproved ? row.approved_at ?? currentPayment.approvedAt : undefined,
      approvedByName: wasApproved ? row.approved_by_name ?? currentPayment.approvedByName : undefined,
      approvedByEmail: wasApproved ? row.approved_by_email ?? currentPayment.approvedByEmail : undefined,
      receiptNumber: wasApproved ? row.receipt_number ?? currentPayment.receiptNumber : undefined,
      ticketId: wasApproved ? row.ticket_id ?? attendees[0]?.ticketId ?? currentPayment.ticketId : undefined,
      ticketQrValue: wasApproved ? row.ticket_qr_value ?? attendees[0]?.ticketQrValue ?? currentPayment.ticketQrValue : undefined,
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

  const markEmailDeliveryFailed = async (paymentId: string, message: string) => {
    const client = requireSupabase();
    const { error } = await client.from("hs-payments").update({ email_delivery_status: "Failed", email_delivery_error: message }).eq("id", paymentId).eq("email_delivery_status", "Sending");
    if (error) throw error;
  };

  const sendApprovalEmail = async (payment: PaymentRecord) => {
    if (payment.status !== "Approved") return undefined;
    if (payment.emailDeliveryStatus === "Sent") return payment;
    try {
      const response = await deliverApprovalEmail(payment);
      const sentAt = response.emailSentAt ?? new Date().toISOString();
      try {
        const sent = await updateEmailState(payment.id, { email_delivery_status: "Sent", email_sent_at: sentAt, email_id: response.emailId ?? null, email_delivery_error: null });
        return sent ?? { ...payment, emailDeliveryStatus: "Sent" as const, emailSentAt: sentAt, emailId: response.emailId ?? undefined };
      } catch {
        return { ...payment, emailDeliveryStatus: "Sent" as const, emailSentAt: sentAt, emailId: response.emailId ?? undefined };
      }
    } catch (error) {
      if (error instanceof EmailDeliveryError && error.status === 409 && error.message.includes("already been sent")) {
        try {
          const sent = await updateEmailState(payment.id, { email_delivery_status: "Sent", email_delivery_error: null });
          return sent ?? { ...payment, emailDeliveryStatus: "Sent" as const };
        } catch {
          return { ...payment, emailDeliveryStatus: "Sent" as const };
        }
      }
      const message = error instanceof Error ? error.message : "The approval email could not be sent.";
      try {
        await markEmailDeliveryFailed(payment.id, message);
      } catch {
        // The server owns delivery state; do not overwrite a possible successful send from a lost response.
      }
      throw error;
    }
  };

  const sendPayLaterEmail = async (payment: PaymentRecord) => {
    if (payment.paymentMode !== "PayLater") return undefined;
    if (payment.emailDeliveryStatus === "Sent") return payment;
    try {
      const response = await deliverPayLaterEmail(payment);
      const sentAt = response.emailSentAt ?? new Date().toISOString();
      try {
        const sent = await updateEmailState(payment.id, { email_delivery_status: "Sent", email_sent_at: sentAt, email_id: response.emailId ?? null, email_delivery_error: null });
        return sent ?? { ...payment, emailDeliveryStatus: "Sent" as const, emailSentAt: sentAt, emailId: response.emailId ?? undefined };
      } catch {
        return { ...payment, emailDeliveryStatus: "Sent" as const, emailSentAt: sentAt, emailId: response.emailId ?? undefined };
      }
    } catch (error) {
      if (error instanceof EmailDeliveryError && error.status === 409 && error.message.includes("already been sent")) {
        return { ...payment, emailDeliveryStatus: "Sent" as const };
      }
      const message = error instanceof Error ? error.message : "The Pay Later email could not be sent.";
      try {
        await markEmailDeliveryFailed(payment.id, message);
      } catch {
        // The delivery error is still surfaced to the student even if the audit write is unavailable.
      }
      throw error;
    }
  };

  const checkInTicket = async (value: string): Promise<TicketCheckInResult> => {
    const client = requireSupabase();
    const scannedValue = value.trim();
    const payment = data.payments.find((item) => getPaymentAttendees(item).some((attendee) => scannedValue === attendee.ticketId || scannedValue === attendee.ticketQrValue));
    if (!payment) return { ok: false, kind: "invalid", message: "This QR code does not match an active JPCS ticket or Pay Later reservation." };
    const attendee = getPaymentAttendees(payment).find((item) => scannedValue === item.ticketId || scannedValue === item.ticketQrValue);
    if (!attendee) return { ok: false, kind: "invalid", message: "This QR code does not match an active JPCS ticket or Pay Later reservation." };
    const paymentPending = payment.paymentMode === "PayLater" && payment.paymentState === "Unpaid" && payment.status === "Pending";
    if (payment.status !== "Approved" && !paymentPending) return { ok: false, kind: "invalid", message: "This QR code is not active yet. An admin must approve the payment or reservation first." };
    if (attendee.attendedAt) return { ok: false, kind: "already-checked-in", payment, attendee, paymentPending };
    const attendedAt = new Date().toISOString();
    const legacyAttendee = attendee.id.startsWith("legacy-");
    const { data: updated, error } = legacyAttendee
      ? await client.from("hs-payments").update({ attended_at: attendedAt }).eq("id", payment.id).is("attended_at", null).select("attended_at").maybeSingle()
      : await client.from("hs-payment-attendees").update({ attended_at: attendedAt }).eq("id", attendee.id).is("attended_at", null).select("attended_at").maybeSingle();
    if (error) throw error;
    if (!updated) {
      const { data: existing } = legacyAttendee
        ? await client.from("hs-payments").select("attended_at").eq("id", payment.id).single()
        : await client.from("hs-payment-attendees").select("attended_at").eq("id", attendee.id).single();
      const existingAttendee = { ...attendee, attendedAt: existing?.attended_at ?? attendedAt };
      const existingAttendees = getPaymentAttendees(payment).map((item) => item.id === attendee.id ? existingAttendee : item);
      const existingPayment = { ...payment, attendees: existingAttendees, attendedAt: existingAttendees.length === 1 ? existingAttendees[0].attendedAt : payment.attendedAt };
      return { ok: false, kind: "already-checked-in", payment: existingPayment, attendee: existingAttendee, paymentPending };
    }
    const checkedInAttendee = { ...attendee, attendedAt };
    const checkedInAttendees = getPaymentAttendees(payment).map((item) => item.id === attendee.id ? checkedInAttendee : item);
    const checkedInPayment = { ...payment, attendees: checkedInAttendees, attendedAt: checkedInAttendees.length === 1 ? attendedAt : payment.attendedAt };
    setData((current) => ({ ...current, payments: current.payments.map((item) => item.id === payment.id ? checkedInPayment : item) }));
    return { ok: true, kind: "checked-in", payment: checkedInPayment, attendee: checkedInAttendee, paymentPending };
  };

  const undoAttendance = async (paymentId: string, attendeeId?: string) => {
    const client = requireSupabase();
    const currentPayment = data.payments.find((payment) => payment.id === paymentId);
    if (!currentPayment) return undefined;
    const currentAttendees = getPaymentAttendees(currentPayment);
    const selectedAttendee = attendeeId ? currentAttendees.find((item) => item.id === attendeeId) : currentAttendees[0];
    if (!selectedAttendee) return currentPayment;
    const legacyAttendee = selectedAttendee.id.startsWith("legacy-");
    const { error } = legacyAttendee
      ? await client.from("hs-payments").update({ attended_at: null }).eq("id", paymentId).not("attended_at", "is", null)
      : await client.from("hs-payment-attendees").update({ attended_at: null }).eq("id", selectedAttendee.id).not("attended_at", "is", null);
    if (error) throw error;
    const updatedAttendees = currentAttendees.map((item) => item.id === selectedAttendee.id ? { ...item, attendedAt: undefined } : item);
    const updatedPayment = { ...currentPayment, attendees: updatedAttendees, attendedAt: updatedAttendees.length === 1 ? undefined : currentPayment.attendedAt };
    setData((current) => ({ ...current, payments: current.payments.map((payment) => payment.id === paymentId ? updatedPayment : payment) }));
    return updatedPayment;
  };

  const setOfferingDeleted = async (offeringId: string, deletedAt: string | null) => {
    const client = requireSupabase();
    const { error } = await client.from("hs-offerings").update({ archived_at: deletedAt }).eq("id", offeringId);
    if (error) throw error;
    setData((current) => ({
      ...current,
      offerings: current.offerings.map((offering) => offering.id === offeringId ? { ...offering, deletedAt: deletedAt ?? undefined } : offering),
      payments: deletedAt ? current.payments.filter((payment) => payment.offeringId !== offeringId) : current.payments,
    }));
    if (!deletedAt) {
      try {
        await loadData(true);
      } catch {
        // The database update succeeded; the next refresh can retry the data reload.
      }
    }
  };

  const moveOfferingToRecentlyDeleted = async (offeringId: string) => setOfferingDeleted(offeringId, new Date().toISOString());
  const restoreOffering = async (offeringId: string) => setOfferingDeleted(offeringId, null);

  const deleteOfferingPermanently = async (offeringId: string) => {
    const client = requireSupabase();
    const offering = data.offerings.find((item) => item.id === offeringId);
    if (!offering) return;
    if (!offering.deletedAt) throw new Error("Only recently deleted payment types can be permanently deleted.");

    const offeringPayments = await fetchPaymentRowsForOffering(client, offeringId);
    const proofPaths = offeringPayments
      .map((payment) => typeof payment.proof_path === "string" ? payment.proof_path : "")
      .filter(Boolean);

    for (let offset = 0; offset < proofPaths.length; offset += 1000) {
      const { error: proofError } = await client.storage.from(paymentProofBucket).remove(proofPaths.slice(offset, offset + 1000));
      if (proofError) throw proofError;
    }
    if (offering.imagePath) {
      const { error: imageError } = await client.storage.from(offeringImageBucket).remove([offering.imagePath]);
      if (imageError) throw imageError;
    }

    const deleteOffering = () => client.rpc("hs_delete_offering_permanently", { p_offering_id: offeringId });
    const { error } = await deleteOffering();
    if (error) {
      const { error: retryError } = await deleteOffering();
      if (retryError) throw error;
    }

    try {
      await loadData(true);
    } catch {
      setData((current) => ({ ...current, offerings: current.offerings.filter((item) => item.id !== offeringId), payments: current.payments.filter((payment) => payment.offeringId !== offeringId) }));
    }
  };

  const setPayerDeleted = async (payerId: string, deletedAt: string | null) => {
    const client = requireSupabase();
    const { error } = await client.from("hs-payers").update({ archived_at: deletedAt }).eq("id", payerId);
    if (error) throw error;
    setData((current) => ({
      ...current,
      students: current.students.map((student) => student.id === payerId ? { ...student, deletedAt: deletedAt ?? undefined } : student),
      payments: deletedAt ? current.payments.filter((payment) => !getPaymentPayerIds(payment).includes(payerId)) : current.payments,
    }));
    if (!deletedAt) {
      try {
        await loadData(true);
      } catch {
        // The database update succeeded; the next refresh can retry the data reload.
      }
    }
  };

  const movePayerToRecentlyDeleted = async (payerId: string) => setPayerDeleted(payerId, new Date().toISOString());
  const restorePayer = async (payerId: string) => setPayerDeleted(payerId, null);

  const deletePayerPermanently = async (payerId: string) => {
    const client = requireSupabase();
    const linkedPayments = await fetchPaymentRowsForPayer(client, payerId);
    const proofPaths = linkedPayments
      .map((payment) => typeof payment.proof_path === "string" ? payment.proof_path : "")
      .filter(Boolean);
    for (let offset = 0; offset < proofPaths.length; offset += 1000) {
      const { error: proofError } = await client.storage.from("hs-payment-proofs").remove(proofPaths.slice(offset, offset + 1000));
      if (proofError) throw proofError;
    }
    const { error } = await client.rpc("hs_delete_payer_permanently", { p_payer_id: payerId });
    if (error) {
      const { error: retryError } = await client.rpc("hs_delete_payer_permanently", { p_payer_id: payerId });
      if (retryError) throw error;
    }
    try {
      await loadData(true);
    } catch {
      setData((current) => ({ ...current, students: current.students.filter((student) => student.id !== payerId) }));
    }
  };

  const createOffering = async (input: NewPaymentOfferingInput, image?: PaymentOfferingImageUpdate) => {
    const client = requireSupabase();
    const offeringId = createUuid();
    let uploadedImage: { path: string; url: string } | undefined;
    try {
      if (image?.dataUrl && !image.remove) uploadedImage = await uploadOfferingImage(client, offeringId, image.dataUrl);
      const { data: row, error } = await client.from("hs-offerings").insert({
        id: offeringId,
        slug: input.slug.trim().toLowerCase(),
        name: input.name.trim(),
        description: input.description.trim(),
        amount: input.amount,
        active: input.active,
        generate_qr: input.generateQr,
        allow_multiple_names: input.allowMultipleNames,
        max_names: input.maxNames,
        available_methods: input.availableMethods,
        applicable_school_levels: input.applicableSchoolLevels,
        allocations: input.allocations,
        pay_later_methods: input.payLaterMethods,
        pay_later_deadline_at: input.payLaterDeadlineAt ?? null,
        image_path: uploadedImage?.path ?? null,
        image_url: uploadedImage?.url ?? null,
      }).select("*").single();
      if (error) throw error;
      const offering = mapOffering(row);
      setData((current) => ({ ...current, offerings: [...current.offerings, offering] }));
      return offering;
    } catch (error) {
      if (uploadedImage) {
        try {
          await removeOfferingImage(client, uploadedImage.path);
        } catch {
          // Keep the original save error; the object is no longer referenced.
        }
      }
      throw error;
    }
  };

  const saveOffering = async (offering: PaymentOffering, image?: PaymentOfferingImageUpdate) => {
    const client = requireSupabase();
    const previousImagePath = offering.imagePath;
    let nextImagePath = offering.imagePath;
    let nextImageUrl = offering.imageUrl;
    let uploadedImage: { path: string; url: string } | undefined;
    try {
      if (image?.remove) {
        nextImagePath = undefined;
        nextImageUrl = undefined;
      } else if (image?.dataUrl) {
        uploadedImage = await uploadOfferingImage(client, offering.id, image.dataUrl);
        nextImagePath = uploadedImage.path;
        nextImageUrl = uploadedImage.url;
      }
      const { error } = await client.from("hs-offerings").update({
        slug: offering.slug.trim().toLowerCase(),
        name: offering.name.trim(),
        description: offering.description.trim(),
        amount: offering.amount,
        active: offering.active,
        generate_qr: offering.generateQr,
        allow_multiple_names: offering.allowMultipleNames,
        max_names: offering.maxNames,
        available_methods: offering.availableMethods,
        applicable_school_levels: offering.applicableSchoolLevels,
        allocations: offering.allocations,
        pay_later_methods: offering.payLaterMethods,
        pay_later_deadline_at: offering.payLaterDeadlineAt ?? null,
        image_path: nextImagePath ?? null,
        image_url: nextImageUrl ?? null,
      }).eq("id", offering.id);
      if (error) throw error;
      if (previousImagePath && previousImagePath !== nextImagePath) {
        try {
          await removeOfferingImage(client, previousImagePath);
        } catch {
          // The database no longer references the old object.
        }
      }
      const updatedOffering = { ...offering, imagePath: nextImagePath, imageUrl: nextImageUrl };
      setData((current) => ({ ...current, offerings: current.offerings.map((item) => item.id === offering.id ? updatedOffering : item) }));
    } catch (error) {
      if (uploadedImage) {
        try {
          await removeOfferingImage(client, uploadedImage.path);
        } catch {
          // Keep the original save error; the object is no longer referenced.
        }
      }
      throw error;
    }
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

  const savePublicSiteSettings = async (settings: PublicSiteSettings) => {
    const client = requireSupabase();
    const requestedMaxNames = Number.isFinite(settings.maxNames) ? Math.round(settings.maxNames) : 1;
    const maxNames = settings.allowMultipleNames
      ? Math.min(20, Math.max(2, requestedMaxNames))
      : Math.min(20, Math.max(1, requestedMaxNames));
    const visibleSchoolLevels = schoolLevels.filter((level) => settings.visibleSchoolLevels.includes(level));
    if (!visibleSchoolLevels.length) throw new Error("Keep at least one school level visible on the public form.");
    const { data: row, error } = await client.rpc("hs_update_public_payment_settings", {
      p_is_open: settings.isOpen,
      p_public_message: settings.message.trim(),
      p_allow_multiple_names: settings.allowMultipleNames,
      p_max_names: maxNames,
      p_visible_school_levels: visibleSchoolLevels,
    });
    if (error) throw error;
    const updatedRow = (Array.isArray(row) ? row[0] : row) as DbRow | undefined;
    const nextSettings = updatedRow ? mapSiteSettings(updatedRow, "public-payment") : { ...settings, maxNames, visibleSchoolLevels };
    setData((current) => ({ ...current, siteSettings: nextSettings }));
  };

  const resetDemo = () => {
    if (session?.role === "admin") void loadData(true);
    else void loadData(false);
  };

  return (
    <AppContext.Provider value={{ data, session, authLoading, dataLoading, dataError, adminSiteFilter, login, logout, retryData, setAdminSiteFilter, signInAdmin, submitPayment, approvePayment, markPayLaterReceived, rejectPayment, sendApprovalEmail, sendPayLaterEmail, checkInTicket, undoAttendance, createOffering, saveOffering, moveOfferingToRecentlyDeleted, restoreOffering, deleteOfferingPermanently, movePayerToRecentlyDeleted, restorePayer, deletePayerPermanently, savePaymentMethod, savePublicSiteSettings, resetDemo }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
};
