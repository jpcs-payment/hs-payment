import { Archive, Layers3, RotateCcw, UsersRound } from "lucide-react";
import { Button, Card } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../components/Toast";
import { formatDateTime } from "../../lib/utils";

export function ArchivePage() {
  const { data, restorePayer, restoreOffering } = useApp();
  const { pushToast } = useToast();
  const archivedPayers = data.students.filter((student) => student.archivedAt);
  const archivedTypes = data.offerings.filter((offering) => offering.archivedAt);

  const restore = async (kind: "payer" | "type", id: string) => {
    try {
      if (kind === "payer") await restorePayer(id);
      else await restoreOffering(id);
      pushToast({ tone: "success", title: `${kind === "payer" ? "Payer" : "Payment type"} restored`, message: "The record is visible in the active admin list again." });
    } catch (error) {
      pushToast({ tone: "error", title: "Could not restore record", message: error instanceof Error ? error.message : "Try again." });
    }
  };

  return <div className="mx-auto max-w-[1400px] space-y-6"><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-navy-50 text-navy-700"><Archive className="h-5 w-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Record management</p><h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-navy-900 sm:text-3xl">Archive</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Archived records are hidden from active lists and the public payment flow. Restore them whenever they are needed again.</p></div></div><ArchiveSection title="Archived payers" icon={UsersRound} empty="No archived payers." count={archivedPayers.length}>{archivedPayers.map((payer) => <div key={payer.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words text-sm font-bold text-navy-900">{payer.name}</p><p className="mt-1 break-words text-xs text-slate-500">{payer.email} · Archived {formatDateTime(payer.archivedAt ?? "")}</p><p className="mt-1 text-[11px] text-slate-400">{payer.schoolLevel} · {payer.yearLevel}</p></div><Button size="sm" variant="outline" onClick={() => void restore("payer", payer.id)}><RotateCcw className="h-3.5 w-3.5" /> Restore</Button></div>)}</ArchiveSection><ArchiveSection title="Archived payment types" icon={Layers3} empty="No archived payment types." count={archivedTypes.length}>{archivedTypes.map((offering) => <div key={offering.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="break-words text-sm font-bold text-navy-900">{offering.name}</p><p className="mt-1 break-words text-xs text-slate-500">{offering.slug} · Archived {formatDateTime(offering.archivedAt ?? "")}</p><p className="mt-1 text-[11px] text-slate-400">{offering.description}</p></div><Button size="sm" variant="outline" onClick={() => void restore("type", offering.id)}><RotateCcw className="h-3.5 w-3.5" /> Restore</Button></div>)}</ArchiveSection></div>;
}

function ArchiveSection({ title, icon: Icon, empty, count, children }: { title: string; icon: typeof Archive; empty: string; count: number; children: React.ReactNode }) {
  return <Card className="overflow-hidden"><div className="flex items-center justify-between gap-3 border-b border-line px-5 py-5 sm:px-6"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-50 text-navy-700"><Icon className="h-4 w-4" /></span><h3 className="text-base font-extrabold text-navy-900">{title}</h3></div><span className="rounded-full bg-mist px-2.5 py-1 text-[10px] font-bold text-slate-500">{count}</span></div>{count ? <div className="divide-y divide-line">{children}</div> : <p className="p-8 text-center text-sm text-slate-500">{empty}</p>}</Card>;
}
