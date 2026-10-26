import { Code2, ExternalLink, Heart, ShieldCheck, Sparkles } from "lucide-react";
import { Card, Avatar, Button } from "../../components/ui";
import { DemoBadge } from "../../components/StatusBadge";
import { useApp } from "../../context/AppContext";
import { BRANDING } from "../../lib/branding";

export function DevelopersPage() {
  const { data } = useApp();
  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
      <section className="rounded-3xl bg-navy-900 px-6 py-8 text-white shadow-float sm:px-8 sm:py-10"><div className="flex max-w-3xl items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-blue-200"><Code2 className="h-6 w-6" /></span><div><div className="flex flex-wrap items-center gap-2"><DemoBadge /><span className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-100/50">Build credits</span></div><h2 className="mt-4 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">Built for a smoother school event day.</h2><p className="mt-4 max-w-2xl text-sm leading-7 text-blue-100/70">{BRANDING.systemName} is a local prototype for {BRANDING.fullOrganization}, exploring how student payments, administrative review, and event tickets can live in one focused experience.</p></div></div></section>
      <section className="grid gap-4 md:grid-cols-3">{data.developers.map((developer) => <Card key={developer.id} className="p-5"><div className="flex items-center justify-between"><Avatar initials={developer.initials} color={developer.color} size="lg" /><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-mist text-slate-400"><Sparkles className="h-4 w-4" /></span></div><h3 className="mt-5 text-sm font-extrabold text-navy-900">{developer.name}</h3><p className="mt-1 text-xs font-semibold text-navy-700">{developer.role}</p><p className="mt-4 text-xs leading-5 text-slate-500">{developer.bio}</p></Card>)}</section>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"><Card className="p-6"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-mint"><ShieldCheck className="h-5 w-5" /></span><div><h3 className="text-sm font-extrabold text-navy-900">Prototype principles</h3><p className="mt-1 text-xs text-slate-500">The guardrails behind this demo</p></div></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Principle title="Local by default" text="Data stays in your browser so the workflow can be tested without a backend or credentials." /><Principle title="Review before release" text="Tickets are never generated until an admin explicitly approves a payment." /><Principle title="Clear status" text="Every payment carries a visible state and, when needed, a next step for the student." /><Principle title="Designed to extend" text="Mock offerings, methods, and developer details are centralized for future editing." /></div></Card><Card className="flex flex-col justify-between bg-mist p-6"><div><Heart className="h-5 w-5 text-coral" /><h3 className="mt-5 text-lg font-extrabold tracking-tight text-navy-900">Thanks for exploring.</h3><p className="mt-3 text-sm leading-6 text-slate-500">This screen is sample content for the school community and product team. The names and payment details in this prototype are fictional.</p></div><Button className="mt-8 w-full" variant="outline" onClick={() => window.alert("This is a local demo. No external links are configured.")}>Prototype notes <ExternalLink className="h-4 w-4" /></Button></Card></div>
      <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800"><strong>Demo-only reminder:</strong> payment screenshots, account details, receipts, and tickets shown in this project are fictional. localStorage and mock authentication are not secure for production use.</p>
    </div>
  );
}

function Principle({ title, text }: { title: string; text: string }) {
  return <div className="rounded-2xl border border-line bg-slate-50/60 p-4"><p className="text-xs font-bold text-navy-900">{title}</p><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p></div>;
}
