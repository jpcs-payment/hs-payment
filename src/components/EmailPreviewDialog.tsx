import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Mail, Send, ShieldCheck, Ticket } from "lucide-react";
import { Dialog, Button } from "./ui";
import { formatCurrency, formatDateTime } from "../lib/utils";
import type { PaymentRecord } from "../types";
import { BRANDING, createTicketQrValue } from "../lib/branding";
import { createQrDataUrl } from "../lib/qr";
import { useApp } from "../context/AppContext";
import { useToast } from "./Toast";

export function EmailPreviewDialog({ open, onClose, payment }: { open: boolean; onClose: () => void; payment: PaymentRecord | null }) {
  const { data, sendApprovalEmail } = useApp();
  const { pushToast } = useToast();
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrError, setQrError] = useState("");
  const storedPayment = payment ? data.payments.find((item) => item.id === payment.id) : undefined;
  const currentPayment = payment && (payment.status !== "Approved" || storedPayment?.status === "Approved") ? storedPayment ?? payment : payment;
  const deliveryStatus = currentPayment?.emailDeliveryStatus ?? "idle";

  useEffect(() => {
    let cancelled = false;
    if (!open || !currentPayment) {
      setQrDataUrl("");
      setQrError("");
      return () => { cancelled = true; };
    }
    setQrError("");
    const value = currentPayment.ticketQrValue ?? createTicketQrValue(currentPayment.ticketId ?? "");
    createQrDataUrl(value).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    }).catch(() => {
      if (!cancelled) setQrError("The QR image could not be generated.");
    });
    return () => { cancelled = true; };
  }, [currentPayment, open]);

  if (!currentPayment) return null;

  const handleSend = async () => {
    if (currentPayment.status !== "Approved" || deliveryStatus === "Sending") return;
    try {
      await sendApprovalEmail(currentPayment);
      pushToast({ tone: "success", title: "Confirmation email sent", message: `The receipt and attendance QR were sent to ${currentPayment.email}.` });
    } catch (error) {
      pushToast({ tone: "error", title: "Email delivery failed", message: error instanceof Error ? error.message : "Check the local Brevo configuration and try again." });
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title="Payment confirmation email" description="The confirmation email includes the same QR payload used by the attendance scanner." size="lg">
      <div className="space-y-5">
        <div className={`flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${deliveryStatus === "Sent" ? "border-emerald-200 bg-emerald-50" : deliveryStatus === "Failed" ? "border-red-200 bg-red-50" : deliveryStatus === "Sending" ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-start gap-3">
            {deliveryStatus === "Sent" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" /> : deliveryStatus === "Failed" ? <AlertCircle className="mt-0.5 h-5 w-5 text-red-700" /> : <Mail className="mt-0.5 h-5 w-5 text-blue-700" />}
            <div>
              <p className={`text-xs font-bold uppercase tracking-[0.08em] ${deliveryStatus === "Sent" ? "text-emerald-900" : deliveryStatus === "Failed" ? "text-red-900" : "text-navy-900"}`}>
                {deliveryStatus === "Sent" ? "EMAIL SENT" : deliveryStatus === "Failed" ? "DELIVERY FAILED" : deliveryStatus === "Sending" ? "SENDING EMAIL" : "READY TO SEND"}
              </p>
              <p className="mt-1 break-words text-[11px] leading-5 text-slate-600 [overflow-wrap:anywhere]">
                 {deliveryStatus === "Sent" && currentPayment.emailSentAt ? `Delivered to ${currentPayment.email} at ${formatDateTime(currentPayment.emailSentAt)}.` : deliveryStatus === "Failed" ? currentPayment.emailDeliveryError ?? "Brevo could not deliver this email." : `Payment confirmation will be sent to ${currentPayment.email}.`}
              </p>
            </div>
          </div>
          <Button size="sm" variant={deliveryStatus === "Sent" ? "outline" : "primary"} loading={deliveryStatus === "Sending"} onClick={handleSend}>
            <Send className="h-3.5 w-3.5" />{deliveryStatus === "Sent" ? "Resend email" : "Send email"}
          </Button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-line bg-mist px-5 py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-900 text-white"><ShieldCheck className="h-4 w-4" /></span>
            <div><p className="text-sm font-extrabold text-navy-900">{BRANDING.systemName}</p><p className="text-[10px] text-slate-400">{BRANDING.fullOrganization}</p></div>
          </div>
            <div className="space-y-2 border-b border-line px-5 py-4 text-xs"><p className="min-w-0 break-words [overflow-wrap:anywhere]"><span className="mr-2 text-slate-400">To</span><strong className="text-navy-900">{currentPayment.email}</strong></p><p className="min-w-0 break-words [overflow-wrap:anywhere]"><span className="mr-2 text-slate-400">Subject</span><strong className="text-navy-900">Your {BRANDING.organization} {currentPayment.offeringName} confirmation</strong></p></div>
          <div className="p-5 sm:p-7">
            <p className="text-sm font-bold text-navy-900">Hi {currentPayment.studentName.split(" ")[0]},</p>
             <p className="mt-4 text-sm leading-6 text-slate-600">Your payment for <strong className="text-navy-900">{currentPayment.offeringName}</strong> has been confirmed. Keep this email and show the QR code at the {BRANDING.organization} attendance desk.</p>
            <div className="my-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><EmailValue label="Reference" value={currentPayment.reference} /><EmailValue label="Receipt" value={currentPayment.receiptNumber ?? "Pending"} /><EmailValue label="Amount" value={formatCurrency(currentPayment.amount)} /><EmailValue label="Method" value={currentPayment.method} /></div>
            <div className="grid gap-5 border-t border-dashed border-line pt-5 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center">
               <div className="space-y-3 text-xs text-slate-500"><p><strong className="text-navy-900">Confirmed:</strong> {formatDateTime(currentPayment.approvedAt ?? currentPayment.submittedAt)}</p><p><strong className="text-navy-900">Ticket ID:</strong> {currentPayment.ticketId}</p><p className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 p-3 leading-5 text-navy-800"><Ticket className="mt-0.5 h-4 w-4 shrink-0" />Scan this one-time QR ticket at the admin attendance desk.</p></div>
              <div className="rounded-2xl border border-line bg-white p-3 text-center shadow-soft">{qrDataUrl ? <img src={qrDataUrl} alt={`Attendance QR for ${currentPayment.ticketId}`} className="mx-auto h-52 w-52" /> : <div className="flex h-52 items-center justify-center text-xs text-slate-400">{qrError || "Generating QR..."}</div>}<p className="mt-2 font-mono text-[10px] font-bold tracking-wide text-navy-900">{currentPayment.ticketId}</p></div>
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function EmailValue({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const technical = mono ?? /reference|receipt|ticket|identifier/i.test(label);
  return <div className="min-w-0 rounded-xl border border-line bg-white p-3"><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className={`${technical ? "font-mono" : ""} mt-1.5 break-words text-xs font-bold text-navy-900 [overflow-wrap:anywhere]`}>{value}</p></div>;
}
