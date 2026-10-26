import { useState } from "react";
import { ArrowRight, CheckCircle2, CreditCard, LockKeyhole, ShieldCheck, Sparkles, Ticket } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { DemoBadge } from "../components/StatusBadge";
import { Avatar, Button, Card, FieldLabel, Select } from "../components/ui";
import { OrganizationLogo } from "../components/OrganizationLogo";
import { useApp } from "../context/AppContext";
import { useToast } from "../components/Toast";
import { BRANDING } from "../lib/branding";

export function LoginPage() {
  const { data, login } = useApp();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState(data.students[0]?.id ?? "");

  const signInAsStudent = () => {
    const student = data.students.find((item) => item.id === studentId) ?? data.students[0];
    if (!student) return;
    login({ role: "student", studentId: student.id });
    pushToast({ tone: "success", title: `Welcome, ${student.name.split(" ")[0]}`, message: "You are using a local student demo account." });
    navigate("/student/dashboard");
  };

  const signInAsAdmin = () => {
    login({ role: "admin" });
    pushToast({ tone: "success", title: "Admin demo opened", message: "Review tools are ready with sample payment records." });
    navigate("/admin/payers");
  };

  return (
    <main className="min-h-screen bg-mist lg:grid lg:grid-cols-[minmax(420px,0.9fr)_1.1fr]">
      <section className="relative hidden overflow-hidden bg-navy-900 px-10 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div className="absolute -right-32 -top-36 h-[28rem] w-[28rem] rounded-full border border-white/10" />
        <div className="absolute -bottom-48 -left-32 h-[32rem] w-[32rem] rounded-full border border-white/10" />
        <div className="relative">
          <OrganizationLogo surface="dark" />
          <div className="mt-24 max-w-lg xl:mt-32"><DemoBadge /><h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-[-0.04em] xl:text-5xl">A calmer way to manage school event payments.</h1><p className="mt-6 max-w-md text-sm leading-7 text-blue-100/70">Submit a payment once, follow its review status, and receive a demo-ready ticket without leaving the student portal.</p></div>
        </div>
        <div className="relative grid max-w-lg grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><CreditCard className="h-5 w-5 text-blue-200" /><p className="mt-5 text-xs font-bold">Simple checkout</p><p className="mt-1 text-[10px] leading-4 text-blue-100/50">Cashless or cashier submission</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><Ticket className="h-5 w-5 text-emerald-300" /><p className="mt-5 text-xs font-bold">QR ticket</p><p className="mt-1 text-[10px] leading-4 text-blue-100/50">Generated after review</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"><LockKeyhole className="h-5 w-5 text-amber-300" /><p className="mt-5 text-xs font-bold">Local only</p><p className="mt-1 text-[10px] leading-4 text-blue-100/50">No accounts or APIs</p></div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-lg">
          <div className="mb-8 flex items-center justify-between lg:hidden"><OrganizationLogo surface="light" /><DemoBadge /></div>
          <div className="mb-8"><p className="text-xs font-bold uppercase tracking-[0.16em] text-navy-700">{BRANDING.fullOrganization}</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.035em] text-navy-900">Enter the demo workspace.</h2><p className="mt-3 text-sm leading-6 text-slate-500">Choose a role below. No password, account, or external service is needed for this prototype.</p></div>
          <Card className="p-5 sm:p-7">
            <div className="flex items-center gap-2 border-b border-line pb-4"><Sparkles className="h-4 w-4 text-amber-500" /><p className="text-xs font-bold text-navy-900">Student demo login</p><span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Fast access</span></div>
            <div className="mt-5"><FieldLabel>Select a sample student</FieldLabel><Select value={studentId} onChange={(event) => setStudentId(event.target.value)}>{data.students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.yearLevel}</option>)}</Select></div>
            {data.students.find((student) => student.id === studentId) ? <div className="mt-4 flex items-center gap-3 rounded-xl bg-mist p-3"><Avatar initials={data.students.find((student) => student.id === studentId)?.avatar ?? "ST"} color="#0e9f78" size="sm" /><div className="min-w-0"><p className="text-xs font-bold text-navy-900">{data.students.find((student) => student.id === studentId)?.email}</p><p className="mt-0.5 text-[10px] text-slate-500">Mock identity · stored locally</p></div><CheckCircle2 className="ml-auto h-4 w-4 shrink-0 text-mint" /></div> : null}
            <Button className="mt-5 w-full" size="lg" onClick={signInAsStudent}>Continue as student <ArrowRight className="h-4 w-4" /></Button>
          </Card>

          <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-line" /><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">or</span><span className="h-px flex-1 bg-line" /></div>

          <Card className="p-5 sm:p-7">
            <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50 text-navy-800"><ShieldCheck className="h-5 w-5" /></span><div><p className="text-sm font-bold text-navy-900">Admin operations demo</p><p className="mt-1 text-xs text-slate-500">Review payers, payments, and collection settings.</p></div></div>
            <Button className="mt-5 w-full" variant="outline" size="lg" onClick={signInAsAdmin}>Open admin workspace <ArrowRight className="h-4 w-4" /></Button>
          </Card>

          <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><p className="text-[11px] leading-5 text-amber-800"><strong>Prototype notice:</strong> this demo uses mock authentication and localStorage. Never enter real banking credentials or payment screenshots.</p></div>
          <p className="mt-6 text-center text-[11px] text-slate-400">{BRANDING.organization} · localhost prototype · No real ticket validity</p>
        </div>
      </section>
    </main>
  );
}
