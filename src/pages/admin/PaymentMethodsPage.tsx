import { useState, type ChangeEvent } from "react";
import { Banknote, Check, Download, ImagePlus, QrCode, Save, Settings2, ToggleLeft, ToggleRight, WalletCards, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Card, Button, Dialog, FieldLabel, Input, Textarea } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../components/Toast";
import { formatCurrency, methodAccent } from "../../lib/utils";
import { paymentMethodLogos } from "../../lib/paymentMethods";
import { downloadCsv, downloadPdf } from "../../lib/export";
import type { PaymentMethodConfig } from "../../types";

const methods = ["Cash", "GCash", "MariBank"] as const;

export function PaymentMethodsPage() {
  const { data, savePaymentMethod } = useApp();
  const { pushToast } = useToast();
  const [methodDraft, setMethodDraft] = useState<PaymentMethodConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const activeTypes = data.offerings.filter((item) => item.active && !item.archivedAt);
  const type = activeTypes[0];

  const toggleMethod = async (method: PaymentMethodConfig) => {
    try {
      await savePaymentMethod({ ...method, enabled: !method.enabled });
      pushToast({ tone: "success", title: `${method.id} ${method.enabled ? "disabled" : "enabled"}`, message: "The public payment form has been updated." });
    } catch (error) {
      pushToast({ tone: "error", title: "Could not update method", message: error instanceof Error ? error.message : "Try again." });
    }
  };

  const saveDraft = async () => {
    if (!methodDraft) return;
    if (!methodDraft.accountName.trim() || !methodDraft.accountNumber.trim() || !methodDraft.instructions.trim()) {
      pushToast({ tone: "error", title: "Complete the method details", message: "Account name, reference, and instructions are required." });
      return;
    }
    setLoading(true);
    try {
      await savePaymentMethod({ ...methodDraft, accountName: methodDraft.accountName.trim(), accountNumber: methodDraft.accountNumber.trim(), instructions: methodDraft.instructions.trim() });
      setMethodDraft(null);
      pushToast({ tone: "success", title: `${methodDraft.id} saved`, message: "The public form is using the updated details." });
    } catch (error) {
      pushToast({ tone: "error", title: "Could not save method", message: error instanceof Error ? error.message : "Try again." });
    } finally {
      setLoading(false);
    }
  };

  const methodExportHeaders = ["Method", "Enabled", "Account name", "Account number / reference", "Instructions", "QR configured"];
  const methodExportRows = data.paymentMethods.map((method) => [method.id, method.enabled ? "Yes" : "No", method.accountName, method.accountNumber, method.instructions, method.qrImage ? "Yes" : "No"]);
  const exportMethods = () => downloadCsv(`jpcs-payment-methods-${new Date().toISOString().slice(0, 10)}.csv`, methodExportHeaders, methodExportRows);
  const exportMethodsPdf = () => downloadPdf({ filename: `jpcs-payment-methods-${new Date().toISOString().slice(0, 10)}.pdf`, title: "Payment Methods", subtitle: `${data.paymentMethods.length} configured methods`, headers: methodExportHeaders, rows: methodExportRows, orientation: "landscape" });

  return (
    <div className="mx-auto max-w-[1250px] space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h2 className="text-2xl font-extrabold tracking-[-0.035em] text-navy-900 sm:text-3xl">Methods</h2>
         <div className="flex flex-wrap gap-2">
           <Button size="sm" variant="outline" onClick={exportMethods} disabled={!data.paymentMethods.length}><Download className="h-3.5 w-3.5" /> Export CSV</Button>
           <Button size="sm" variant="outline" onClick={exportMethodsPdf} disabled={!data.paymentMethods.length}><Download className="h-3.5 w-3.5" /> Export PDF</Button>
         </div>
      </div>
      <Card className="overflow-hidden">
        <div className="flex flex-col justify-between gap-3 border-b border-line bg-navy-900 px-5 py-5 text-white sm:flex-row sm:items-center sm:px-6">
          <div><h3 className="text-xl font-extrabold">{activeTypes.length ? `${activeTypes.length} active type${activeTypes.length === 1 ? "" : "s"}` : "No active types"}</h3><p className="mt-1 text-xs text-blue-100/70">{type?.name ?? "Add a payment type first."}</p></div>
          <p className="text-2xl font-extrabold">{formatCurrency(type?.amount ?? 0)}</p>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-4 sm:px-6">{activeTypes.map((item) => <span key={item.id} className="rounded-full bg-navy-50 px-3 py-1.5 text-[10px] font-bold text-navy-700">{item.name} · {formatCurrency(item.amount)}</span>)}</div>
        <div className="grid gap-4 p-5 sm:p-6 md:grid-cols-3">{methods.map((method) => { const config = data.paymentMethods.find((item) => item.id === method); return config ? <MethodCard key={method} config={config} onEdit={() => setMethodDraft({ ...config })} onToggle={() => void toggleMethod(config)} /> : null; })}</div>
      </Card>
      <Dialog open={Boolean(methodDraft)} onClose={() => setMethodDraft(null)} title={methodDraft ? `Configure ${methodDraft.id}` : "Configure method"} description="Payment instructions" size="md">{methodDraft ? <MethodForm draft={methodDraft} setDraft={setMethodDraft} onCancel={() => setMethodDraft(null)} onSave={saveDraft} loading={loading} /> : null}</Dialog>
    </div>
  );
}

function MethodCard({ config, onEdit, onToggle }: { config: PaymentMethodConfig; onEdit: () => void; onToggle: () => void }) {
  const logo = paymentMethodLogos[config.id];
  return <Card className={`flex min-w-0 flex-col p-4 transition duration-200 motion-safe:hover:-translate-y-0.5 sm:p-5 ${!config.enabled ? "opacity-70" : ""}`}><div className="flex items-start justify-between gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${logo ? "overflow-hidden bg-white p-1" : "text-white"}`} style={logo ? undefined : { backgroundColor: methodAccent[config.id] }}>{logo ? <img src={logo} alt={`${config.id} logo`} className="h-full w-full object-contain" /> : config.id === "Cash" ? <Banknote className="h-5 w-5" /> : <WalletCards className="h-5 w-5" />}</span><button className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${config.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`} onClick={onToggle}>{config.enabled ? <ToggleRight className="h-3.5 w-3.5" /> : <ToggleLeft className="h-3.5 w-3.5" />}{config.enabled ? "Enabled" : "Disabled"}</button></div><h4 className="mt-4 text-sm font-extrabold text-navy-900">{config.id}</h4><p className="mt-1 break-words text-xs font-semibold text-navy-700">{config.accountName}</p><p className="mt-1 break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{config.accountNumber}</p><p className="mt-3 min-h-10 break-words text-xs leading-5 text-slate-500">{config.instructions}</p><div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3"><span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400">{config.qrImage ? <><Check className="h-3.5 w-3.5 text-mint" />QR uploaded</> : <><QrCode className="h-3.5 w-3.5" />QR available</>}</span><Button variant="ghost" size="sm" onClick={onEdit}><Settings2 className="h-3.5 w-3.5" />Configure</Button></div></Card>;
}

function MethodForm({ draft, setDraft, onCancel, onSave, loading }: { draft: PaymentMethodConfig; setDraft: (draft: PaymentMethodConfig) => void; onCancel: () => void; onSave: () => void; loading: boolean }) {
  const uploadQr = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setDraft({ ...draft, qrImage: String(reader.result) });
    reader.readAsDataURL(file);
  };

  return <div className="space-y-5"><div className="grid gap-5 sm:grid-cols-2"><div><FieldLabel required>Account name</FieldLabel><Input value={draft.accountName} onChange={(event) => setDraft({ ...draft, accountName: event.target.value })} /></div><div><FieldLabel required>Account number / reference</FieldLabel><Input value={draft.accountNumber} onChange={(event) => setDraft({ ...draft, accountNumber: event.target.value })} /></div></div><div><FieldLabel required>Instructions</FieldLabel><Textarea value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} /></div>{draft.id !== "Cash" ? <div><FieldLabel>Payment QR image</FieldLabel>{draft.qrImage ? <div className="relative rounded-2xl border border-line bg-slate-50 p-3"><img src={draft.qrImage} alt={`${draft.id} payment QR preview`} className="mx-auto max-h-48 rounded-xl object-contain" /><button type="button" className="absolute right-3 top-3 rounded-lg bg-white p-1.5 text-coral shadow-sm ring-1 ring-line" onClick={() => setDraft({ ...draft, qrImage: undefined })} aria-label="Remove QR image"><X className="h-3.5 w-3.5" /></button></div> : <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5"><div className="rounded-xl bg-white p-3 shadow-sm"><QRCodeSVG value={`${draft.id}:${draft.accountNumber}`} size={120} bgColor="#ffffff" fgColor="#0b1f3a" level="M" /></div><p className="mt-3 text-center text-[10px] leading-4 text-slate-500">QR preview</p></div>}<label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-xs font-bold text-navy-800 transition hover:bg-navy-50"><ImagePlus className="h-4 w-4" />{draft.qrImage ? "Replace QR image" : "Upload QR image"}<input className="hidden" type="file" accept="image/*" onChange={uploadQr} /></label></div> : null}<div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button><Button type="button" loading={loading} onClick={onSave}><Save className="h-4 w-4" /> Save</Button></div></div>;
}
