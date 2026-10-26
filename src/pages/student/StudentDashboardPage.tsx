import { ArrowUpRight, CalendarDays, CheckCircle2, ChevronRight, Clock3, CreditCard, FileClock, History, ReceiptText, Sparkles, Ticket, WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, Button, Avatar } from "../../components/ui";
import { StatusBadge } from "../../components/StatusBadge";
import { EmptyState } from "../../components/EmptyState";
import { useApp } from "../../context/AppContext";
import { formatCurrency, formatDate, formatDateTime } from "../../lib/utils";
import { getLatestPayment } from "../../data/seed";

export function StudentDashboardPage() {
  const { data, session } = useApp();
  const navigate = useNavigate();
  const student = data.students.find((item) => item.id === session?.studentId);
  if (!student) return <EmptyState title="Student profile unavailable" description="Choose a demo student again from the login screen to continue." />;

  const payments = data.payments.filter((payment) => payment.studentId === student.id).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const latestPayment = getLatestPayment(data.payments, student.id);
  const approvedTotal = payments.filter((payment) => payment.status === "Approved").reduce((total, payment) => total + payment.amount, 0);
  const pendingCount = payments.filter((payment) => payment.status === "Pending").length;
  const activeOfferings = data.offerings.filter((offering) => offering.active);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-navy-900 px-6 py-7 text-white shadow-float sm:px-8 sm:py-9">
        <div className="absolute -right-20 -top-32 h-80 w-80 rounded-full border border-white/10" /><div className="absolute -bottom-48 right-28 h-80 w-80 rounded-full border border-white/10" />
        <div className="relative flex flex-col justify-between gap-7 md:flex-row md:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-200/60">Good morning, {student.name.split(" ")[0]}</p><h2 className="mt-3 max-w-xl text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">Your event payments, at a glance.</h2><p className="mt-3 max-w-lg text-sm leading-6 text-blue-100/70">Stay on top of your school activities. Submit a fee, follow the review, and keep your demo ticket in one place.</p></div><div className="flex shrink-0 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.08] px-4 py-3"><Avatar initials={student.avatar} color="#0e9f78" /><div><p className="text-xs font-bold">{student.name}</p><p className="mt-1 text-[11px] text-blue-100/60">{student.yearLevel}{student.strand ? ` · ${student.strand}` : ""}</p></div></div></div>
        <div className="relative mt-8 flex flex-wrap gap-3"><Button variant="dark" onClick={() => navigate("/student/payment")}>Make a payment <ArrowUpRight className="h-4 w-4" /></Button><Button className="border-white/15 bg-white/10 text-white hover:bg-white/15" variant="ghost" onClick={() => navigate("/student/history")}>View payment history <ChevronRight className="h-4 w-4" /></Button></div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Approved total" value={formatCurrency(approvedTotal)} detail="Across reviewed payments" icon={WalletCards} tone="navy" />
        <StatCard label="Payments submitted" value={String(payments.length).padStart(2, "0")} detail="Local demo records" icon={ReceiptText} tone="blue" />
        <StatCard label="Awaiting review" value={String(pendingCount).padStart(2, "0")} detail={pendingCount ? "Admin action required" : "You are all caught up"} icon={Clock3} tone="amber" />
        <StatCard label="Active offerings" value={String(activeOfferings.length).padStart(2, "0")} detail="Available to submit" icon={Sparkles} tone="mint" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-5 py-5 sm:px-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Latest activity</p><h3 className="mt-1 text-base font-extrabold text-navy-900">Your payment timeline</h3></div><button className="flex items-center gap-1 text-xs font-bold text-navy-700 hover:text-navy-900" onClick={() => navigate("/student/history")}>See all <ChevronRight className="h-3.5 w-3.5" /></button></div>
          <div className="divide-y divide-line">{payments.slice(0, 4).map((payment) => <button key={payment.id} className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50 sm:px-6" onClick={() => payment.status === "Approved" ? navigate(`/student/ticket/${payment.id}`) : navigate("/student/history")}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700"><CreditCard className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-navy-900">{payment.offeringName}</span><span className="mt-1 block text-[11px] text-slate-400">{payment.reference} · {formatDate(payment.submittedAt)}</span></span><span className="flex shrink-0 flex-col items-end gap-1"><span className="text-sm font-extrabold text-navy-900">{formatCurrency(payment.amount)}</span><StatusBadge status={payment.status} /></span></button>)}{payments.length === 0 ? <div className="p-6"><EmptyState icon={FileClock} title="No payments yet" description="Your submitted event fees will appear here." /></div> : null}</div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Next action</p><h3 className="mt-1 text-base font-extrabold text-navy-900">{latestPayment?.status === "Approved" ? "Your ticket is ready" : latestPayment?.status === "Pending" ? "Payment under review" : latestPayment?.status === "Rejected" ? "Update your payment" : "Choose an event fee"}</h3></div><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mist text-navy-700">{latestPayment?.status === "Approved" ? <Ticket className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}</span></div>
          {latestPayment ? <div className="mt-6 rounded-2xl bg-mist p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-bold text-navy-900">{latestPayment.offeringName}</p><StatusBadge status={latestPayment.status} /></div><p className="mt-2 text-[11px] leading-5 text-slate-500">{latestPayment.status === "Approved" ? `Approved ${formatDate(latestPayment.approvedAt ?? latestPayment.submittedAt)}. Your demo ticket is ready for preview.` : latestPayment.status === "Pending" ? `Submitted ${formatDateTime(latestPayment.submittedAt)}. An admin will review the details before approval.` : latestPayment.rejectionReason}</p>{latestPayment.status === "Approved" ? <Button className="mt-4 w-full" size="sm" onClick={() => navigate(`/student/ticket/${latestPayment.id}`)}>Open receipt & ticket <Ticket className="h-3.5 w-3.5" /></Button> : latestPayment.status === "Rejected" ? <Button className="mt-4 w-full" size="sm" onClick={() => navigate("/student/payment")}>Submit a new payment <ArrowUpRight className="h-3.5 w-3.5" /></Button> : <Button className="mt-4 w-full" variant="outline" size="sm" onClick={() => navigate("/student/history")}>Track payment status <HistoryIcon /></Button>}</div> : <div className="mt-6"><p className="text-sm leading-6 text-slate-500">You have no submitted payments. Browse the current offerings and send your first request for review.</p><Button className="mt-5 w-full" onClick={() => navigate("/student/payment")}>Start a payment <ArrowUpRight className="h-4 w-4" /></Button></div>}
          <div className="mt-5 flex items-start gap-2 text-[10px] leading-4 text-slate-400"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint" />Approved payments include a demo receipt and QR ticket. They are not valid for real-world entry.</div>
        </Card>
      </div>

      <section><div className="mb-4 flex items-end justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Configured by admin</p><h3 className="mt-1 text-lg font-extrabold text-navy-900">Available event offerings</h3></div><button className="text-xs font-bold text-navy-700 hover:underline" onClick={() => navigate("/student/payment")}>Open payment form</button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{activeOfferings.map((offering) => <Card key={offering.id} className="group p-5 transition hover:-translate-y-0.5 hover:shadow-float"><div className="flex items-start justify-between gap-4"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50 text-navy-700"><CalendarDays className="h-4 w-4" /></span><p className="text-lg font-extrabold text-navy-900">{formatCurrency(offering.amount)}</p></div><h4 className="mt-5 text-sm font-bold text-navy-900">{offering.name}</h4><p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">{offering.description}</p><div className="mt-5 flex items-center justify-between border-t border-line pt-4"><span className="text-[10px] font-semibold text-slate-400">{offering.availableMethods.join(" · ")}</span><button className="flex items-center gap-1 text-xs font-bold text-navy-700" onClick={() => navigate(`/student/payment?offering=${offering.id}`)}>Pay now <ArrowUpRight className="h-3.5 w-3.5" /></button></div></Card>)}{activeOfferings.length === 0 ? <div className="md:col-span-2 xl:col-span-3"><EmptyState icon={CalendarDays} title="No active offerings" description="The admin has not enabled an event fee yet." /></div> : null}</div></section>
    </div>
  );
}

function HistoryIcon() {
  return <History className="h-3.5 w-3.5" />;
}

function StatCard({ label, value, detail, icon: Icon, tone }: { label: string; value: string; detail: string; icon: typeof WalletCards; tone: "navy" | "blue" | "amber" | "mint" }) {
  const tones = { navy: "bg-navy-900 text-white", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700", mint: "bg-emerald-50 text-emerald-700" };
  return <Card className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-3 text-2xl font-extrabold tracking-tight text-navy-900">{value}</p><p className="mt-1 text-[11px] text-slate-400">{detail}</p></div><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}><Icon className="h-4 w-4" /></span></div></Card>;
}
