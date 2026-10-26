import { useState } from "react";
import { Check, Coins, Download, Layers3, Plus, Save, Settings2, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Button, Card, ConfirmDialog, Dialog, FieldLabel, Input, Textarea } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../components/Toast";
import { createId, formatCurrency, formatManilaDateTime } from "../../lib/utils";
import { downloadCsv } from "../../lib/export";
import type { NewPaymentOfferingInput, PaymentAllocation, PaymentMethod, PaymentOffering, SchoolLevel } from "../../types";

const methods: PaymentMethod[] = ["Cash", "GCash", "MariBank"];
const schoolLevels: SchoolLevel[] = ["Junior High School", "Senior High School", "College"];

type EditableAmount = number;
type EditableAllocation = Omit<PaymentAllocation, "amount"> & { amount: EditableAmount; draftId: string };
type OfferingDraft = Omit<NewPaymentOfferingInput, "amount" | "allocations"> & { id?: string; amount: EditableAmount; allocations: EditableAllocation[] };

const toDraftAllocations = (allocations: PaymentAllocation[]): EditableAllocation[] => allocations.map((allocation) => ({ ...allocation, draftId: createId("allocation") }));
const toOfferingDraft = (offering: PaymentOffering): OfferingDraft => ({ ...offering, allocations: toDraftAllocations(offering.allocations) });

const emptyDraft = (): OfferingDraft => ({
  slug: "",
  name: "",
  description: "",
  amount: 60,
  active: true,
  availableMethods: [...methods],
  applicableSchoolLevels: [...schoolLevels],
  allocations: [{ recipient: "JPCS", amount: 60, draftId: createId("allocation") }],
  payLaterMethods: [],
  payLaterDeadlineAt: undefined,
});

const toLocalDateTimeInput = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

function LegacyOfferingsPage() {
  const { data, createOffering, saveOffering, archiveOffering } = useApp();
  const { pushToast } = useToast();
  const [draft, setDraft] = useState<OfferingDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  const updateDraft = <K extends keyof OfferingDraft>(key: K, value: OfferingDraft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const toggleAvailability = (method: PaymentMethod) => {
    setDraft((current) => {
      if (!current) return current;
      const enabled = current.availableMethods.includes(method);
      const availableMethods = enabled ? current.availableMethods.filter((item) => item !== method) : [...current.availableMethods, method];
      return { ...current, availableMethods, payLaterMethods: availableMethods.includes(method) ? current.payLaterMethods : current.payLaterMethods.filter((item) => item !== method) };
    });
  };

  const toggleSchoolLevel = (level: SchoolLevel) => {
    setDraft((current) => {
      if (!current) return current;
      const values = current.applicableSchoolLevels;
      return { ...current, applicableSchoolLevels: values.includes(level) ? values.filter((item) => item !== level) : [...values, level] };
    });
  };

  const togglePayLater = (method: PaymentMethod) => {
    setDraft((current) => {
      if (!current || !current.availableMethods.includes(method)) return current;
      const values = current.payLaterMethods;
      return { ...current, payLaterMethods: values.includes(method) ? values.filter((item) => item !== method) : [...values, method] };
    });
  };

  const parseEditableAmount = (value: string): EditableAmount => {
    if (value === "") return Number.NaN;
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : Number.NaN;
  };

  const updateAmount = (value: string) => {
    setDraft((current) => current ? { ...current, amount: parseEditableAmount(value) } : current);
  };

  const updateAllocation = (index: number, value: Partial<EditableAllocation>) => {
    setDraft((current) => current ? { ...current, allocations: current.allocations.map((allocation, allocationIndex) => allocationIndex === index ? { ...allocation, ...value } : allocation) } : current);
  };

  const addAllocation = () => setDraft((current) => current ? { ...current, allocations: [...current.allocations, { recipient: "", amount: 0, draftId: createId("allocation") }] } : current);
  const removeAllocation = (index: number) => setDraft((current) => current && current.allocations.length > 1 ? { ...current, allocations: current.allocations.filter((_, allocationIndex) => allocationIndex !== index) } : current);

  const save = async () => {
    if (!draft) return;
    const amount = Number(draft.amount);
    const cleanAllocations = draft.allocations.map((allocation) => ({ recipient: allocation.recipient.trim(), amount: Number(allocation.amount) }));
    const allocationTotal = cleanAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    const slug = draft.slug.trim().toLowerCase().replace(/\s+/g, "-");
    const deadline = draft.payLaterDeadlineAt;
    if (!draft.name.trim() || !slug || !draft.description.trim()) {
      pushToast({ tone: "error", title: "Complete the payment type details", message: "Name, slug, and description are required." });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      pushToast({ tone: "error", title: "Invalid amount", message: "The amount must be greater than zero." });
      return;
    }
    if (!draft.availableMethods.length || !draft.applicableSchoolLevels.length) {
      pushToast({ tone: "error", title: "Choose availability", message: "Select at least one payment method and school level." });
      return;
    }
    if (draft.payLaterMethods.some((method) => !draft.availableMethods.includes(method))) {
      pushToast({ tone: "error", title: "Invalid Pay Later methods", message: "Pay Later can only be enabled for available payment methods." });
      return;
    }
    if (draft.payLaterMethods.length) {
      if (!deadline || Number.isNaN(new Date(deadline).getTime()) || new Date(deadline).getTime() <= Date.now()) {
        pushToast({ tone: "error", title: "Set a future deadline", message: "Pay Later needs a future deadline. The time is saved in Asia/Manila." });
        return;
      }
    }
    if (cleanAllocations.some((allocation) => !allocation.recipient || !Number.isFinite(allocation.amount) || allocation.amount <= 0)) {
      pushToast({ tone: "error", title: "Invalid allocations", message: "Each allocation needs a recipient and a positive amount." });
      return;
    }
    if (new Set(cleanAllocations.map((allocation) => allocation.recipient.toLowerCase())).size !== cleanAllocations.length) {
      pushToast({ tone: "error", title: "Duplicate destinations", message: "Use each allocation recipient only once." });
      return;
    }
    if (Math.round(allocationTotal * 100) !== Math.round(amount * 100)) {
      pushToast({ tone: "error", title: "Allocation total does not match", message: `Allocations total ${formatCurrency(allocationTotal)} but the payment type is ${formatCurrency(amount)}.` });
      return;
    }

    setSaving(true);
    try {
      const input = { ...draft, slug, name: draft.name.trim(), description: draft.description.trim(), amount, allocations: cleanAllocations, payLaterDeadlineAt: draft.payLaterMethods.length ? deadline : undefined };
      if (draft.id) await saveOffering(input as PaymentOffering);
      else await createOffering(input);
      setDraft(null);
      pushToast({ tone: "success", title: draft.id ? "Payment type updated" : "Payment type added", message: "The public payment form is using the new settings." });
    } catch (error) {
      pushToast({ tone: "error", title: "Could not save payment type", message: error instanceof Error ? error.message : "Try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveId) return;
    setArchiveLoading(true);
    try {
      await archiveOffering(archiveId);
      setArchiveId(null);
      pushToast({ tone: "success", title: "Payment type archived", message: "It is hidden from active lists and the public payment form." });
    } catch (error) {
      pushToast({ tone: "error", title: "Could not archive payment type", message: error instanceof Error ? error.message : "Try again." });
    } finally {
      setArchiveLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
         <div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Payment catalog</p><h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-navy-900 sm:text-3xl">Payment types</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Create payment types, choose who can pay, and optionally accept Pay Later reservations.</p></div>
        <Button onClick={() => setDraft(emptyDraft())}><Plus className="h-4 w-4" /> Add payment</Button>
      </div>
       <section className="grid gap-4 sm:grid-cols-3"><CatalogStat label="Total types" value={data.offerings.filter((offering) => !offering.archivedAt).length} icon={Layers3} /><CatalogStat label="Active types" value={data.offerings.filter((offering) => offering.active && !offering.archivedAt).length} icon={Check} /><CatalogStat label="Allocation rules" value={data.offerings.filter((offering) => !offering.archivedAt).reduce((total, offering) => total + offering.allocations.length, 0)} icon={Coins} /></section>
         {data.offerings.filter((offering) => !offering.archivedAt).length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.offerings.filter((offering) => !offering.archivedAt).map((offering, index) => <div key={offering.id} className="relative"><PaymentTypeCard offering={offering} index={index} onEdit={() => setDraft(toOfferingDraft(offering))} /><button type="button" className="absolute bottom-5 left-5 rounded-lg px-2 py-1 text-[10px] font-bold text-white/60 transition hover:bg-white/10 hover:text-white" onClick={() => setArchiveId(offering.id)}>Archive</button></div>)}</div> : <Card className="p-10 text-center"><p className="text-sm font-bold text-navy-900">No payment types yet</p><p className="mt-2 text-xs text-slate-500">Add the first payment type to make it available on the public form.</p></Card>}
       <Dialog open={Boolean(draft)} onClose={() => setDraft(null)} title={draft?.id ? "Edit payment type" : "Add payment type"} description="Set the amount, availability, Pay Later deadline, and allocation destinations." size="xl">
         {draft ? <OfferingForm draft={draft} updateDraft={updateDraft} updateAmount={updateAmount} updateAllocation={updateAllocation} addAllocation={addAllocation} removeAllocation={removeAllocation} toggleAvailability={toggleAvailability} toggleSchoolLevel={toggleSchoolLevel} togglePayLater={togglePayLater} onCancel={() => setDraft(null)} onSave={save} saving={saving} /> : null}
       </Dialog>
       <ConfirmDialog open={Boolean(archiveId)} onClose={() => setArchiveId(null)} onConfirm={() => void handleArchive()} title="Archive payment type?" description="This hides the payment type from active admin lists and the public payment form. Existing payment records remain unchanged." confirmLabel="Archive payment type" danger loading={archiveLoading} />
     </div>
  );
}

export function OfferingsPage() {
  const { data } = useApp();
  const activeOfferings = data.offerings.filter((offering) => !offering.archivedAt);
  const exportTypes = () => downloadCsv(`jpcs-payment-types-${new Date().toISOString().slice(0, 10)}.csv`, ["Type", "Slug", "Description", "Amount", "Active", "Payment methods", "Pay Later methods", "Applicable school levels", "Deadline"], activeOfferings.map((offering) => [offering.name, offering.slug, offering.description, offering.amount, offering.active ? "Yes" : "No", offering.availableMethods.join(" | "), offering.payLaterMethods.join(" | "), offering.applicableSchoolLevels.join(" | "), offering.payLaterDeadlineAt]));
  return <div className="space-y-4"><div className="flex justify-end"><Button size="sm" variant="outline" onClick={exportTypes} disabled={!activeOfferings.length}><Download className="h-3.5 w-3.5" /> Export CSV</Button></div><LegacyOfferingsPage /></div>;
}

function OfferingForm({ draft, updateDraft, updateAmount, updateAllocation, addAllocation, removeAllocation, toggleAvailability, toggleSchoolLevel, togglePayLater, onCancel, onSave, saving }: { draft: OfferingDraft; updateDraft: <K extends keyof OfferingDraft>(key: K, value: OfferingDraft[K]) => void; updateAmount: (value: string) => void; updateAllocation: (index: number, value: Partial<EditableAllocation>) => void; addAllocation: () => void; removeAllocation: (index: number) => void; toggleAvailability: (method: PaymentMethod) => void; toggleSchoolLevel: (level: SchoolLevel) => void; togglePayLater: (method: PaymentMethod) => void; onCancel: () => void; onSave: () => void; saving: boolean }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <div><FieldLabel required>Payment name</FieldLabel><Input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="JPCS Bootcamp" /></div>
        <div><FieldLabel required>Slug</FieldLabel><Input value={draft.slug} onChange={(event) => updateDraft("slug", event.target.value)} placeholder="bootcamp" /><p className="mt-1.5 text-[11px] text-slate-400">Use a unique lowercase identifier.</p></div>
        <div><FieldLabel required>Amount</FieldLabel><Input type="number" min="0.01" step="0.01" value={draft.amount} onChange={(event) => updateAmount(event.target.value)} /></div>
        <div className="flex items-end"><button type="button" className={`flex h-11 w-full items-center justify-between rounded-xl border px-3.5 text-sm font-bold transition ${draft.active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-line bg-slate-50 text-slate-500"}`} onClick={() => updateDraft("active", !draft.active)}><span>{draft.active ? "Visible on public form" : "Hidden from public form"}</span>{draft.active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}</button></div>
      </div>
      <div><FieldLabel required>Description</FieldLabel><Textarea value={draft.description} onChange={(event) => updateDraft("description", event.target.value)} placeholder="Admission payment for the JPCS Bootcamp." /></div>
      <div><FieldLabel required>Payment methods</FieldLabel><div className="flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto pb-1">{methods.map((method) => <ToggleChoice key={method} label={method} selected={draft.availableMethods.includes(method)} onClick={() => toggleAvailability(method)} />)}</div></div>
      <div><FieldLabel required>Available for school levels</FieldLabel><div className="flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto pb-1">{schoolLevels.map((level) => <ToggleChoice key={level} label={level === "Junior High School" ? "JHS" : level === "Senior High School" ? "SHS" : "College"} title={level} selected={draft.applicableSchoolLevels.includes(level)} onClick={() => toggleSchoolLevel(level)} />)}</div></div>
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
         <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><FieldLabel>Pay Later options</FieldLabel><p className="text-xs leading-5 text-navy-800">Students receive an attendance QR immediately. Admins can scan it at the event while the reservation remains Not Paid Yet.</p></div><span className="rounded-full bg-white/70 px-2.5 py-1 text-[10px] font-bold text-navy-700">Optional</span></div>
        <div className="mt-4 flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto pb-1">{methods.map((method) => <ToggleChoice key={method} label={method} selected={draft.payLaterMethods.includes(method)} disabled={!draft.availableMethods.includes(method)} onClick={() => togglePayLater(method)} />)}</div>
        {draft.payLaterMethods.length ? <div className="mt-4 max-w-sm"><FieldLabel required>Pay Later deadline (Asia/Manila)</FieldLabel><Input type="datetime-local" value={toLocalDateTimeInput(draft.payLaterDeadlineAt)} onChange={(event) => updateDraft("payLaterDeadlineAt", event.target.value ? new Date(event.target.value).toISOString() : undefined)} /><p className="mt-1.5 text-[11px] text-navy-700">Reservations remain visible as overdue after this time; admins can still mark them paid.</p></div> : <p className="mt-3 text-[11px] text-navy-700">Enable at least one method to show the deadline input.</p>}
      </div>
       <div className="rounded-2xl border border-line bg-mist p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><FieldLabel required>Allocation destinations</FieldLabel><p className="text-xs leading-5 text-slate-500">Use peso amounts. The total must equal {formatCurrency(draft.amount || 0)}.</p></div><Button type="button" size="sm" variant="outline" onClick={addAllocation}><Plus className="h-3.5 w-3.5" /> Add destination</Button></div><div className="mt-4 space-y-3">{draft.allocations.map((allocation, index) => <div key={allocation.draftId} className="flex min-w-0 flex-col gap-2 sm:flex-row"><Input className="min-w-0 flex-1" value={allocation.recipient} onChange={(event) => updateAllocation(index, { recipient: event.target.value })} placeholder="Recipient, e.g. JPCS" aria-label={`Allocation recipient ${index + 1}`} /><div className="flex min-w-0 gap-2 sm:w-44"><Input className="min-w-0 flex-1" type="number" min="0.01" step="0.01" value={allocation.amount} onChange={(event) => updateAllocation(index, { amount: Number(event.target.value) })} aria-label={`Allocation amount ${index + 1}`} /><button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-coral transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => removeAllocation(index)} disabled={draft.allocations.length === 1} aria-label={`Remove allocation ${index + 1}`}><Trash2 className="h-4 w-4" /></button></div></div>)}</div><div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs"><span className="font-semibold text-slate-500">Allocation total</span><span className={`font-extrabold ${Math.round(draft.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0) * 100) === Math.round(draft.amount * 100) ? "text-mint" : "text-coral"}`}>{formatCurrency(draft.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0))}</span></div></div>
       <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="button" loading={saving} onClick={onSave}><Save className="h-4 w-4" /> Save payment type</Button></div>
    </div>
  );
}

function ToggleChoice({ label, title, selected, disabled = false, onClick }: { label: string; title?: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
  return <button type="button" title={title} aria-pressed={selected} disabled={disabled} className={`flex min-h-11 min-w-[118px] shrink-0 items-center justify-between gap-3 rounded-xl border px-3 text-left text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-navy-700 bg-navy-900 text-white shadow-[0_0_0_3px_rgba(96,165,250,0.18)]" : "border-line bg-white text-slate-500 hover:border-navy-300 hover:bg-navy-50"}`} onClick={onClick}><span className="min-w-0 break-words">{label}</span><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-white/50 bg-white/15" : "border-slate-200"}`}>{selected ? <Check className="h-3 w-3" /> : null}</span></button>;
}

function OfferingCard({ offering, index, onEdit }: { offering: PaymentOffering; index: number; onEdit: () => void }) {
  const gradients = ["from-navy-900 via-navy-800 to-blue-700", "from-emerald-900 via-teal-800 to-navy-800", "from-indigo-950 via-navy-800 to-slate-700"];
  return <Card className={`group relative overflow-hidden border-0 bg-gradient-to-br ${gradients[index % gradients.length]} p-5 text-white shadow-float transition duration-300 motion-safe:hover:-translate-y-1`}><div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full border-[18px] border-white/10" /><div className="pointer-events-none absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/5" /><div className="relative flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-100/60">{offering.active ? "Active offering" : "Hidden offering"}</p><h3 className="mt-2 break-words text-lg font-extrabold">{offering.name}</h3></div><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10"><Coins className="h-5 w-5 text-blue-100" /></span></div><p className="relative mt-5 text-3xl font-extrabold">{formatCurrency(offering.amount)}</p><p className="relative mt-2 min-h-10 break-words text-xs leading-5 text-blue-100/70">{offering.description}</p><div className="relative mt-5 flex flex-wrap gap-1.5">{offering.applicableSchoolLevels.map((level) => <span key={level} className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-blue-50">{level === "Junior High School" ? "JHS" : level === "Senior High School" ? "SHS" : level}</span>)}{offering.payLaterMethods.length ? <span className="rounded-full bg-amber-300/20 px-2 py-1 text-[10px] font-semibold text-amber-100">Pay Later · {offering.payLaterMethods.join("/")}</span> : null}</div><div className="relative mt-5 border-t border-white/10 pt-4"><div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-blue-100/70">{offering.allocations.map((allocation) => <span key={allocation.recipient}>{allocation.recipient}: {formatCurrency(allocation.amount)}</span>)}</div>{offering.payLaterDeadlineAt ? <p className="mt-2 text-[10px] font-semibold text-amber-100">Deadline: {formatManilaDateTime(offering.payLaterDeadlineAt)}</p> : null}<Button className="mt-4 w-full border-white/20 bg-white/10 text-white hover:bg-white/20" variant="outline" size="sm" onClick={onEdit}><Settings2 className="h-3.5 w-3.5" /> Configure</Button></div></Card>;
}

function CatalogStat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Check }) {
  return <Card className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-3 text-2xl font-extrabold text-navy-900">{String(value).padStart(2, "0")}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-50 text-navy-700"><Icon className="h-4 w-4" /></span></div></Card>;
}

function PaymentTypeCard({ offering, index, onEdit }: { offering: PaymentOffering; index: number; onEdit: () => void }) {
  const gradients = ["from-navy-900 via-navy-800 to-blue-700", "from-emerald-900 via-teal-800 to-navy-800", "from-indigo-950 via-navy-800 to-slate-700"];
  return <Card className={`group relative overflow-hidden border-0 bg-gradient-to-br ${gradients[index % gradients.length]} p-5 text-white shadow-float transition duration-300 motion-safe:hover:-translate-y-1`}><div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full border-[18px] border-white/10" /><div className="relative flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-100/60">{offering.active ? "Active payment type" : "Hidden payment type"}</p><h3 className="mt-2 break-words text-lg font-extrabold">{offering.name}</h3></div><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10"><Coins className="h-5 w-5 text-blue-100" /></span></div><p className="relative mt-5 text-3xl font-extrabold">{formatCurrency(offering.amount)}</p><p className="relative mt-2 min-h-10 break-words text-xs leading-5 text-blue-100/70">{offering.description}</p><div className="relative mt-5 flex flex-wrap gap-1.5">{offering.applicableSchoolLevels.map((level) => <span key={level} className="rounded-full bg-white/10 px-2 py-1 text-[10px] font-semibold text-blue-50">{level === "Junior High School" ? "JHS" : level === "Senior High School" ? "SHS" : level}</span>)}{offering.payLaterMethods.length ? <span className="rounded-full bg-amber-300/20 px-2 py-1 text-[10px] font-semibold text-amber-100">Pay Later · {offering.payLaterMethods.join("/")}</span> : null}</div><div className="relative mt-5 border-t border-white/10 pt-4"><div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-blue-100/70">{offering.allocations.map((allocation) => <span key={allocation.recipient}>{allocation.recipient}: {formatCurrency(allocation.amount)}</span>)}</div>{offering.payLaterDeadlineAt ? <p className="mt-2 text-[10px] font-semibold text-amber-100">Deadline: {formatManilaDateTime(offering.payLaterDeadlineAt)}</p> : null}</div><div className="relative mt-5 flex justify-end border-t border-white/10 pt-4"><Button variant="ghost" size="sm" className="border border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={onEdit}><Settings2 className="h-3.5 w-3.5" /> Edit type</Button></div></Card>;
}
