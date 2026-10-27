import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, Mail, Search, UsersRound, WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../components/EmptyState";
import { Pagination } from "../../components/Pagination";
import { StatusBadge } from "../../components/StatusBadge";
import { useToast } from "../../components/Toast";
import { Avatar, Button, Card, ConfirmDialog, Dialog, Input, Select } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { formatCurrency, formatDateTime } from "../../lib/utils";
import { downloadCsv } from "../../lib/export";
import { getLatestPayment } from "../../data/seed";
import { getPageCount, getPageItems } from "../../lib/pagination";
import type { PaymentRecord, SchoolLevel, Student } from "../../types";

const levelFilters: Array<"All levels" | SchoolLevel> = ["All levels", "Junior High School", "Senior High School", "College"];
const PAGE_SIZE = 10;

function LegacyPayersPage() {
  const { data } = useApp();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<(typeof levelFilters)[number]>("All levels");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const studentsWithPayments = data.students.filter((student) => data.payments.some((payment) => payment.studentId === student.id)).length;
  const approvedPayers = data.students.filter((student) => data.payments.some((payment) => payment.studentId === student.id && payment.status === "Approved")).length;
  const pendingPayers = data.students.filter((student) => data.payments.some((payment) => payment.studentId === student.id && payment.status === "Pending")).length;
  const filteredStudents = useMemo(() => data.students.filter((student) => level === "All levels" || student.schoolLevel === level).filter((student) => `${student.name} ${student.email} ${student.yearLevel} ${student.strand ?? ""} ${student.course ?? ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)), [data.students, level, query]);
  const selectedStudent = selectedId ? data.students.find((student) => student.id === selectedId) ?? null : null;

  return <div className="mx-auto max-w-[1400px] space-y-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">People & accounts</p><h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-navy-900 sm:text-3xl">Payers</h2><p className="mt-2 text-sm leading-6 text-slate-500">Search payer details and inspect their payment history.</p></div><div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800"><UsersRound className="h-4 w-4" />{data.students.length} payer records</div></div><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AdminStat label="Total payers" value={String(data.students.length)} detail="Recorded payer details" /><AdminStat label="With payment records" value={String(studentsWithPayments)} detail="Have submitted at least once" /><AdminStat label="Confirmed payers" value={String(approvedPayers)} detail="Have a released ticket" /><AdminStat label="Awaiting review" value={String(pendingPayers)} detail="Need admin attention" /></section><Card className="p-4 sm:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="relative w-full lg:max-w-md"><Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><Input className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, email, year, strand, or course" /></div><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Filter</span><Select className="w-auto min-w-[180px]" value={level} onChange={(event) => setLevel(event.target.value as typeof level)}>{levelFilters.map((item) => <option key={item}>{item}</option>)}</Select></div></div></Card>{filteredStudents.length > 0 ? <Card className="overflow-hidden"><div className="hidden grid-cols-[minmax(0,1.6fr)_180px_150px_120px_110px] gap-4 border-b border-line bg-slate-50/70 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 md:grid md:px-6"><span>Student</span><span>School details</span><span>Payment count</span><span>Latest status</span><span /></div><div className="divide-y divide-line">{filteredStudents.map((student) => <PayerRow key={student.id} student={student} payments={data.payments.filter((payment) => payment.studentId === student.id)} onView={() => setSelectedId(student.id)} />)}</div></Card> : <EmptyState icon={Search} title="No payers found" description="Try a different search term or school-level filter." />}<Dialog open={Boolean(selectedStudent)} onClose={() => setSelectedId(null)} title={selectedStudent ? selectedStudent.name : "Payer details"} description={selectedStudent ? `${selectedStudent.email} · payer profile` : undefined} size="lg">{selectedStudent ? <PayerDetails student={selectedStudent} payments={data.payments.filter((payment) => payment.studentId === selectedStudent.id)} onViewPayments={() => navigate(`/admin/payments?student=${selectedStudent.id}`)} /> : null}</Dialog></div>;
}

function LegacyPayersExportPage() {
  const { data } = useApp();
  const exportPayers = () => downloadCsv(`jpcs-payers-${new Date().toISOString().slice(0, 10)}.csv`, ["Payer", "Email", "School level", "Year level", "Strand", "Course", "Payment count", "Approved total"], data.students.map((student) => { const payments = data.payments.filter((payment) => payment.studentId === student.id); return [student.name, student.email, student.schoolLevel, student.yearLevel, student.strand, student.course, payments.length, payments.filter((payment) => payment.status === "Approved").reduce((total, payment) => total + payment.amount, 0)]; }));
  return <div className="space-y-4"><div className="flex justify-end"><Button size="sm" variant="outline" onClick={exportPayers} disabled={!data.students.length}><Download className="h-3.5 w-3.5" /> Export CSV</Button></div><LegacyPayersPage /></div>;
}

export function PayersPage() {
  return <PayersWorkspace />;
}

function PayersWorkspace() {
  const { data, archivePayer } = useApp();
  const { pushToast } = useToast();
  const [query, setQuery] = useState("");
  const [level, setLevel] =
    useState<(typeof levelFilters)[number]>("All levels");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [page, setPage] = useState(1);
  const activeStudents = data.students.filter((student) => !student.archivedAt);
  const studentsWithPayments = activeStudents.filter((student) =>
    data.payments.some((payment) => payment.studentId === student.id),
  ).length;
  const approvedPayers = activeStudents.filter((student) =>
    data.payments.some(
      (payment) =>
        payment.studentId === student.id && payment.status === "Approved",
    ),
  ).length;
  const pendingPayers = activeStudents.filter((student) =>
    data.payments.some(
      (payment) =>
        payment.studentId === student.id && payment.status === "Pending",
    ),
  ).length;
  const filteredStudents = useMemo(
    () =>
      activeStudents
        .filter(
          (student) => level === "All levels" || student.schoolLevel === level,
        )
        .filter((student) =>
          `${student.name} ${student.email} ${student.yearLevel} ${student.strand ?? ""} ${student.course ?? ""}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [activeStudents, level, query],
  );
  const selectedStudent = selectedId
    ? (activeStudents.find((student) => student.id === selectedId) ?? null)
    : null;
  const archiveStudent = archiveId
    ? (data.students.find((student) => student.id === archiveId) ?? null)
    : null;
  const pageCount = getPageCount(filteredStudents.length, PAGE_SIZE);
  const visibleStudents = getPageItems(filteredStudents, page, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [level, query]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  const exportPayers = () =>
    downloadCsv(
      `jpcs-payers-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Payer",
        "Email",
        "School level",
        "Year level",
        "Strand",
        "Course",
        "Payment count",
        "Approved total",
      ],
      activeStudents.map((student) => {
        const payments = data.payments.filter(
          (payment) => payment.studentId === student.id,
        );
        return [
          student.name,
          student.email,
          student.schoolLevel,
          student.yearLevel,
          student.strand,
          student.course,
          payments.length,
          payments
            .filter((payment) => payment.status === "Approved")
            .reduce((total, payment) => total + payment.amount, 0),
        ];
      }),
    );
  const handleArchive = async () => {
    if (!archiveId) return;
    setArchiveLoading(true);
    try {
      await archivePayer(archiveId);
      setArchiveId(null);
      if (selectedId === archiveId) setSelectedId(null);
      pushToast({
        tone: "success",
        title: "Payer archived",
        message:
          "The payer is hidden from active lists and the public payment flow.",
      });
    } catch (error) {
      pushToast({
        tone: "error",
        title: "Could not archive payer",
        message: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setArchiveLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
            People & accounts
          </p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-navy-900 sm:text-3xl">
            Payers
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Search payer details and inspect their payment history.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
            <UsersRound className="h-4 w-4" />
            {activeStudents.length} active payer records
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={exportPayers}
            disabled={!activeStudents.length}
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
      </div>
      <section className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <AdminStat
          label="Total payers"
          value={String(activeStudents.length)}
          detail="Active payer details"
        />
        <AdminStat
          label="With payment records"
          value={String(studentsWithPayments)}
          detail="Have submitted at least once"
        />
        <AdminStat
          label="Confirmed payers"
          value={String(approvedPayers)}
          detail="Have a released ticket"
        />
        <AdminStat
          label="Awaiting review"
          value={String(pendingPayers)}
          detail="Need admin attention"
        />
      </section>
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
            <Input
              className="pl-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, email, year, strand, or course"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Filter
            </span>
            <Select
              className="w-auto min-w-[180px]"
              value={level}
              onChange={(event) => setLevel(event.target.value as typeof level)}
            >
              {levelFilters.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>
      {filteredStudents.length ? (
        <Card className="overflow-hidden">
          <div className="hidden border-b border-line bg-mist px-5 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 md:grid md:grid-cols-[minmax(0,1.6fr)_180px_150px_120px_150px] md:gap-4 md:px-6">
            <span>Payer</span>
            <span>School details</span>
            <span>Payments</span>
            <span>Latest</span>
            <span>Actions</span>
          </div>
          <div className="divide-y divide-line">
            {visibleStudents.map((student) => (
              <PayerArchiveRow
                key={student.id}
                student={student}
                payments={data.payments.filter(
                  (payment) => payment.studentId === student.id,
                )}
                onView={() => setSelectedId(student.id)}
                onArchive={() => setArchiveId(student.id)}
              />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} totalItems={filteredStudents.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-soft">
          <EmptyState
            icon={UsersRound}
            title="No payers found"
            description="Try a different search or filter."
          />
          <Pagination page={page} pageCount={pageCount} totalItems={filteredStudents.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      )}
      <Dialog
        open={Boolean(selectedStudent)}
        onClose={() => setSelectedId(null)}
        title={selectedStudent?.name ?? "Payer profile"}
        description={
          selectedStudent
            ? `${selectedStudent.email} · ${selectedStudent.schoolLevel}`
            : undefined
        }
        size="lg"
      >
        {selectedStudent ? (
          <PayerDetails
            student={selectedStudent}
            payments={data.payments.filter(
              (payment) => payment.studentId === selectedStudent.id,
            )}
            onViewPayments={() => {
              setSelectedId(null);
            }}
          />
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={Boolean(archiveId)}
        onClose={() => setArchiveId(null)}
        onConfirm={() => void handleArchive()}
        title="Archive payer?"
        description={
          archiveStudent
            ? `This hides ${archiveStudent.name} from active payer lists and the public payment flow. Existing payment records remain unchanged.`
            : "The payer will be hidden from active lists."
        }
        confirmLabel="Archive payer"
        danger
        loading={archiveLoading}
      />
    </div>
  );
}

function PayerArchiveRow({ student, payments, onView, onArchive }: { student: Student; payments: PaymentRecord[]; onView: () => void; onArchive: () => void }) {
  const latest = getLatestPayment(payments, student.id);
  const color = student.schoolLevel === "Junior High School" ? "#0e9f78" : "#163A63";
  return <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.6fr)_180px_150px_120px_150px] md:items-center md:gap-4 md:px-6"><div className="flex min-w-0 items-center gap-3"><Avatar initials={student.avatar} color={color} size="sm" /><div className="min-w-0"><p className="break-words text-sm font-bold text-navy-900">{student.name}</p><p className="break-words text-[11px] text-slate-400 [overflow-wrap:anywhere]">{student.email}</p></div></div><div className="flex items-center justify-between text-xs text-slate-500 md:block"><span className="mr-2 text-[10px] uppercase tracking-wide text-slate-400 md:hidden">School details</span><span className="break-words">{student.schoolLevel}<br /><span className="text-[10px] text-slate-400">{student.yearLevel}{student.strand ? ` · ${student.strand}` : ""}{student.course ? ` · ${student.course}` : ""}</span></span></div><div className="flex items-center justify-between text-xs font-semibold text-navy-900 md:block"><span className="mr-2 text-[10px] font-normal uppercase tracking-wide text-slate-400 md:hidden">Payments</span>{payments.length} {payments.length === 1 ? "payment" : "payments"}</div><div className="flex items-center justify-between md:block"><span className="mr-2 text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Latest</span>{latest ? <StatusBadge status={latest.status} /> : <span className="text-xs text-slate-400">No activity</span>}</div><div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={onView}>View <ChevronRight className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="sm" className="text-coral hover:text-coral" onClick={onArchive}>Archive</Button></div></div>;
}

function PayerRow({ student, payments, onView }: { student: Student; payments: PaymentRecord[]; onView: () => void }) {
  const latest = getLatestPayment(payments, student.id);
  const color = student.schoolLevel === "Junior High School" ? "#0e9f78" : "#163A63";
  return <div className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(0,1.6fr)_180px_150px_120px_110px] md:items-center md:gap-4 md:px-6"><div className="flex min-w-0 items-center gap-3"><Avatar initials={student.avatar} color={color} size="sm" /><div className="min-w-0"><p className="truncate text-sm font-bold text-navy-900">{student.name}</p><p className="break-words text-[11px] text-slate-400 [overflow-wrap:anywhere]">{student.email}</p></div></div><div className="flex items-center justify-between text-xs text-slate-500 md:block"><span className="mr-2 text-[10px] uppercase tracking-wide text-slate-400 md:hidden">School details</span><span className="break-words">{student.schoolLevel}<br /><span className="text-[10px] text-slate-400">{student.yearLevel}{student.strand ? ` · ${student.strand}` : ""}{student.course ? ` · ${student.course}` : ""}</span></span></div><div className="flex items-center justify-between text-xs font-semibold text-navy-900 md:block"><span className="mr-2 text-[10px] font-normal uppercase tracking-wide text-slate-400 md:hidden">Payments</span>{payments.length} {payments.length === 1 ? "payment" : "payments"}</div><div className="flex items-center justify-between md:block"><span className="mr-2 text-[10px] uppercase tracking-wide text-slate-400 md:hidden">Latest</span>{latest ? <StatusBadge status={latest.status} /> : <span className="text-xs text-slate-400">No activity</span>}</div><div className="flex justify-end"><Button variant="ghost" size="sm" onClick={onView}>View profile <ChevronRight className="h-3.5 w-3.5" /></Button></div></div>;
}

function PayerDetails({ student, payments, onViewPayments }: { student: Student; payments: PaymentRecord[]; onViewPayments: () => void }) {
  const total = payments.filter((payment) => payment.status === "Approved").reduce((sum, payment) => sum + payment.amount, 0);
  const schoolDetails = `${student.schoolLevel} · ${student.yearLevel}${student.strand ? ` · ${student.strand}` : ""}${student.course ? ` · ${student.course}` : ""}`;
  return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 rounded-2xl bg-mist p-4 sm:flex-row sm:items-center"><div className="flex min-w-0 items-center gap-3"><Avatar initials={student.avatar} color="#163A63" size="lg" /><div className="min-w-0"><p className="break-words text-sm font-extrabold text-navy-900">{student.name}</p><p className="mt-1 break-words text-xs text-slate-500">{schoolDetails}</p></div></div><div className="text-left sm:text-right"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Approved total</p><p className="mt-1 text-lg font-extrabold text-navy-900">{formatCurrency(total)}</p></div></div><div className="grid gap-4 sm:grid-cols-2"><Info label="Email" value={student.email} icon={Mail} /><Info label="Payment count" value={String(payments.length)} icon={WalletCards} /></div><div><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Payment history</p><h3 className="mt-1 text-sm font-extrabold text-navy-900">Recent activity</h3></div><Button size="sm" variant="outline" onClick={onViewPayments}>Open in payments</Button></div>{payments.length ? <div className="divide-y divide-line rounded-2xl border border-line">{[...payments].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).map((payment) => <div key={payment.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words text-xs font-bold text-navy-900">{payment.offeringName}</p><p className="mt-1 break-words text-[10px] text-slate-400">{payment.reference} · {formatDateTime(payment.submittedAt)}</p></div><div className="flex items-center justify-between gap-4 sm:justify-end"><span className="text-xs font-extrabold text-navy-900">{formatCurrency(payment.amount)}</span><StatusBadge status={payment.status} /></div></div>)}</div> : <p className="rounded-xl bg-mist p-4 text-xs text-slate-500">No payment history yet.</p>}</div></div>;
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Mail }) {
  return <div className="flex min-w-0 items-center gap-3 rounded-xl border border-line p-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-700"><Icon className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1 break-words text-xs font-bold text-navy-900 [overflow-wrap:anywhere]">{value}</p></div></div>;
}

function AdminStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="min-w-0 p-3 sm:p-5"><p className="break-words text-[9px] font-bold uppercase tracking-[0.1em] text-slate-400 sm:text-[10px] sm:tracking-[0.12em]">{label}</p><p className="mt-2 text-xl font-extrabold tracking-tight text-navy-900 sm:mt-3 sm:text-2xl">{value}</p><p className="mt-1 break-words text-[10px] text-slate-400 sm:text-[11px]">{detail}</p></Card>;
}
