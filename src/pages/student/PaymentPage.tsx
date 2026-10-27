import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { ArrowRight, Banknote, CalendarClock, Check, CircleHelp, FileImage, ImagePlus, Mail, ReceiptText, ShieldCheck, Upload, WalletCards } from "lucide-react";
import { Dialog, Card, Button, FieldLabel, Input, PageSkeleton } from "../../components/ui";
import { OrganizationLogo } from "../../components/OrganizationLogo";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../components/Toast";
import { formatCurrency, formatDateTime, formatManilaDateTime, isOverdue, methodAccent } from "../../lib/utils";
import { paymentMethodLogos } from "../../lib/paymentMethods";
import type { PaymentMethod, PaymentMode, PaymentOffering, PaymentRecord, SchoolLevel } from "../../types";
import jpcsLogo from "../../../jpcslogo/cropped_circle_image.png";

interface PaymentFormState {
  email: string;
  fullName: string;
  schoolLevel: SchoolLevel;
  yearLevel: string;
  strand: string;
  course: string;
  offeringId: string;
  method: PaymentMethod | "";
  paymentMode: PaymentMode;
  senderAccountName: string;
  senderReference: string;
  proofImage: string;
}

type FormErrors = Partial<Record<keyof PaymentFormState, string>>;

const juniorYears = ["Grade 7", "Grade 8", "Grade 9", "Grade 10"];
const seniorYears = ["Grade 11", "Grade 12"];
const collegeYears = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
const strands = ["STEM", "ABM", "HUMSS", "GAS", "TVL"];
const courseSuggestions = ["BS Computer Science", "BS Information Technology", "BS Information Systems", "BS Computer Engineering", "BS Business Administration", "BS Accountancy", "BS Education", "BS Psychology", "BS Hospitality Management", "BS Tourism Management"];
const schoolLevels: SchoolLevel[] = ["Junior High School", "Senior High School", "College"];

const yearsFor = (level: SchoolLevel) => level === "Senior High School" ? seniorYears : level === "College" ? collegeYears : juniorYears;
const shortSchoolLevel = (level: SchoolLevel) => level === "Junior High School" ? "JHS" : level === "Senior High School" ? "SHS" : "College";

export function PaymentPage() {
  const { data, submitPayment, sendPayLaterEmail, dataLoading, dataError, retryData } = useApp();
  const { pushToast } = useToast();
  const activeOfferings = useMemo(() => data.offerings.filter((offering) => offering.active && !offering.archivedAt), [data.offerings]);
  const [form, setForm] = useState<PaymentFormState>({
    email: "",
    fullName: "",
    schoolLevel: "Junior High School",
    yearLevel: juniorYears[0],
    strand: "",
    course: "",
    offeringId: activeOfferings[0]?.id ?? "",
    method: "",
    paymentMode: "PayNow",
    senderAccountName: "",
    senderReference: "",
    proofImage: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedPayment, setSubmittedPayment] = useState<PaymentRecord | null>(null);
  const [submissionTime] = useState(() => new Date());

  const eligibleOfferings = useMemo(() => activeOfferings.filter((offering) => offering.applicableSchoolLevels.includes(form.schoolLevel)), [activeOfferings, form.schoolLevel]);
  const selectedOffering = eligibleOfferings.find((offering) => offering.id === form.offeringId) ?? eligibleOfferings[0];
  const availableMethods = useMemo(() => selectedOffering?.availableMethods.filter((method) => data.paymentMethods.some((config) => config.id === method && config.enabled)) ?? [], [data.paymentMethods, selectedOffering]);
  const methodConfig = data.paymentMethods.find((method) => method.id === form.method);
  const yearOptions = yearsFor(form.schoolLevel);
  const isPayLater = form.paymentMode === "PayLater";
  const isCashless = form.method === "GCash" || form.method === "MariBank";
  const payLaterAvailable = Boolean(form.method && selectedOffering?.payLaterMethods.includes(form.method));

  useEffect(() => {
    const nextOfferingId = eligibleOfferings.some((offering) => offering.id === form.offeringId) ? form.offeringId : eligibleOfferings[0]?.id ?? "";
    const nextMethod = availableMethods.includes(form.method as PaymentMethod) ? form.method : availableMethods[0] ?? "";
    const nextMode: PaymentMode = form.paymentMode === "PayLater" && nextMethod && selectedOffering?.payLaterMethods.includes(nextMethod) ? "PayLater" : "PayNow";
    const methodChanged = nextMethod !== form.method;
    const modeChanged = nextMode !== form.paymentMode;
    if (nextOfferingId === form.offeringId && !methodChanged && !modeChanged) return;
    setForm((current) => ({
      ...current,
      offeringId: nextOfferingId,
      method: nextMethod,
      paymentMode: nextMode,
      ...(methodChanged || modeChanged ? { senderAccountName: "", senderReference: "", proofImage: "" } : {}),
    }));
    if (methodChanged || modeChanged) setErrors((current) => ({ ...current, method: undefined, paymentMode: undefined, senderAccountName: undefined, senderReference: undefined, proofImage: undefined }));
  }, [availableMethods, eligibleOfferings, form.method, form.offeringId, form.paymentMode, selectedOffering]);

  useEffect(() => {
    if (!yearOptions.includes(form.yearLevel)) setForm((current) => ({ ...current, yearLevel: yearOptions[0] }));
  }, [form.yearLevel, yearOptions]);

  const updateForm = <K extends keyof PaymentFormState>(key: K, value: PaymentFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const changeMethod = (method: PaymentMethod) => {
    setForm((current) => ({ ...current, method, paymentMode: "PayNow", senderAccountName: "", senderReference: "", proofImage: "" }));
    setErrors((current) => ({ ...current, method: undefined, paymentMode: undefined, senderAccountName: undefined, senderReference: undefined, proofImage: undefined }));
  };

  const changeSchoolLevel = (level: SchoolLevel) => {
    setForm((current) => ({ ...current, schoolLevel: level, yearLevel: yearsFor(level)[0], strand: "", course: level === "College" ? current.course : "" }));
    setErrors((current) => ({ ...current, schoolLevel: undefined, yearLevel: undefined, strand: undefined, course: undefined, offeringId: undefined }));
  };

  const resetForm = () => {
    setForm({ email: "", fullName: "", schoolLevel: "Junior High School", yearLevel: juniorYears[0], strand: "", course: "", offeringId: activeOfferings[0]?.id ?? "", method: availableMethods[0] ?? "", paymentMode: "PayNow", senderAccountName: "", senderReference: "", proofImage: "" });
    setErrors({});
  };

  const validate = () => {
    const nextErrors: FormErrors = {};
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) nextErrors.email = "Enter a valid email address.";
    if (!form.fullName.trim()) nextErrors.fullName = "Enter the payer's full name.";
    if (!form.yearLevel) nextErrors.yearLevel = "Choose a year level.";
    if (form.schoolLevel === "Senior High School" && !form.strand) nextErrors.strand = "Choose a strand.";
    if (form.schoolLevel === "College" && !form.course.trim()) nextErrors.course = "Enter your course or program.";
    if (!selectedOffering) nextErrors.offeringId = "No payment type is available for this school level.";
    if (!form.method) nextErrors.method = "Choose a payment method.";
    if (isPayLater) {
      if (!payLaterAvailable) nextErrors.paymentMode = "Pay Later is not available for this method.";
      if (!selectedOffering?.payLaterDeadlineAt || isOverdue(selectedOffering.payLaterDeadlineAt)) nextErrors.paymentMode = "The Pay Later deadline has passed.";
    } else if (isCashless) {
      if (!form.senderAccountName.trim()) nextErrors.senderAccountName = "Enter the sender account name.";
      if (!form.senderReference.trim()) nextErrors.senderReference = "Enter the account number or reference.";
      if (!form.proofImage) nextErrors.proofImage = "Upload proof of payment for cashless payments.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleProofUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrors((current) => ({ ...current, proofImage: "Choose an image file." }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((current) => ({ ...current, proofImage: "Choose an image smaller than 5 MB." }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateForm("proofImage", String(reader.result));
    reader.readAsDataURL(file);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (validate()) setReviewOpen(true);
  };

  const confirmPayment = async () => {
    if (!selectedOffering || !form.method) return;
    setSubmitting(true);
    try {
      const payment = await submitPayment({
        studentName: form.fullName.trim(),
        email: form.email.trim(),
        schoolLevel: form.schoolLevel,
        yearLevel: form.yearLevel,
        strand: form.schoolLevel === "Senior High School" ? form.strand : undefined,
        course: form.schoolLevel === "College" ? form.course.trim() : undefined,
        offeringId: selectedOffering.id,
        offeringName: selectedOffering.name,
        amount: selectedOffering.amount,
        allocations: selectedOffering.allocations,
        method: form.method,
        paymentMode: form.paymentMode,
        paymentDeadlineAt: isPayLater ? selectedOffering.payLaterDeadlineAt : undefined,
        senderAccountName: form.senderAccountName.trim() || undefined,
        senderReference: form.senderReference.trim() || undefined,
        proofImage: isPayLater ? undefined : form.proofImage || undefined,
      });
      setSubmittedPayment(payment);
      setReviewOpen(false);
      if (payment.paymentMode === "PayLater") {
        try {
          const emailedPayment = await sendPayLaterEmail(payment);
          if (emailedPayment) setSubmittedPayment(emailedPayment);
          pushToast({ tone: "success", title: "Reservation submitted", message: `Not Paid Yet. The instructions and attendance QR were emailed to ${payment.email}.` });
        } catch (error) {
          const message = error instanceof Error ? error.message : "The reservation was saved, but the email could not be sent.";
          setSubmittedPayment({ ...payment, emailDeliveryStatus: "Failed", emailDeliveryError: message });
          pushToast({ tone: "error", title: "Reservation saved, email failed", message });
        }
      } else {
        pushToast({ tone: "success", title: "Payment submitted", message: `Reference ${payment.reference} is ready for review.` });
      }
    } catch (error) {
      pushToast({ tone: "error", title: "Submission failed", message: error instanceof Error ? error.message : "The payment could not be saved. Check the database migration and try again." });
    } finally {
      setSubmitting(false);
    }
  };

  const summarySchoolDetails = `${form.schoolLevel} · ${form.yearLevel}${form.strand ? ` · ${form.strand}` : ""}${form.course ? ` · ${form.course}` : ""}`;

  if (dataLoading) return <PageSkeleton label="Loading payment types" />;
  if (dataError) return <Card className="mx-auto max-w-xl p-8 text-center"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-coral">Payment portal unavailable</p><h3 className="mt-2 text-base font-extrabold text-navy-900">The payment setup could not load</h3><p className="mt-2 break-words text-sm leading-6 text-slate-500">{dataError}</p><Button className="mt-5" variant="outline" onClick={() => void retryData()}>Retry</Button></Card>;

  return (
    <div className="payment-form mx-auto min-w-0 max-w-[1180px] space-y-6 overflow-x-hidden">
       <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">JPCS payment portal</p><h2 className="mt-3 text-2xl font-extrabold tracking-[-0.035em] text-navy-900 sm:text-3xl">Complete your payment</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Choose a payment type, select how you will pay, and upload proof for Pay Now cashless payments.</p></div><span className="self-start rounded-full bg-navy-50 px-3 py-2 text-[10px] font-bold text-navy-700 sm:self-auto">No account required</span></div>
         {!activeOfferings.length ? <Card className="p-8 text-center"><h3 className="text-base font-extrabold text-navy-900">No payment types are available</h3><p className="mt-2 text-sm text-slate-500">Please check back after the JPCS admin publishes a payment type.</p></Card> : <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"><form onSubmit={handleSubmit} className="min-w-0 space-y-6">
        <Card className="animate-fade-up p-5 sm:p-7"><FormSection icon={ShieldCheck} eyebrow="01 · Identity" title="Student details" description="Use the same name and email that should receive the payment update."><div className="grid gap-5 md:grid-cols-2"><FormField label="Email address" required error={errors.email} className="md:col-span-2"><div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" /><Input className="pl-10" type="email" value={form.email} onChange={(event) => updateForm("email", event.target.value)} placeholder="you@example.com" /></div></FormField><FormField label="Full name" required error={errors.fullName}><Input value={form.fullName} onChange={(event) => updateForm("fullName", event.target.value)} placeholder="Full name" /></FormField><FormField label="School level" required error={errors.schoolLevel}><div className="flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto pb-1">{schoolLevels.map((level) => <CapsuleOption key={level} label={shortSchoolLevel(level)} title={level} selected={form.schoolLevel === level} onClick={() => changeSchoolLevel(level)} />)}</div></FormField><FormField label="Year level" required error={errors.yearLevel} className="md:col-span-2"><div className="flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto pb-1">{yearOptions.map((year) => <CapsuleOption key={year} label={year} selected={form.yearLevel === year} onClick={() => updateForm("yearLevel", year)} />)}</div></FormField>{form.schoolLevel === "Senior High School" ? <FormField label="Strand" required error={errors.strand} className="md:col-span-2"><div className="flex min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto pb-1">{strands.map((strand) => <CapsuleOption key={strand} label={strand} selected={form.strand === strand} onClick={() => updateForm("strand", strand)} />)}</div></FormField> : null}{form.schoolLevel === "College" ? <FormField label="Course or program" required error={errors.course} className="md:col-span-2"><Input list="course-suggestions" value={form.course} onChange={(event) => updateForm("course", event.target.value)} placeholder="Type or choose a course" /><datalist id="course-suggestions">{courseSuggestions.map((course) => <option key={course} value={course} />)}</datalist><p className="mt-1.5 text-[11px] text-slate-400">You can enter a course that is not in the suggestions.</p></FormField> : null}</div></FormSection></Card>
         <Card className="animate-fade-up p-5 sm:p-7"><FormSection icon={CalendarClock} eyebrow="02 · Payment type" title="Choose what you are paying for" description="Available payment types are filtered for your school level."><div className="grid gap-3 sm:grid-cols-2">{eligibleOfferings.map((offering) => <OfferingOption key={offering.id} offering={offering} selected={selectedOffering?.id === offering.id} onClick={() => updateForm("offeringId", offering.id)} />)}</div>{!eligibleOfferings.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">No payment type is currently available for {form.schoolLevel}.</div> : null}{errors.offeringId ? <p className="mt-2 text-xs font-semibold text-coral">{errors.offeringId}</p> : null}</FormSection></Card>
        <Card className="animate-fade-up p-5 sm:p-7"><FormSection icon={WalletCards} eyebrow="03 · Payment method" title="Choose how you will pay" description={selectedOffering ? `Amount due is ${formatCurrency(selectedOffering.amount)}.` : "Choose a payment offering first."}><div className="flex min-w-0 max-w-full flex-nowrap gap-3 overflow-x-auto pb-1">{availableMethods.map((method) => { const config = data.paymentMethods.find((item) => item.id === method); return <MethodOption key={method} method={method} accountName={config?.accountName ?? ""} logo={paymentMethodLogos[method]} selected={form.method === method} onClick={() => changeMethod(method)} />; })}</div>{!availableMethods.length ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">No payment methods are enabled for this offering.</p> : null}{errors.method ? <p className="mt-2 text-xs font-semibold text-coral">{errors.method}</p> : null}{methodConfig ? <div className="mt-5 rounded-2xl border border-navy-100 bg-navy-50/60 p-4"><div className="flex items-start gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-sm ring-1 ring-line">{paymentMethodLogos[methodConfig.id] ? <img src={paymentMethodLogos[methodConfig.id]} alt={`${methodConfig.id} logo`} className="h-full w-full rounded-xl object-contain" /> : <CircleHelp className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold text-navy-900">{methodConfig.accountName}</p><p className="mt-1 break-words text-xs font-semibold text-navy-800">{methodConfig.accountNumber}</p><p className="mt-2 break-words text-[11px] leading-5 text-slate-500">{methodConfig.instructions}</p>{methodConfig.qrImage ? <img src={methodConfig.qrImage} alt={`${methodConfig.id} payment QR`} className="mt-4 max-h-40 w-full rounded-xl bg-white object-contain p-2" /> : null}</div></div><div className="mt-5"><FieldLabel>Payment timing</FieldLabel><div className="grid gap-2 sm:grid-cols-2"><ModeOption mode="PayNow" selected={!isPayLater} onClick={() => updateForm("paymentMode", "PayNow")} /><ModeOption mode="PayLater" selected={isPayLater} disabled={!payLaterAvailable} deadline={selectedOffering?.payLaterDeadlineAt} onClick={() => updateForm("paymentMode", "PayLater")} /></div>{errors.paymentMode ? <p className="mt-1.5 text-xs font-semibold text-coral">{errors.paymentMode}</p> : null}</div>{isPayLater ? <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0" /><span>Not Paid Yet. Pay through {form.method} before <strong>{selectedOffering?.payLaterDeadlineAt ? formatManilaDateTime(selectedOffering.payLaterDeadlineAt) : "the configured deadline"}</strong>. Your attendance QR becomes valid after admin confirmation.</span></div> : isCashless ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><FormField label="Sender account name" required error={errors.senderAccountName}><Input value={form.senderAccountName} onChange={(event) => updateForm("senderAccountName", event.target.value)} placeholder="Name registered on the account" /></FormField><FormField label="Sender account number / reference" required error={errors.senderReference}><Input value={form.senderReference} onChange={(event) => updateForm("senderReference", event.target.value)} placeholder="Account number or transaction reference" /></FormField></div> : <div className="mt-4"><FormField label="Cashier reference" error={errors.senderReference}><Input value={form.senderReference} onChange={(event) => updateForm("senderReference", event.target.value)} placeholder="Reference from the cashier (optional)" /></FormField></div>}{isCashless && !isPayLater ? <ProofUpload image={form.proofImage} error={errors.proofImage} onUpload={handleProofUpload} onClear={() => updateForm("proofImage", "")} /> : null}</div> : null}</FormSection></Card>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={resetForm}>Clear form</Button><Button type="submit" size="lg" disabled={!availableMethods.length || !selectedOffering}>Review payment <ArrowRight className="h-4 w-4" /></Button></div>
      </form><aside className="space-y-6 xl:sticky xl:top-24 xl:self-start"><Card className="overflow-hidden animate-fade-up"><div className="bg-navy-900 px-5 py-5 text-white"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-100/60">Payment summary</p><CalendarClock className="h-4 w-4 text-blue-200" /></div><p className="mt-3 text-2xl font-extrabold tracking-tight">{formatCurrency(selectedOffering?.amount ?? 0)}</p><p className="mt-1 break-words text-[11px] text-blue-100/60">{selectedOffering?.name ?? "No offering selected"}</p></div><div className="space-y-4 p-5"><SummaryLine label="Student" value={form.fullName || "Not entered"} /><SummaryLine label="School" value={summarySchoolDetails} /><SummaryLine label="Method" value={form.method || "Not selected"} /><SummaryLine label="Timing" value={isPayLater ? "Pay Later · Not Paid Yet" : "Pay Now"} /><SummaryLine label="Submitted" value={formatDateTime(submissionTime)} /></div></Card><Card className="p-5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-mint"><ShieldCheck className="h-4 w-4" /></span><div><p className="text-xs font-bold text-navy-900">What happens next?</p><p className="mt-1 text-[10px] text-slate-400">A simple review process</p></div></div><ol className="mt-5 space-y-4">{(isPayLater ? ["Your reservation is saved as Not Paid Yet.", "Pay before the deadline shown in your email.", "An admin marks payment received and activates your attendance QR."] : ["Review your details before submitting.", "The payment is saved for admin review.", "After confirmation, your receipt and QR ticket are emailed."]).map((step, index) => <li key={step} className="flex gap-3"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-50 text-[10px] font-extrabold text-navy-700">{index + 1}</span><span className="text-xs leading-5 text-slate-500">{step}</span></li>)}</ol></Card></aside></div>}
      <Dialog open={reviewOpen} onClose={() => setReviewOpen(false)} title="Confirm payment submission" description="Review these details before saving the payment record." size="md"><div className="space-y-5"><div className="rounded-2xl bg-mist p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-bold text-navy-900">{selectedOffering?.name}</p><p className="mt-1 break-words text-xs text-slate-500">{form.method} · {isPayLater ? "Pay Later" : "Pay Now"} · {formatDateTime(submissionTime)}</p></div><p className="shrink-0 text-lg font-extrabold text-navy-900">{formatCurrency(selectedOffering?.amount ?? 0)}</p></div></div><div className="grid gap-4 text-sm sm:grid-cols-2"><ReviewLine label="Student" value={form.fullName} /><ReviewLine label="Email" value={form.email} /><ReviewLine label="School details" value={summarySchoolDetails} /><ReviewLine label="Status" value={isPayLater ? "Not Paid Yet" : "Pending review"} />{isPayLater ? <ReviewLine label="Deadline" value={selectedOffering?.payLaterDeadlineAt ? formatManilaDateTime(selectedOffering.payLaterDeadlineAt) : "-"} /> : <ReviewLine label="Reference" value={form.senderReference || "Cashier reference"} />}</div>{form.proofImage && !isPayLater ? <img src={form.proofImage} alt="Proof preview" className="max-h-40 w-full rounded-xl border border-line object-contain bg-slate-50 p-2" /> : null}<div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-navy-800"><FileImage className="mt-0.5 h-4 w-4 shrink-0" />{isPayLater ? "Your reservation will be saved as Not Paid Yet. The attendance QR will be sent by email and activated after payment is received." : "Your payment will be saved and reviewed by the JPCS admin team."}</div><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={() => setReviewOpen(false)}>Go back</Button><Button loading={submitting} onClick={confirmPayment}>Submit payment <ArrowRight className="h-4 w-4" /></Button></div></div></Dialog>
      <Dialog open={Boolean(submittedPayment)} onClose={() => setSubmittedPayment(null)} title={submittedPayment?.paymentMode === "PayLater" ? "Reservation saved" : "Transaction complete"} description={submittedPayment?.paymentMode === "PayLater" ? "Your reservation is Not Paid Yet." : "Your payment reference has been created."}>{submittedPayment ? <PaymentCompleteContent payment={submittedPayment} onNewPayment={() => { setSubmittedPayment(null); resetForm(); }} /> : null}</Dialog>
    </div>
  );
}

function CapsuleOption({ label, title, selected, onClick }: { label: string; title?: string; selected: boolean; onClick: () => void }) {
  return <button type="button" title={title} aria-pressed={selected} className={`min-h-11 min-w-[78px] shrink-0 rounded-2xl border px-2 py-2 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 motion-safe:hover:-translate-y-0.5 ${selected ? "border-navy-800 bg-navy-900 text-white shadow-[0_0_0_3px_rgba(96,165,250,0.18)]" : "border-line bg-white text-slate-500 hover:border-navy-300 hover:bg-navy-50 hover:text-navy-900"}`} onClick={onClick}>{label}</button>;
}

function OfferingOption({ offering, selected, onClick }: { offering: PaymentOffering; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={selected} className={`group relative overflow-hidden rounded-3xl border p-5 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 motion-safe:hover:-translate-y-0.5 ${selected ? "border-navy-700 bg-navy-900 text-white shadow-[0_0_0_3px_rgba(96,165,250,0.22),0_18px_40px_rgba(11,31,58,0.18)]" : "border-line bg-white hover:border-navy-300 hover:bg-navy-50"}`} onClick={onClick}>
      {offering.imageUrl ? <><img src={offering.imageUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 transition duration-500 group-hover:scale-105" /><span className={`pointer-events-none absolute inset-0 ${selected ? "bg-navy-950/60" : "bg-white/70"}`} /></> : null}
      <img src={jpcsLogo} alt="" aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 z-10 h-36 w-36 opacity-[0.09] transition duration-500 group-hover:rotate-6 group-hover:scale-110" />
      <span className="relative z-10 flex items-start justify-between gap-3"><span className={`flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl ${selected ? "bg-white p-1" : "bg-navy-900 p-1"}`}><img src={jpcsLogo} alt="JPCS logo" className="h-full w-full rounded-xl object-cover" /></span><span className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full border ${selected ? "border-blue-200 bg-blue-400 text-navy-950" : "border-slate-200 text-transparent"}`}><Check className="h-3.5 w-3.5" /></span><span className={`text-xl font-extrabold ${selected ? "text-white" : "text-navy-900"}`}>{formatCurrency(offering.amount)}</span></span></span>
      <span className={`relative z-10 mt-5 block text-[10px] font-bold uppercase tracking-[0.14em] ${selected ? "text-blue-100/60" : "text-slate-400"}`}>Payment type</span>
      <span className={`relative z-10 mt-1 block break-words text-base font-extrabold ${selected ? "text-white" : "text-navy-900"}`}>{offering.name}</span>
      <span className={`relative z-10 mt-2 block break-words text-xs leading-5 ${selected ? "text-blue-100/70" : "text-slate-500"}`}>{offering.description}</span>
      <span className={`relative z-10 mt-5 block break-words text-[10px] font-semibold ${selected ? "text-blue-100/70" : "text-slate-400"}`}>{offering.allocations.map((allocation) => `${allocation.recipient}: ${formatCurrency(allocation.amount)}`).join(" · ")}{offering.payLaterMethods.length ? ` · Pay Later: ${offering.payLaterMethods.join("/")}` : ""}</span>
    </button>
  );
}

function MethodOption({ method, accountName, logo, selected, onClick }: { method: PaymentMethod; accountName: string; logo?: string; selected: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} className={`payment-method-option min-w-0 flex-1 rounded-2xl border p-4 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 motion-safe:hover:-translate-y-0.5 ${selected ? "border-navy-700 bg-navy-50 ring-2 ring-blue-400/50 shadow-[0_0_0_3px_rgba(96,165,250,0.18)]" : "border-line bg-white hover:border-navy-300 hover:bg-navy-50"}`} onClick={onClick}><span className="flex items-center justify-between gap-3"><span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${logo ? "overflow-hidden bg-white p-1.5 ring-1 ring-line" : "text-white"}`} style={logo ? undefined : { backgroundColor: methodAccent[method] }}>{logo ? <img src={logo} alt={`${method} logo`} className="h-full w-full rounded-xl object-contain" /> : method === "Cash" ? <Banknote className="h-4 w-4" /> : <WalletCards className="h-4 w-4" />}</span><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-navy-700 bg-navy-700 text-white" : "border-slate-200 text-transparent"}`}><Check className="h-3 w-3" /></span></span><span className="mt-4 block text-sm font-extrabold text-navy-900">{method}</span><span className="mt-1 block break-words text-[10px] leading-4 text-slate-500">{accountName}</span><span className="mt-3 block text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{selected ? "Selected payment method" : "Choose this method"}</span></button>;
}

function ModeOption({ mode, selected, disabled = false, deadline, onClick }: { mode: PaymentMode; selected: boolean; disabled?: boolean; deadline?: string; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} disabled={disabled} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-navy-700 bg-navy-900 text-white shadow-[0_0_0_3px_rgba(96,165,250,0.18)]" : "border-line bg-white text-slate-600 hover:border-navy-300 hover:bg-navy-50"}`} onClick={onClick}><span><span className="block text-xs font-extrabold">{mode === "PayLater" ? "Pay Later" : "Pay Now"}</span><span className={`mt-1 block text-[10px] ${selected ? "text-blue-100/70" : "text-slate-400"}`}>{mode === "PayLater" ? deadline ? `Due ${formatManilaDateTime(deadline)}` : "Not configured" : "Submit for review now"}</span></span>{selected ? <Check className="h-4 w-4 shrink-0 text-blue-200" /> : null}</button>;
}

function FormSection({ icon: Icon, eyebrow, title, description, children }: { icon: typeof ShieldCheck; eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <div><div className="mb-6 flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700"><Icon className="h-5 w-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{eyebrow}</p><h3 className="mt-1 text-base font-extrabold text-navy-900">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{description}</p></div></div>{children}</div>;
}

function FormField({ label, required, error, children, className = "" }: { label: string; required?: boolean; error?: string; children: ReactNode; className?: string }) {
  return <div className={className}><FieldLabel required={required}>{label}</FieldLabel>{children}{error ? <p className="mt-1.5 text-xs font-semibold text-coral">{error}</p> : null}</div>;
}

function ProofUpload({ image, error, onUpload, onClear }: { image: string; error?: string; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onClear: () => void }) {
  return <div className="mt-5"><FieldLabel required>Proof of payment image</FieldLabel>{image ? <div className="relative overflow-hidden rounded-2xl border border-line bg-slate-50 p-2"><img src={image} alt="Uploaded proof preview" className="max-h-64 w-full rounded-xl object-contain" /><div className="absolute right-4 top-4 flex flex-wrap justify-end gap-2"><label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-2.5 text-[10px] font-bold text-navy-800 shadow-sm ring-1 ring-line"><Upload className="h-3.5 w-3.5" /> Replace<input className="hidden" type="file" accept="image/*" onChange={onUpload} /></label><button type="button" className="rounded-lg bg-white px-2.5 text-[10px] font-bold text-coral shadow-sm ring-1 ring-line" onClick={onClear}>Remove</button></div></div> : <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-8 text-center transition hover:border-navy-400 hover:bg-navy-50/40"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-navy-700 shadow-sm"><ImagePlus className="h-5 w-5" /></span><span className="mt-3 text-xs font-bold text-navy-900">Upload a screenshot</span><span className="mt-1 text-[10px] text-slate-400">PNG, JPG, or WEBP · maximum 5 MB</span><input className="hidden" type="file" accept="image/*" onChange={onUpload} /></label>}{error ? <p className="mt-1.5 text-xs font-semibold text-coral">{error}</p> : null}</div>;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4"><span className="shrink-0 text-xs text-slate-400">{label}</span><span className="min-w-0 max-w-[70%] break-words text-right text-xs font-bold text-navy-900 [overflow-wrap:anywhere]">{value}</span></div>;
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1 break-words text-xs font-semibold text-navy-900 [overflow-wrap:anywhere]">{value}</p></div>;
}

function LegacyPaymentCompleteContent({ payment, onNewPayment }: { payment: PaymentRecord; onNewPayment: () => void }) {
  const proofRef = useRef<HTMLDivElement>(null);
  const [capturing, setCapturing] = useState(false);
  const { pushToast } = useToast();
  const isPayLater = payment.paymentMode === "PayLater";
  const emailFailed = payment.emailDeliveryStatus === "Failed";

  const downloadProof = async () => {
    if (!proofRef.current) return;
    setCapturing(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(proofRef.current, { backgroundColor: "#f4f7fb", scale: Math.max(2, Math.min(window.devicePixelRatio || 1, 3)), useCORS: true, logging: false });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The summary image could not be created.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `jpcs-payment-${payment.reference}.png`;
      link.click();
      URL.revokeObjectURL(url);
      pushToast({ tone: "success", title: "Summary downloaded", message: "Keep it with your payment reference." });
    } catch (error) {
      pushToast({ tone: "error", title: "Download failed", message: error instanceof Error ? error.message : "Try again on this device." });
    } finally {
      setCapturing(false);
    }
  };

  return <div className="space-y-5"><div ref={proofRef} className="min-w-0 rounded-2xl border border-line bg-white p-5 shadow-soft sm:p-6"><div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-4"><OrganizationLogo surface="light" /><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isPayLater ? "bg-amber-50 text-amber-700" : "bg-amber-50 text-amber-700"}`}>{isPayLater ? "Not Paid Yet" : "Pending review"}</span></div><div className="flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-mint"><Check className="h-5 w-5" /></span><div className="min-w-0"><p className="text-base font-extrabold text-navy-900">{isPayLater ? "Reservation saved" : "Payment submitted"}</p><p className="mt-1 break-words text-xs leading-5 text-slate-500">{isPayLater ? "Pay before the deadline. The attendance QR in your email activates after admin confirmation." : "Keep this reference while the payment is being reviewed."}</p></div></div><div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2"><SummaryLine label="Reference" value={payment.reference} /><SummaryLine label="Amount" value={formatCurrency(payment.amount)} /><SummaryLine label="Event" value={payment.offeringName} /><SummaryLine label="Email" value={payment.email} />{isPayLater && payment.paymentDeadlineAt ? <SummaryLine label="Deadline" value={formatManilaDateTime(payment.paymentDeadlineAt)} /> : null}</div></div><div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-navy-800"><ReceiptText className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{isPayLater ? `Your attendance QR was emailed to ${payment.email}. It activates after payment is marked received.` : `A confirmation email will be sent to ${payment.email} after the payment is reviewed.`}</span></div><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={onNewPayment}>New payment</Button><Button loading={capturing} onClick={downloadProof}>Download summary</Button></div></div>;
}

function PaymentCompleteContent({ payment, onNewPayment }: { payment: PaymentRecord; onNewPayment: () => void }) {
  const isPayLater = payment.paymentMode === "PayLater";

  return <div className="space-y-5"><div className="rounded-2xl border border-line bg-white p-5 shadow-soft sm:p-6"><div className="flex items-center justify-between gap-3 border-b border-line pb-4"><OrganizationLogo surface="light" /><span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">{isPayLater ? "Not Paid Yet" : "Pending review"}</span></div><div className="mt-5 flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-mint"><Check className="h-5 w-5" /></span><div className="min-w-0"><p className="text-base font-extrabold text-navy-900">{isPayLater ? "Reservation saved" : "Payment submitted"}</p><p className="mt-1 break-words text-xs leading-5 text-slate-500">{isPayLater ? "Your attendance QR is ready for event entry. Pay before the deadline so the admin can update your reservation." : "Keep this reference while the payment is being reviewed."}</p></div></div><div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2"><SummaryLine label="Reference" value={payment.reference} /><SummaryLine label="Amount" value={formatCurrency(payment.amount)} /><SummaryLine label="Type" value={payment.offeringName} /><SummaryLine label="Email" value={payment.email} />{isPayLater && payment.paymentDeadlineAt ? <SummaryLine label="Deadline" value={formatManilaDateTime(payment.paymentDeadlineAt)} /> : null}</div></div><div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-navy-800"><ReceiptText className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{isPayLater ? `Your attendance QR was emailed to ${payment.email}. It can be scanned even while the reservation is Not Paid Yet.` : `A confirmation email will be sent to ${payment.email} after the payment is reviewed.`}</span></div><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={onNewPayment}>Start another payment</Button></div></div>;
}
