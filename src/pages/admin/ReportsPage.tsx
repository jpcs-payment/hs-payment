import { useEffect, useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Clock3, Download, Filter, Search, UsersRound } from "lucide-react";
import { Pagination } from "../../components/Pagination";
import { Button, Card, Input, Select } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { downloadCsv, downloadPaymentCsv } from "../../lib/export";
import { summarizeAllocations } from "../../lib/reporting";
import { getPageCount, getPageItems } from "../../lib/pagination";
import { formatCurrency, formatDateTime } from "../../lib/utils";
import type { PaymentStatus } from "../../types";

const statusFilters: Array<"All statuses" | PaymentStatus> = ["All statuses", "Pending", "Approved", "Rejected"];
const PAGE_SIZE = 10;

export function ReportsPage() {
  const { data } = useApp();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statusFilters)[number]>("All statuses");
  const [type, setType] = useState("All types");
  const [allocationPage, setAllocationPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);

  const types = useMemo(() => ["All types", ...Array.from(new Set(data.payments.map((payment) => payment.offeringName)))], [data.payments]);
  const payments = useMemo(() => data.payments
    .filter((payment) => status === "All statuses" || payment.status === status)
    .filter((payment) => type === "All types" || payment.offeringName === type)
    .filter((payment) => `${payment.reference} ${payment.studentName} ${payment.email} ${payment.offeringName} ${payment.course ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)), [data.payments, query, status, type]);
  const attended = payments.filter((payment) => payment.attendedAt);
  const paymentPendingAfterAttendance = attended.filter((payment) => payment.paymentMode === "PayLater" && payment.paymentState === "Unpaid");
  const collected = payments.filter((payment) => payment.paymentState === "Paid").reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = payments.filter((payment) => payment.paymentState === "Unpaid").reduce((sum, payment) => sum + payment.amount, 0);
  const allocationSummaries = useMemo(() => summarizeAllocations(payments), [payments]);
  const allocationPageCount = getPageCount(allocationSummaries.length, PAGE_SIZE);
  const visibleAllocationSummaries = getPageItems(allocationSummaries, allocationPage, PAGE_SIZE);
  const ledgerPageCount = getPageCount(payments.length, PAGE_SIZE);
  const visiblePayments = getPageItems(payments, ledgerPage, PAGE_SIZE);
  const exportAllocations = () => downloadCsv(`jpcs-allocation-report-${new Date().toISOString().slice(0, 10)}.csv`, ["Recipient", "Allocated", "Collected", "Outstanding", "Pending", "Records"], allocationSummaries.map((summary) => [summary.recipient, summary.allocated, summary.collected, summary.outstanding, summary.pending, summary.recordCount]));

  useEffect(() => {
    setAllocationPage(1);
    setLedgerPage(1);
  }, [query, status, type]);

  useEffect(() => {
    setAllocationPage((current) => Math.min(current, allocationPageCount));
  }, [allocationPageCount]);

  useEffect(() => {
    setLedgerPage((current) => Math.min(current, ledgerPageCount));
  }, [ledgerPageCount]);

  return (
    <div className="mx-auto max-w-[1450px] space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h2 className="text-2xl font-extrabold tracking-[-0.035em] text-navy-900 sm:text-3xl">Reports</h2>
        </div>
        <Button size="sm" onClick={() => downloadPaymentCsv(payments)} disabled={!payments.length}><Download className="h-3.5 w-3.5" /> Export CSV</Button>
      </div>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <div className="order-1"><ReportStat label="Payment records" value={payments.length} detail="Current filters" icon={BarChart3} /></div>
        <div className="order-2"><ReportStat label="Collected" value={formatCurrency(collected)} detail="Marked paid" icon={CheckCircle2} /></div>
        <div className="order-4 xl:order-3"><ReportStat label="Outstanding" value={formatCurrency(outstanding)} detail="Still unpaid" icon={Clock3} /></div>
        <div className="order-3 xl:order-4"><ReportStat label="Attended but unpaid" value={paymentPendingAfterAttendance.length} detail="Needs follow-up" icon={UsersRound} /></div>
      </section>

       <Card className="overflow-hidden">
         <div className="flex flex-col justify-between gap-3 border-b border-line px-5 py-5 sm:flex-row sm:items-center sm:px-6">
            <div><h3 className="text-base font-extrabold text-navy-900">Allocations</h3></div>
           <Button variant="outline" size="sm" onClick={exportAllocations} disabled={!allocationSummaries.length}><Download className="h-3.5 w-3.5" /> Export allocations</Button>
         </div>
         {allocationSummaries.length ? <>
           <div className="hidden overflow-x-auto md:block">
             <table className="w-full min-w-[760px] text-left">
               <thead className="border-b border-line bg-mist text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400"><tr><th className="px-5 py-3">Recipient</th><th className="px-5 py-3">Allocated</th><th className="px-5 py-3">Collected</th><th className="px-5 py-3">Outstanding</th><th className="px-5 py-3">Pending</th><th className="px-5 py-3">Records</th></tr></thead>
               <tbody className="divide-y divide-line">{visibleAllocationSummaries.map((summary) => <tr key={summary.recipient} className="text-xs"><td className="px-5 py-4 font-bold text-navy-900">{summary.recipient}</td><td className="px-5 py-4 font-extrabold text-navy-900">{formatCurrency(summary.allocated)}</td><td className="px-5 py-4 font-semibold text-emerald-700">{formatCurrency(summary.collected)}</td><td className="px-5 py-4 font-semibold text-amber-700">{formatCurrency(summary.outstanding)}</td><td className="px-5 py-4 font-semibold text-blue-700">{formatCurrency(summary.pending)}</td><td className="px-5 py-4 font-semibold text-slate-600">{summary.recordCount}</td></tr>)}</tbody>
             </table>
           </div>
           <div className="space-y-3 p-4 md:hidden">
             {visibleAllocationSummaries.map((summary) => <article key={summary.recipient} className="rounded-2xl border border-line p-4"><div className="flex items-start justify-between gap-3"><p className="min-w-0 break-words text-sm font-bold text-navy-900">{summary.recipient}</p><span className="shrink-0 text-[10px] font-bold text-slate-500">{summary.recordCount} record{summary.recordCount === 1 ? "" : "s"}</span></div><dl className="mt-4 grid grid-cols-2 gap-3"><ReportDetail label="Allocated" value={formatCurrency(summary.allocated)} /><ReportDetail label="Collected" value={formatCurrency(summary.collected)} /><ReportDetail label="Outstanding" value={formatCurrency(summary.outstanding)} /><ReportDetail label="Pending" value={formatCurrency(summary.pending)} /></dl></article>)}
           </div>
         </> : <div className="p-8 text-center text-sm text-slate-500">No allocation records match the current filters.</div>}
         <Pagination page={allocationPage} pageCount={allocationPageCount} totalItems={allocationSummaries.length} pageSize={PAGE_SIZE} onPageChange={setAllocationPage} />
       </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
           <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400"><Filter className="h-3.5 w-3.5" /> Filters</div>
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[720px]">
            <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records" /></div>
            <Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>{statusFilters.map((item) => <option key={item}>{item}</option>)}</Select>
            <Select value={type} onChange={(event) => setType(event.target.value)}>{types.map((item) => <option key={item}>{item}</option>)}</Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
         <div className="flex flex-col justify-between gap-2 border-b border-line px-5 py-5 sm:flex-row sm:items-center sm:px-6"><div><h3 className="text-base font-extrabold text-navy-900">Ledger</h3></div><span className="text-xs font-semibold text-slate-400">{payments.length} record{payments.length === 1 ? "" : "s"}</span></div>
         {payments.length ? <>
           <div className="hidden overflow-x-auto md:block">
             <table className="w-full min-w-[1050px] text-left">
               <thead className="border-b border-line bg-mist text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400"><tr><th className="px-5 py-3">Payer</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Attendance</th><th className="px-5 py-3">Submitted</th></tr></thead>
               <tbody className="divide-y divide-line">{visiblePayments.map((payment) => <tr key={payment.id} className="text-xs"><td className="px-5 py-4"><p className="font-bold text-navy-900">{payment.studentName}</p><p className="mt-1 text-slate-400">{payment.email}</p></td><td className="px-5 py-4"><p className="font-semibold text-navy-800">{payment.offeringName}</p><p className="mt-1 text-slate-400">{payment.paymentMode}</p></td><td className="px-5 py-4 font-extrabold text-navy-900">{formatCurrency(payment.amount)}</td><td className="px-5 py-4"><p className="font-semibold text-slate-700">{payment.paymentState}</p><p className="mt-1 text-slate-400">{payment.status}</p></td><td className="px-5 py-4"><p className={payment.attendedAt ? "font-bold text-emerald-700" : "font-semibold text-slate-500"}>{payment.attendedAt ? "Checked in" : "Not checked in"}</p>{payment.attendedAt && payment.paymentState === "Unpaid" ? <p className="mt-1 font-bold text-coral">Payment pending</p> : null}</td><td className="px-5 py-4 font-semibold text-slate-600">{formatDateTime(payment.submittedAt)}</td></tr>)}</tbody>
             </table>
           </div>
           <div className="space-y-3 p-4 md:hidden">
             {visiblePayments.map((payment) => <article key={payment.id} className="rounded-2xl border border-line p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-bold text-navy-900">{payment.studentName}</p><p className="mt-1 break-words text-xs text-slate-400">{payment.email}</p></div><span className="shrink-0 rounded-full bg-navy-50 px-2.5 py-1 text-[10px] font-bold text-navy-700">{payment.paymentMode}</span></div><dl className="mt-4 grid grid-cols-2 gap-3"><ReportDetail label="Type" value={payment.offeringName} /><ReportDetail label="Amount" value={formatCurrency(payment.amount)} /><ReportDetail label="Payment" value={`${payment.paymentState} · ${payment.status}`} /><ReportDetail label="Attendance" value={payment.attendedAt ? "Checked in" : "Not checked in"} /><ReportDetail label="Submitted" value={formatDateTime(payment.submittedAt)} /></dl>{payment.attendedAt && payment.paymentState === "Unpaid" ? <p className="mt-3 text-[10px] font-bold text-coral">Payment pending</p> : null}</article>)}
           </div>
         </> : <div className="p-10 text-center text-sm text-slate-500">No records match the current filters.</div>}
         <Pagination page={ledgerPage} pageCount={ledgerPageCount} totalItems={payments.length} pageSize={PAGE_SIZE} onPageChange={setLedgerPage} />
       </Card>
    </div>
  );
}

function ReportStat({ label, value, detail, icon: Icon }: { label: string; value: number | string; detail: string; icon: typeof BarChart3 }) {
  return <Card className="min-w-0 p-2.5 sm:p-3.5"><div className="flex min-w-0 items-start justify-between gap-1 sm:gap-3"><div className="min-w-0"><p className="break-words text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 sm:text-[10px] sm:tracking-[0.12em]">{label}</p><p className="mt-1.5 break-words text-xl font-extrabold text-navy-900 sm:mt-2 sm:text-2xl">{value}</p></div><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700 sm:h-8 sm:w-8"><Icon className="h-3.5 w-3.5" /></span></div></Card>;
}

function ReportDetail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</dt><dd className="mt-1 break-words text-xs font-semibold text-navy-900 [overflow-wrap:anywhere]">{value}</dd></div>;
}
