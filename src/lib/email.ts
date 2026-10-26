import type { PaymentRecord } from "../types";

interface ApprovalEmailResponse {
  emailId?: string | null;
}

const toApprovalEmailPayload = (payment: PaymentRecord) => ({
  id: payment.id,
  status: payment.status,
  studentName: payment.studentName,
  email: payment.email,
  offeringName: payment.offeringName,
  amount: payment.amount,
  reference: payment.reference,
  receiptNumber: payment.receiptNumber,
  ticketId: payment.ticketId,
  ticketQrValue: payment.ticketQrValue,
  approvedAt: payment.approvedAt,
  schoolLevel: payment.schoolLevel,
  yearLevel: payment.yearLevel,
  strand: payment.strand,
  course: payment.course,
  allocations: payment.allocations,
  method: payment.method,
});

export async function sendApprovalEmail(payment: PaymentRecord): Promise<ApprovalEmailResponse> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch("/api/send-approval-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payment: toApprovalEmailPayload(payment) }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("The local Brevo email server timed out. Check that `npm run dev` is running.");
    throw new Error("The local Brevo email server is unavailable. Check that `npm run dev` is running.");
  } finally {
    window.clearTimeout(timeoutId);
  }

  let body: { error?: string; emailId?: string | null } = {};
  try {
    body = await response.json() as typeof body;
  } catch {
    body = {};
  }
  if (!response.ok) throw new Error(body.error ?? "The Brevo email could not be sent.");
  return body;
}
