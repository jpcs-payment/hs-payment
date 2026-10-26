import { useState } from "react";
import { Check, Coins, Layers3, Plus, Save, Settings2, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { Button, Card, Dialog, FieldLabel, Input, Textarea } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../components/Toast";
import { formatCurrency } from "../../lib/utils";
import type { NewPaymentOfferingInput, PaymentAllocation, PaymentMethod, PaymentOffering, SchoolLevel } from "../../types";

const methods: PaymentMethod[] = ["Cash", "GCash", "MariBank"];
const schoolLevels: SchoolLevel[] = ["Junior High School", "Senior High School", "College"];

type OfferingDraft = NewPaymentOfferingInput & { id?: string };

const emptyDraft = (): OfferingDraft => ({
  slug: "",
  name: "",
  description: "",
  amount: 60,
  active: true,
  availableMethods: [...methods],
  applicableSchoolLevels: [...schoolLevels],
  allocations: [{ recipient: "JPCS", amount: 60 }],
});

export function OfferingsPage() {
  const { data, createOffering, saveOffering } = useApp();
  const { pushToast } = useToast();
  const [draft, setDraft] = useState<OfferingDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const openNew = () => setDraft(emptyDraft());
  const openEdit = (offering: PaymentOffering) => setDraft({ ...offering });

  const updateDraft = <K extends keyof OfferingDraft>(key: K, value: OfferingDraft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const updateAmount = (value: string) => {
    const amount = Number(value);
    setDraft((current) => current ? { ...current, amount: Number.isFinite(amount) ? amount : 0 } : current);
  };

  const updateAllocation = (index: number, value: Partial<PaymentAllocation>) => {
    setDraft((current) => {
      if (!current) return current;
      const allocations = current.allocations.map((allocation, allocationIndex) => allocationIndex === index ? { ...allocation, ...value } : allocation);
      return { ...current, allocations };
    });
  };

  const addAllocation = () => setDraft((current) => current ? { ...current, allocations: [...current.allocations, { recipient: "", amount: 0 }] } : current);
  const removeAllocation = (index: number) => setDraft((current) => current && current.allocations.length > 1 ? { ...current, allocations: current.allocations.filter((_, allocationIndex) => allocationIndex !== index) } : current);

  const toggleValue = <T extends string>(key: "availableMethods" | "applicableSchoolLevels", value: T) => {
    setDraft((current) => {
      if (!current) return current;
      const values = current[key] as T[];
      const next = values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
      return { ...current, [key]: next } as OfferingDraft;
    });
  };

  const save = async () => {
    if (!draft) return;
    const cleanAllocations = draft.allocations.map((allocation) => ({ recipient: allocation.recipient.trim(), amount: Number(allocation.amount) }));
    const allocationTotal = cleanAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    const slug = draft.slug.trim().toLowerCase().replace(/\s+/g, "-");
    if (!draft.name.trim() || !slug || !draft.description.trim()) {
      pushToast({ tone: "error", title: "Complete the offering details", message: "Name, slug, and description are required." });
      return;
    }
    if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
      pushToast({ tone: "error", title: "Invalid amount", message: "The amount must be greater than zero." });
      return;
    }
    if (!draft.availableMethods.length || !draft.applicableSchoolLevels.length) {
      pushToast({ tone: "error", title: "Choose availability", message: "Select at least one payment method and school level." });
      return;
    }
    if (cleanAllocations.some((allocation) => !allocation.recipient || !Number.isFinite(allocation.amount) || allocation.amount <= 0)) {
      pushToast({ tone: "error", title: "Invalid allocations", message: "Each allocation needs a recipient and a positive amount." });
      return;
    }
    if (new Set(cleanAllocations.map((allocation) => allocation.recipient.toLowerCase())).size !== cleanAllocations.length) {
      pushToast({ tone: "error", title: "Duplicate destinations", message: "Use each allocation recipient only once." });
      return;
    }
    if (Math.round(allocationTotal * 100) !== Math.round(draft.amount * 100)) {
      pushToast({ tone: "error", title: "Allocation total does not match", message: `Allocations total ${formatCurrency(allocationTotal)} but the offering is ${formatCurrency(draft.amount)}.` });
      return;
    }

    setSaving(true);
    try {
      const input = { ...draft, slug, name: draft.name.trim(), description: draft.description.trim(), allocations: cleanAllocations };
      if (draft.id) await saveOffering(input as PaymentOffering);
      else await createOffering(input);
      setDraft(null);
      pushToast({ tone: "success", title: draft.id ? "Offering updated" : "Payment offering added", message: "The public payment form is using the new settings." });
    } catch (error) {
      pushToast({ tone: "error", title: "Could not save offering", message: error instanceof Error ? error.message : "Try again." });
    } finally {
      setSaving(false);
    }
  };

  return <div className="mx-auto max-w-[1280px] space-y-6"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Payment catalog</p><h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-navy-900 sm:text-3xl">Payment offerings</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Create event fees such as Film Showing or Bootcamp and decide who can pay and where the amount is allocated.</p></div><Button onClick={openNew}><Plus className="h-4 w-4" /> Add payment</Button></div><section className="grid gap-4 sm:grid-cols-3"><CatalogStat label="Total offerings" value={data.offerings.length} icon={Layers3} /><CatalogStat label="Active offerings" value={data.offerings.filter((offering) => offering.active).length} icon={Check} /><CatalogStat label="Allocation rules" value={data.offerings.reduce((total, offering) => total + offering.allocations.length, 0)} icon={Coins} /></section>{data.offerings.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.offerings.map((offering, index) => <OfferingCard key={offering.id} offering={offering} index={index} onEdit={() => openEdit(offering)} />)}</div> : <Card className="p-10 text-center"><p className="text-sm font-bold text-navy-900">No payment offerings yet</p><p className="mt-2 text-xs text-slate-500">Add the first event fee to make it available on the public form.</p></Card>}<Dialog open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? "Edit payment offering" : "Add payment offering"} description="Set the amount, availability, and exact allocation destinations." size="xl">{draft ? <OfferingForm draft={draft} updateDraft={updateDraft} updateAmount={updateAmount} updateAllocation={updateAllocation} addAllocation={addAllocation} removeAllocation={removeAllocation} toggleValue={toggleValue} onCancel={() => setDraft(null)} onSave={save} saving={saving} /> : null}</Dialog></div>;
}

function OfferingForm({ draft, updateDraft, updateAmount, updateAllocation, addAllocation, removeAllocation, toggleValue, onCancel, onSave, saving }: { draft: OfferingDraft; updateDraft: <K extends keyof OfferingDraft>(key: K, value: OfferingDraft[K]) => void; updateAmount: (value: string) => void; updateAllocation: (index: number, value: Partial<PaymentAllocation>) => void; addAllocation: () => void; removeAllocation: (index: number) => void; toggleValue: <T extends string>(key: "availableMethods" | "applicableSchoolLevels", value: T) => void; onCancel: () => void; onSave: () => void; saving: boolean }) {
  return <div className="space-y-6"><div className="grid gap-5 md:grid-cols-2"><div><FieldLabel required>Payment name</FieldLabel><Input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="JPCS Bootcamp" /></div><div><FieldLabel required>Slug</FieldLabel><Input value={draft.slug} onChange={(event) => updateDraft("slug", event.target.value)} placeholder="bootcamp" /><p className="mt-1.5 text-[11px] text-slate-400">Use a unique lowercase identifier.</p></div><div><FieldLabel required>Amount</FieldLabel><Input type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => updateAmount(event.target.value)} /></div><div className="flex items-end"><button type="button" className={`flex h-11 w-full items-center justify-between rounded-xl border px-3.5 text-sm font-bold transition ${draft.active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-line bg-slate-50 text-slate-500"}`} onClick={() => updateDraft("active", !draft.active)}><span>{draft.active ? "Visible on public form" : "Hidden from public form"}</span>{draft.active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}</button></div></div><div><FieldLabel required>Description</FieldLabel><Textarea value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="Admission payment for the JPCS Bootcamp." /></div><div><FieldLabel required>Payment methods</FieldLabel><div className="grid gap-2 sm:grid-cols-3">{methods.map((method) => <ToggleChoice key={method} label={method} selected={draft.availableMethods.includes(method)} onClick={() => toggleValue("availableMethods", method)} />)}</div></div><div><FieldLabel required>Available for school levels</FieldLabel><div className="grid gap-2 sm:grid-cols-3">{schoolLevels.map((level) => <ToggleChoice key={level} label={level} selected={draft.applicableSchoolLevels.includes(level)} onClick={() => toggleValue("applicableSchoolLevels", level)} />)}</div></div><div className="rounded-2xl border border-line bg-mist p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><FieldLabel required>Allocation destinations</FieldLabel><p className="text-xs leading-5 text-slate-500">Use peso amounts. The total must equal {formatCurrency(draft.amount || 0)}.</p></div><Button type="button" size="sm" variant="outline" onClick={addAllocation}><Plus className="h-3.5 w-3.5" /> Add destination</Button></div><div className="mt-4 space-y-3">{draft.allocations.map((allocation, index) => <div key={`${index}-${allocation.recipient}`} className="flex flex-col gap-2 sm:flex-row"><Input className="min-w-0 flex-1" value={allocation.recipient} onChange={(event) => updateAllocation(index, { recipient: event.target.value })} placeholder="Recipient, e.g. JPCS" aria-label={`Allocation recipient ${index + 1}`} /><div className="flex gap-2 sm:w-44"><Input className="min-w-0 flex-1" type="number" min="0.01" step="0.01" value={allocation.amount} onChange={(event) => updateAllocation(index, { amount: Number(event.target.value) })} aria-label={`Allocation amount ${index + 1}`} /><button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-coral transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => removeAllocation(index)} disabled={draft.allocations.length === 1} aria-label={`Remove allocation ${index + 1}`}><Trash2 className="h-4 w-4" /></button></div></div>)}</div><div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs"><span className="font-semibold text-slate-500">Allocation total</span><span className={`font-extrabold ${Math.round(draft.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0) * 100) === Math.round(draft.amount * 100) ? "text-mint" : "text-coral"}`}>{formatCurrency(draft.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0))}</span></div></div><div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="button" loading={saving} onClick={onSave}><Save className="h-4 w-4" /> Save offering</Button></div></div>;
}

function ToggleChoice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 text-left text-xs font-bold transition ${selected ? "border-navy-700 bg-navy-900 text-white" : "border-line bg-white text-slate-500 hover:border-navy-300 hover:bg-navy-50"}`} onClick={onClick}><span className="break-words">{label}</span><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-white/50 bg-white/15" : "border-slate-200"}`}>{selected ? <Check className="h-3 w-3" /> : null}</span></button>;
}

function OfferingCard({ offering, index, onEdit }: { offering: PaymentOffering; index: number; onEdit: () => void }) {
  const gradients = ["from-navy-900 via-navy-800 to-blue-700", "from-emerald-900 via-teal-800 to-navy-800", "from-indigo-950 via-navy-800 to-slate-700"];
  return <Card className={`group relative overflow-hidden border-0 bg-gradient-to-br ${gradients[index % gradients.length]} p-5 text-white shadow-float transition duration-300 motion-safe:hover:-translate-y-1`}><div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full border-[18px] border-white/10" /><div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/5" /><div className="relative flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-100/60">{offering.active ? "Active offering" : "Hidden offering"}</p><h3 className="mt-2 break-words text-lg font-extrabold">{offering.name}</h3></div><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10"><Coins className="h-5 w-5 text-blue-100" /></span></div><p className="relative mt-5 text-3xl font-extrabold">{formatCurrency(offering.amount)}</p><p className="relative mt-2 min-h-10 break-words text-xs leading-5 text-blue-100/70">{offering.description}</p><div className="relative mt-5 flex flex-wrap gap-1.5">{offering.applicableSchoolLevels.map((level) => <span key={level} className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-blue-50">{level === "Junior High School" ? "JHS" : level === "Senior High School" ? "SHS" : level}</span>)}</div><div className="relative mt-5 border-t border-white/10 pt-4"><div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-blue-100/70">{offering.allocations.map((allocation) => <span key={allocation.recipient}>{allocation.recipient}: {formatCurrency(allocation.amount)}</span>)}</div><Button className="mt-4 w-full border-white/20 bg-white/10 text-white hover:bg-white/20" variant="outline" size="sm" onClick={onEdit}><Settings2 className="h-3.5 w-3.5" /> Configure</Button></div></Card>;
}

function CatalogStat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Check }) {
  return <Card className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-3 text-2xl font-extrabold text-navy-900">{String(value).padStart(2, "0")}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-50 text-navy-700"><Icon className="h-4 w-4" /></span></div></Card>;
}
