import { useMemo, useState } from "react";
import { CheckCircle2, Eye, FileImage, Filter, Mail, Plus, ReceiptText, Search, ShieldCheck, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import jpcsLogo from "../../../jpcslogo/cropped_circle_image.png";
import { EmailPreviewDialog } from "../../components/EmailPreviewDialog";
import { EmptyState } from "../../components/EmptyState";
import { StatusBadge } from "../../components/StatusBadge";
import { Button, Card, ConfirmDialog, Dialog, Input, Select, Textarea } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../components/Toast";
import { formatCurrency, formatDateTime } from "../../lib/utils";
import type { PaymentMethod, PaymentRecord, PaymentStatus } from "../../types";

const statusFilters: Array<"All statuses" | PaymentStatus> = ["All statuses", "Pending", "Approved", "Rejected"];
const methodFilters: Array<"All methods" | PaymentMethod> = ["All methods", "Cash", "GCash", "MariBank"];

export function PaymentsPage() {
  const { data, approvePayment, rejectPayment, sendApprovalEmail } = useApp();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statusFilters)[number]>("All statuses");
  const [method, setMethod] = useState<(typeof methodFilters)[number]>("All methods");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approveId, setApproveId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [emailPayment, setEmailPayment] = useState<PaymentRecord | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const filteredPayments = useMemo(() => data.payments
    .filter((payment) => status === "All statuses" || payment.status === status)
    .filter((payment) => method === "All methods" || payment.method === method)
    .filter((payment) => `${payment.reference} ${payment.studentName} ${payment.email} ${payment.offeringName} ${payment.course ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)), [data.payments, method, query, status]);
  const selectedPayment = selectedId ? data.payments.find((payment) => payment.id === selectedId) ?? null : null;
  const approveRecord = approveId ? data.payments.find((payment) => payment.id === approveId) : undefined;
  const rejectRecord = rejectId ? data.payments.find((payment) => payment.id === rejectId) : undefined;
  const pendingCount = data.payments.filter((payment) => payment.status === "Pending").length;
  const approvedCount = data.payments.filter((payment) => payment.status === "Approved").length;
  const rejectedCount = data.payments.filter((payment) => payment.status === "Rejected").length;

  const handleApprove = async () => {
    if (!approveId) return;
    setActionLoading(true);
    try {
      const approved = await approvePayment(approveId);
      setApproveId(null);
      if (!approved) return;
      setEmailPayment(approved);
      try {
        await sendApprovalEmail(approved);
        pushToast({ tone: "success", title: "Payment approved and emailed", message: `The confirmation was sent to ${approved.email}.` });
      } catch (error) {
        pushToast({ tone: "error", title: "Payment approved, email failed", message: error instanceof Error ? error.message : "Retry the email from the payment details." });
      }
    } catch (error) {
      pushToast({ tone: "error", title: "Approval failed", message: error instanceof Error ? error.message : "Try again." });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectId) return;
    if (!rejectReason.trim()) {
      setRejectError("A rejection reason is required.");
      return;
    }
    setActionLoading(true);
    try {
      const rejected = await rejectPayment(rejectId, rejectReason.trim());
      setRejectId(null);
      setRejectReason("");
      setRejectError("");
      if (rejected?.status === "Approved") pushToast({ tone: "error", title: "Payment was already approved", message: "The payment stayed approved because another admin completed it first." });
      else pushToast({ tone: "success", title: "Payment rejected", message: "The reason was saved for the payment record." });
    } catch (error) {
      pushToast({ tone: "error", title: "Rejection failed", message: error instanceof Error ? error.message : "Try again." });
    } finally {
      setActionLoading(false);
    }
  };

  return <div className="mx-auto max-w-[1400px] space-y-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Review queue</p><h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-navy-900 sm:text-3xl">Payments</h2><p className="mt-2 text-sm leading-6 text-slate-500">Review payment proof, confirm valid records, and issue receipts and QR tickets.</p></div><div className="flex flex-wrap gap-2"><div className="flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800"><Filter className="h-4 w-4" />{pendingCount} awaiting review</div><Button size="sm" onClick={() => navigate("/admin/offerings")}><Plus className="h-3.5 w-3.5" /> Add payment</Button></div></div><section className="grid gap-4 sm:grid-cols-3"><ReviewStat label="Awaiting review" value={pendingCount} tone="amber" icon={ReceiptText} /><ReviewStat label="Confirmed" value={approvedCount} tone="mint" icon={CheckCircle2} /><ReviewStat label="Rejected" value={rejectedCount} tone="coral" icon={XCircle} /></section><Card className="p-4 sm:p-5"><div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_150px]"><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, name, email, or offering" /></div><Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{statusFilters.map((item) => <option key={item}>{item}</option>)}</Select><Select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>{methodFilters.map((item) => <option key={item}>{item}</option>)}</Select></div></Card>{filteredPayments.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredPayments.map((payment, index) => <PaymentCard key={payment.id} payment={payment} index={index} onView={() => setSelectedId(payment.id)} />)}</div> : <EmptyState icon={Search} title="No payments found" description="Try a different search, status, or method filter." />}<Dialog open={Boolean(selectedPayment)} onClose={() => setSelectedId(null)} title="Payment details" description={selectedPayment ? `${selectedPayment.reference} · submitted ${formatDateTime(selectedPayment.submittedAt)}` : undefined} size="lg">{selectedPayment ? <PaymentDetails payment={selectedPayment} onApprove={() => setApproveId(selectedPayment.id)} onReject={() => { setRejectId(selectedPayment.id); setRejectError(""); }} onEmail={() => setEmailPayment(selectedPayment)} /> : null}</Dialog><ConfirmDialog open={Boolean(approveRecord)} onClose={() => setApproveId(null)} onConfirm={handleApprove} title="Approve payment?" description={approveRecord ? `This will issue a receipt and QR ticket for ${approveRecord.studentName}. The current signed-in admin will be recorded as the approver.` : ""} confirmLabel="Approve and issue ticket" loading={actionLoading} /><Dialog open={Boolean(rejectRecord)} onClose={() => setRejectId(null)} title="Reject payment" description="Give the payer a clear reason so they know what to correct." size="sm"><div className="space-y-5"><div><label className="mb-1.5 block text-xs font-bold uppercase tracking-[0.08em] text-slate-500" htmlFor="rejection-reason">Reason</label><Textarea id="rejection-reason" value={rejectReason} onChange={(event) => { setRejectReason(event.target.value); setRejectError(""); }} placeholder="Example: The uploaded proof does not show the full transaction." />{rejectError ? <p className="mt-1.5 text-xs font-semibold text-coral">{rejectError}</p> : null}</div><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => setRejectId(null)}>Cancel</Button><Button variant="danger" loading={actionLoading} onClick={handleReject}>Reject payment</Button></div></div></Dialog><EmailPreviewDialog open={Boolean(emailPayment)} onClose={() => setEmailPayment(null)} payment={emailPayment} /></div>;
}

function PaymentCard({ payment, index, onView }: { payment: PaymentRecord; index: number; onView: () => void }) {
  const gradients = payment.status === "Approved" ? ["from-emerald-950 via-teal-900 to-navy-800", "from-navy-950 via-blue-900 to-indigo-800"] : payment.status === "Rejected" ? ["from-red-950 via-rose-900 to-navy-900"] : ["from-navy-950 via-navy-800 to-blue-700", "from-slate-950 via-navy-900 to-teal-800"];
  return <article className={`group relative min-w-0 overflow-hidden rounded-3xl bg-gradient-to-br ${gradients[index % gradients.length]} p-5 text-white shadow-float transition duration-300 motion-safe:hover:-translate-y-1`}><img src={jpcsLogo} alt="" aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 opacity-10 transition duration-500 group-hover:rotate-6 group-hover:scale-110" /><div className="relative flex h-full min-h-[270px] flex-col"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-blue-100/60">{payment.offeringName}</p><p className="mt-2 break-words text-sm font-extrabold">{payment.studentName}</p><p className="mt-1 break-words text-[11px] text-blue-100/65 [overflow-wrap:anywhere]">{payment.email}</p></div><StatusBadge status={payment.status} /></div><div className="mt-7 flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-100/55">Amount</p><p className="mt-1 text-2xl font-extrabold">{formatCurrency(payment.amount)}</p></div><span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-blue-50">{payment.method}</span></div><div className="mt-5 grid gap-3 border-t border-white/10 pt-4 text-[11px] text-blue-100/70"><div><p className="uppercase tracking-wide text-blue-100/40">School details</p><p className="mt-1 break-words text-blue-50">{payment.schoolLevel} · {payment.yearLevel}{payment.strand ? ` · ${payment.strand}` : ""}{payment.course ? ` · ${payment.course}` : ""}</p></div><div className="flex items-end justify-between gap-3"><div><p className="uppercase tracking-wide text-blue-100/40">Reference</p><p className="mt-1 break-words font-mono text-[10px] text-blue-50">{payment.reference}</p></div><Button className="shrink-0 border-white/20 bg-white/10 text-white hover:bg-white/20" variant="outline" size="sm" onClick={onView}><Eye className="h-3.5 w-3.5" /> View</Button></div></div></div></article>;
}

function PaymentDetails({ payment, onApprove, onReject, onEmail }: { payment: PaymentRecord; onApprove: () => void; onReject: () => void; onEmail: () => void }) {
  const schoolDetails = `${payment.schoolLevel} · ${payment.yearLevel}${payment.strand ? ` · ${payment.strand}` : ""}${payment.course ? ` · ${payment.course}` : ""}`;
  return <div className="space-y-5"><div className="flex flex-col justify-between gap-4 rounded-2xl bg-mist p-4 sm:flex-row sm:items-center"><div className="min-w-0"><p className="break-words text-sm font-extrabold text-navy-900">{payment.offeringName}</p><p className="mt-1 break-words text-xs text-slate-500">{payment.studentName} · {formatCurrency(payment.amount)} · {payment.method}</p></div><StatusBadge status={payment.status} /></div><div className="grid gap-4 sm:grid-cols-2"><Detail label="Payment reference" value={payment.reference} /><Detail label="Student email" value={payment.email} /><Detail label="School details" value={schoolDetails} /><Detail label="Submitted" value={formatDateTime(payment.submittedAt)} /><Detail label="Sender account name" value={payment.senderAccountName ?? "Not provided"} /><Detail label="Account / cashier reference" value={payment.senderReference ?? "Not provided"} /></div><div className="rounded-2xl border border-line bg-mist p-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Allocation destinations</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{payment.allocations.map((allocation) => <div key={allocation.recipient} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-xs"><span className="break-words font-semibold text-slate-600">{allocation.recipient}</span><span className="shrink-0 font-extrabold text-navy-900">{formatCurrency(allocation.amount)}</span></div>)}</div></div>{payment.status === "Approved" ? <div className="flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" /><div className="min-w-0"><p className="text-xs font-bold text-emerald-900">Approved by {payment.approvedByName ?? payment.approvedByEmail ?? "registered admin"}</p><p className="mt-1 break-words text-xs leading-5 text-emerald-800 [overflow-wrap:anywhere]">{payment.approvedByEmail ? `${payment.approvedByEmail} · ` : ""}{formatDateTime(payment.approvedAt ?? payment.submittedAt)}</p></div></div> : null}{payment.proofImage ? <div><div className="mb-2 flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Uploaded proof</p><span className="flex items-center gap-1 text-[10px] font-semibold text-mint"><FileImage className="h-3.5 w-3.5" />Preview available</span></div><div className="rounded-2xl border border-line bg-slate-50 p-2"><img src={payment.proofImage} alt={`Payment proof for ${payment.studentName}`} className="max-h-72 w-full rounded-xl object-contain" /></div></div> : <div className="flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" /><p className="text-xs leading-5 text-navy-800">This is a cash submission. Verify the cashier reference before confirming.</p></div>}{payment.status === "Rejected" ? <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-xs leading-5 text-red-800"><p className="font-bold">Rejection reason</p><p className="mt-1 break-words">{payment.rejectionReason}</p></div> : null}<div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">{payment.status === "Pending" || payment.status === "Rejected" ? <><Button variant="danger" onClick={onReject}>Reject</Button><Button onClick={onApprove}><CheckCircle2 className="h-4 w-4" /> Approve payment</Button></> : <Button variant="outline" onClick={onEmail}><Mail className="h-4 w-4" /> Email receipt</Button>}</div></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1.5 break-words text-xs font-semibold text-navy-900 [overflow-wrap:anywhere]">{value}</p></div>;
}

function ReviewStat({ label, value, tone, icon: Icon }: { label: string; value: number; tone: "amber" | "mint" | "coral"; icon: typeof ReceiptText }) {
  const colors = { amber: "bg-amber-50 text-amber-700", mint: "bg-emerald-50 text-emerald-700", coral: "bg-red-50 text-coral" };
  return <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-3 text-2xl font-extrabold text-navy-900">{String(value).padStart(2, "0")}</p><p className="mt-1 text-[11px] text-slate-400">Payment records</p></div><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${colors[tone]}`}><Icon className="h-4 w-4" /></span></div></Card>;
}
