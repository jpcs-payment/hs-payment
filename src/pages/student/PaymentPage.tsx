import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Banknote, CalendarClock, Check, CircleHelp, FileImage, ImagePlus, Mail, ReceiptText, ShieldCheck, Upload, WalletCards } from "lucide-react";
import { Card, Button, FieldLabel, Input, Skeleton } from "../../components/ui";
import { OrganizationLogo } from "../../components/OrganizationLogo";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../components/Toast";
import { formatCurrency, formatDateTime, formatManilaDateTime, isOverdue, methodAccent } from "../../lib/utils";
import { paymentMethodLogos } from "../../lib/paymentMethods";
import { getPaymentAttendees } from "../../lib/payment";
import type { PaymentMethod, PaymentMode, PaymentOffering, PaymentRecord, SchoolLevel } from "../../types";
import jpcsLogo from "../../../jpcslogo/cropped_circle_image.png";

export interface PaymentFormState {
  email: string;
  attendeeNames: string[];
  schoolLevel: SchoolLevel;
  yearLevel: string;
  section: string;
  strand: string;
  course: string;
  offeringId: string;
  method: PaymentMethod | "";
  paymentMode: PaymentMode;
  proofImage: string;
}

export type FormErrors = Partial<Record<keyof PaymentFormState, string>>;
type PaymentStep = "details" | "type" | "method" | "review" | "paid";

const juniorYears = ["Grade 7", "Grade 8", "Grade 9", "Grade 10"];
const seniorYears = ["Grade 11", "Grade 12"];
const collegeYears = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
const strands = ["ABM", "GAS", "HUMSS", "STEM", "HE", "ICT"];
const schoolLevels: SchoolLevel[] = ["Junior High School", "Senior High School", "College"];
const stepOrder: PaymentStep[] = ["details", "type", "method", "review", "paid"];
const stepLabels: Record<PaymentStep, string> = {
  details: "01 · STUDENT DETAILS",
  type: "02 · PAYMENT TYPE",
  method: "03 · PAYMENT METHOD",
  review: "04 · REVIEW PAYMENT",
  paid: "05 · PAID",
};

const yearsFor = (level: SchoolLevel) => level === "Senior High School" ? seniorYears : level === "College" ? collegeYears : juniorYears;
const shortSchoolLevel = (level: SchoolLevel) => level === "Junior High School" ? "JHS" : level === "Senior High School" ? "SHS" : "College";
const createSubmissionKey = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : undefined;
const emailAlreadyUsedMessage = "email has been used";

export function PaymentPage() {
  const { data, submitPayment, sendPayLaterEmail, dataLoading, dataError, retryData } = useApp();
  const { pushToast } = useToast();
  const activeOfferings = useMemo(() => data.offerings.filter((offering) => offering.active && !offering.deletedAt), [data.offerings]);
  const visibleSchoolLevels = useMemo(() => schoolLevels.filter((level) => data.siteSettings.visibleSchoolLevels.includes(level)), [data.siteSettings.visibleSchoolLevels]);
  const [form, setForm] = useState<PaymentFormState>({
    email: "",
    attendeeNames: [""],
    schoolLevel: "Junior High School",
    yearLevel: juniorYears[0],
    section: "",
    strand: "",
    course: "",
    offeringId: activeOfferings[0]?.id ?? "",
    method: "",
    paymentMode: "PayNow",
    proofImage: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [step, setStep] = useState<PaymentStep>("details");
  const [submitting, setSubmitting] = useState(false);
  const [submittedPayment, setSubmittedPayment] = useState<PaymentRecord | null>(null);
  const [submissionTime, setSubmissionTime] = useState(() => new Date());
  const [submissionKey, setSubmissionKey] = useState<string | undefined>(() => createSubmissionKey());

  const eligibleOfferings = useMemo(() => activeOfferings.filter((offering) => offering.applicableSchoolLevels.includes(form.schoolLevel)), [activeOfferings, form.schoolLevel]);
  const selectedOffering = eligibleOfferings.find((offering) => offering.id === form.offeringId) ?? eligibleOfferings[0];
  const availableMethods = useMemo(() => selectedOffering?.availableMethods.filter((method) => data.paymentMethods.some((config) => config.id === method && config.enabled)) ?? [], [data.paymentMethods, selectedOffering]);
  const methodConfig = data.paymentMethods.find((method) => method.id === form.method);
  const yearOptions = yearsFor(form.schoolLevel);
  const sectionSuggestions = useMemo(
    () => [...data.sections].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })),
    [data.sections],
  );
  const isPayLater = form.paymentMode === "PayLater";
  const isCashless = form.method === "GCash" || form.method === "MariBank";
  const payLaterAvailable = payLaterAvailableFor(selectedOffering, form.method);
  const currentStepIndex = stepOrder.indexOf(step);
  const allowMultipleNames = data.siteSettings.allowMultipleNames;
  const maxNames = allowMultipleNames ? Math.min(20, Math.max(2, data.siteSettings.maxNames)) : 1;
  const attendeeCount = form.attendeeNames.filter((name) => name.trim()).length;
  const totalAmount = selectedOffering ? selectedOffering.amount * Math.max(attendeeCount, 1) : 0;

  useEffect(() => {
    const nextOfferingId = eligibleOfferings.some((offering) => offering.id === form.offeringId) ? form.offeringId : eligibleOfferings[0]?.id ?? "";
    const nextMethod = availableMethods.includes(form.method as PaymentMethod) ? form.method : availableMethods[0] ?? "";
    const nextMode: PaymentMode = form.paymentMode === "PayLater" && payLaterAvailableFor(selectedOffering, nextMethod) ? "PayLater" : "PayNow";
    const offeringChanged = nextOfferingId !== form.offeringId;
    const methodChanged = nextMethod !== form.method;
    const modeChanged = nextMode !== form.paymentMode;
    const namesNeedTrim = form.attendeeNames.length > maxNames;
    if (!offeringChanged && !methodChanged && !modeChanged && !namesNeedTrim) return;
    setForm((current) => ({
      ...current,
      offeringId: nextOfferingId,
      method: nextMethod,
      paymentMode: nextMode,
      attendeeNames: current.attendeeNames.slice(0, maxNames),
      ...(offeringChanged || methodChanged || modeChanged ? { proofImage: "" } : {}),
    }));
    if (offeringChanged || methodChanged || modeChanged) setErrors((current) => ({ ...current, offeringId: undefined, method: undefined, paymentMode: undefined, proofImage: undefined }));
  }, [availableMethods, eligibleOfferings, form.attendeeNames.length, form.method, form.offeringId, form.paymentMode, maxNames, selectedOffering]);

  useEffect(() => {
    if (!yearOptions.includes(form.yearLevel)) setForm((current) => ({ ...current, yearLevel: yearOptions[0] }));
  }, [form.yearLevel, yearOptions]);

  useEffect(() => {
    const nextSchoolLevel = visibleSchoolLevels[0];
    if (!nextSchoolLevel || visibleSchoolLevels.includes(form.schoolLevel)) return;
    setForm((current) => ({ ...current, schoolLevel: nextSchoolLevel, yearLevel: yearsFor(nextSchoolLevel)[0], strand: "", course: "" }));
  }, [form.schoolLevel, visibleSchoolLevels]);

  const updateForm = <K extends keyof PaymentFormState>(key: K, value: PaymentFormState[K]) => {
    setForm((current) => {
      const offeringChanged = key === "offeringId" && current.offeringId !== value;
      return { ...current, [key]: value, ...(offeringChanged ? { proofImage: "" } : {}) };
    });
    setErrors((current) => ({ ...current, [key]: undefined, ...(key === "offeringId" ? { proofImage: undefined } : {}) }));
  };

  const updateAttendeeName = (index: number, value: string) => {
    setForm((current) => ({ ...current, attendeeNames: current.attendeeNames.map((name, nameIndex) => nameIndex === index ? value : name) }));
    setErrors((current) => ({ ...current, attendeeNames: undefined }));
  };

  const addAttendeeName = () => {
    if (form.attendeeNames.length >= maxNames) {
      setErrors((current) => ({ ...current, attendeeNames: `Maximum of ${maxNames} attendee${maxNames === 1 ? "" : "s"} per transaction.` }));
      return;
    }
    setForm((current) => ({ ...current, attendeeNames: [...current.attendeeNames, ""] }));
    setErrors((current) => ({ ...current, attendeeNames: undefined }));
  };

  const removeAttendeeName = (index: number) => {
    if (form.attendeeNames.length <= 1) return;
    setForm((current) => ({ ...current, attendeeNames: current.attendeeNames.filter((_, nameIndex) => nameIndex !== index) }));
    setErrors((current) => ({ ...current, attendeeNames: undefined }));
  };

  const changeMethod = (method: PaymentMethod) => {
    setForm((current) => ({ ...current, method, paymentMode: "PayNow", proofImage: "" }));
    setErrors((current) => ({ ...current, method: undefined, paymentMode: undefined, proofImage: undefined }));
  };

  const changeSchoolLevel = (level: SchoolLevel) => {
    setForm((current) => ({ ...current, schoolLevel: level, yearLevel: yearsFor(level)[0], strand: "", course: level === "College" ? current.course : "" }));
    setErrors((current) => ({ ...current, schoolLevel: undefined, yearLevel: undefined, strand: undefined, course: undefined, offeringId: undefined }));
  };

  const resetForm = () => {
    setForm({ email: "", attendeeNames: [""], schoolLevel: "Junior High School", yearLevel: juniorYears[0], section: "", strand: "", course: "", offeringId: activeOfferings[0]?.id ?? "", method: "", paymentMode: "PayNow", proofImage: "" });
    setErrors({});
    setSubmittedPayment(null);
    setSubmissionTime(new Date());
    setSubmissionKey(createSubmissionKey());
    setStep("details");
  };

  const validateDetails = () => {
    const nextErrors: FormErrors = {};
    const names = form.attendeeNames.map((name) => name.trim());
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) nextErrors.email = "Enter a valid email address.";
    if (names.some((name) => !name)) nextErrors.attendeeNames = "Enter a name for every attendee row.";
    else if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) nextErrors.attendeeNames = "Each attendee name must be unique.";
    else if (names.length > maxNames) nextErrors.attendeeNames = `Maximum of ${maxNames} attendee${maxNames === 1 ? "" : "s"} per transaction.`;
    if (!form.yearLevel) nextErrors.yearLevel = "Choose a year level.";
    if (!form.section.trim()) nextErrors.section = "Enter a section.";
    if (form.schoolLevel === "Senior High School" && !form.strand) nextErrors.strand = "Choose a strand.";
    if (form.schoolLevel === "College" && !form.course.trim()) nextErrors.course = "Enter your course or program.";
    setErrors((current) => ({ ...current, ...nextErrors, ...(nextErrors.email ? {} : { email: undefined }), ...(nextErrors.attendeeNames ? {} : { attendeeNames: undefined }), ...(nextErrors.yearLevel ? {} : { yearLevel: undefined }), ...(nextErrors.section ? {} : { section: undefined }), ...(nextErrors.strand ? {} : { strand: undefined }), ...(nextErrors.course ? {} : { course: undefined }) }));
    return Object.keys(nextErrors).length === 0;
  };

  const validateType = () => {
    const nextErrors: FormErrors = selectedOffering ? {} : { offeringId: "No payment type is available for this school level." };
    setErrors((current) => ({ ...current, offeringId: nextErrors.offeringId }));
    return Object.keys(nextErrors).length === 0;
  };

  const validateMethod = () => {
    const nextErrors: FormErrors = {};
    if (!form.method) nextErrors.method = "Choose a payment method.";
    if (isPayLater) {
      if (!payLaterAvailable) nextErrors.paymentMode = "Pay Later is not available for this method.";
      if (!selectedOffering?.payLaterDeadlineAt || isOverdue(selectedOffering.payLaterDeadlineAt)) nextErrors.paymentMode = "The Pay Later deadline has passed.";
    } else if (isCashless) {
      if (!form.proofImage) nextErrors.proofImage = "Upload proof of payment for cashless payments.";
    }
    setErrors((current) => ({ ...current, method: nextErrors.method, paymentMode: nextErrors.paymentMode, proofImage: nextErrors.proofImage }));
    return Object.keys(nextErrors).length === 0;
  };

  const validateStep = (currentStep: PaymentStep) => {
    if (currentStep === "details") return validateDetails();
    if (currentStep === "type") return validateType();
    if (currentStep === "method") return validateMethod();
    return true;
  };

  const moveTo = (nextStep: PaymentStep) => {
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleProofUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setErrors((current) => ({ ...current, proofImage: "Choose a PNG, JPG, or WEBP image." }));
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setErrors((current) => ({ ...current, proofImage: "Choose an image smaller than 3 MB." }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => updateForm("proofImage", String(reader.result));
    reader.readAsDataURL(file);
  };

  const confirmPayment = async () => {
    if (!selectedOffering || !form.method || !validateMethod() || !validateDetails()) return;
    const attendeeNames = form.attendeeNames.map((name) => name.trim());
    setSubmitting(true);
    try {
      const payment = await submitPayment({
        idempotencyKey: submissionKey,
        studentName: attendeeNames[0],
        attendeeNames,
        email: form.email.trim(),
        schoolLevel: form.schoolLevel,
        yearLevel: form.yearLevel,
        section: form.section.trim(),
        strand: form.schoolLevel === "Senior High School" ? form.strand : undefined,
        course: form.schoolLevel === "College" ? form.course.trim() : undefined,
        offeringId: selectedOffering.id,
        offeringName: selectedOffering.name,
        amount: totalAmount,
        allocations: selectedOffering.allocations,
        method: form.method,
        paymentMode: form.paymentMode,
        paymentDeadlineAt: isPayLater ? selectedOffering.payLaterDeadlineAt : undefined,
        proofImage: isPayLater ? undefined : form.proofImage || undefined,
      });
      setSubmittedPayment(payment);
      setSubmissionTime(new Date(payment.submittedAt));
      moveTo("paid");
      if (payment.paymentMode === "PayLater") {
        try {
          const emailedPayment = await sendPayLaterEmail(payment);
          if (emailedPayment) setSubmittedPayment(emailedPayment);
          pushToast({ tone: "success", title: "Reservation submitted", message: payment.generateQr ? `Not Paid Yet. The attendee QR list was emailed to ${payment.email}.` : `Not Paid Yet. The confirmation was emailed to ${payment.email}.` });
        } catch (error) {
          const message = error instanceof Error ? error.message : "The reservation was saved, but the email could not be sent.";
          setSubmittedPayment({ ...payment, emailDeliveryStatus: "Failed", emailDeliveryError: message });
          pushToast({ tone: "error", title: "Reservation saved, email failed", message });
        }
      } else {
        pushToast({ tone: "success", title: "Payment submitted", message: `Reference ${payment.reference} is ready for admin review.` });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The payment could not be saved. Check the database migration and try again.";
      const emailAlreadyUsed = message.toLowerCase() === emailAlreadyUsedMessage;
      if (emailAlreadyUsed) {
        setErrors((current) => ({ ...current, email: emailAlreadyUsedMessage }));
        moveTo("details");
      }
      pushToast({ tone: "error", title: emailAlreadyUsed ? "Email already used" : "Submission failed", message });
    } finally {
      setSubmitting(false);
    }
  };

  const advanceStep = async () => {
    if (step === "review") {
      await confirmPayment();
      return;
    }
    if (!validateStep(step)) return;
    const nextStep = stepOrder[currentStepIndex + 1];
    if (nextStep) moveTo(nextStep);
  };

  const goBack = () => {
    const previousStep = stepOrder[currentStepIndex - 1];
    if (previousStep) moveTo(previousStep);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void advanceStep();
  };

  const summarySchoolDetails = `${form.schoolLevel} · ${form.yearLevel} · ${form.section.trim() || "Section not entered"}${form.strand ? ` · ${form.strand}` : ""}${form.course ? ` · ${form.course}` : ""}`;
  const siteClosed = !data.siteSettings.isOpen;

  if (dataLoading) return <PaymentPageSkeleton />;
  if (dataError) return <Card className="mx-auto max-w-xl p-8 text-center"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-coral">Payment portal unavailable</p><h3 className="mt-2 text-base font-extrabold text-navy-900">The payment setup could not load</h3><p className="mt-2 break-words text-sm leading-6 text-slate-500">{dataError}</p><Button className="mt-5" variant="outline" onClick={() => void retryData()}>Retry</Button></Card>;

  return (
    <div className="payment-form mx-auto min-w-0 max-w-[1180px] space-y-6 overflow-x-hidden">
       {data.siteSettings.siteKey === "test-payment" ? <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900"><strong>Test payment site.</strong> Submissions here are for testing and are labeled separately in the admin workspace.</div> : null}
       <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
         <div><h2 className="text-2xl font-extrabold tracking-[-0.035em] text-navy-900 sm:text-3xl">Complete your payment</h2></div>
      </div>

      <StepIndicator currentStep={step} />

       {siteClosed ? <SiteClosedCard message={data.siteSettings.message} /> : !activeOfferings.length ? <Card className="p-8 text-center"><h3 className="text-base font-extrabold text-navy-900">No payment types are available</h3><p className="mt-2 text-sm text-slate-500">Please check back after the JPCS admin publishes a payment type.</p></Card> : step === "paid" && submittedPayment ? <PaymentCompleteContent payment={submittedPayment} onNewPayment={resetForm} /> : <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={handleSubmit} className="min-w-0 space-y-6">
          <Card className="animate-fade-up p-5 sm:p-7">
             {step === "details" ? <CompactStudentDetailsStep form={form} errors={errors} yearOptions={yearOptions} sectionSuggestions={sectionSuggestions} schoolLevels={visibleSchoolLevels} maxNames={maxNames} allowMultipleNames={allowMultipleNames} onChange={updateForm} onNameChange={updateAttendeeName} onAddName={addAttendeeName} onRemoveName={removeAttendeeName} onSchoolLevelChange={changeSchoolLevel} /> : null}
            {step === "type" ? <PaymentTypeStep offerings={eligibleOfferings} selectedOffering={selectedOffering} schoolLevel={form.schoolLevel} error={errors.offeringId} onSelect={(offeringId) => updateForm("offeringId", offeringId)} /> : null}
            {step === "method" ? <PaymentMethodStep form={form} availableMethods={availableMethods} method={form.method} methodConfig={methodConfig} paymentMode={form.paymentMode} selectedOffering={selectedOffering} totalAmount={totalAmount} attendeeCount={Math.max(attendeeCount, 1)} isPayLater={isPayLater} isCashless={isCashless} errors={errors} proofImage={form.proofImage} onMethodChange={changeMethod} onModeChange={(mode) => updateForm("paymentMode", mode)} onChange={updateForm} onProofUpload={handleProofUpload} onProofClear={() => updateForm("proofImage", "")} /> : null}
            {step === "review" ? <ReviewPaymentStep form={form} selectedOffering={selectedOffering} totalAmount={totalAmount} isPayLater={isPayLater} summarySchoolDetails={summarySchoolDetails} submissionTime={submissionTime} /> : null}
          </Card>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>{step !== "details" ? <Button className="w-full sm:w-auto" type="button" variant="ghost" onClick={goBack}><ArrowLeft className="h-4 w-4" />Back</Button> : <Button className="w-full sm:w-auto" type="button" variant="ghost" onClick={resetForm}>Clear form</Button>}</div>
            <Button className="w-full sm:w-auto" type="submit" size="lg" loading={submitting} disabled={step === "review" ? submitting : !availableMethods.length || !selectedOffering}>{step === "review" ? "Confirm and submit" : "Next"}<ArrowRight className="h-4 w-4" /></Button>
          </div>
        </form>
        <aside className="hidden space-y-6 lg:sticky lg:top-24 lg:block lg:self-start"><Card className="overflow-hidden animate-fade-up"><div className="bg-navy-900 px-5 py-5 text-white"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-100/60">Payment summary</p><CalendarClock className="h-4 w-4 text-blue-200" /></div><p className="mt-3 text-2xl font-extrabold tracking-tight">{formatCurrency(totalAmount)}</p><p className="mt-1 break-words text-[11px] text-blue-100/60">{selectedOffering?.name ?? "No offering selected"}</p></div><div className="space-y-4 p-5"><SummaryLine label="Names" value={`${Math.max(attendeeCount, 1)} attendee${Math.max(attendeeCount, 1) === 1 ? "" : "s"}`} /><SummaryLine label="Email" value={form.email || "Not entered"} /><SummaryLine label="School" value={summarySchoolDetails} /><SummaryLine label="Method" value={form.method || "Not selected"} /><SummaryLine label="Timing" value={isPayLater ? "Pay Later · Not Paid Yet" : "Pay Now"} /><SummaryLine label="Step" value={stepLabels[step]} /></div></Card><Card className="p-5"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-mint"><Check className="h-4 w-4" /></span><div><p className="text-xs font-bold text-navy-900">PAID</p><p className="mt-1 text-[10px] text-slate-400">After approval</p></div></div><p className="mt-4 text-xs leading-5 text-slate-500">Your receipt and confirmation email are available after approval.</p></Card></aside>
      </div>}
    </div>
  );
}

function StepIndicator({ currentStep }: { currentStep: PaymentStep }) {
  const currentIndex = stepOrder.indexOf(currentStep);
  const progress = `${currentIndex + 1} of ${stepOrder.length}`;
  return <nav aria-label="Payment progress" className="rounded-2xl border border-line bg-white px-4 py-3 shadow-soft sm:px-5"><div className="flex items-center gap-3"><div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-navy-50" role="progressbar" aria-valuemin={1} aria-valuemax={stepOrder.length} aria-valuenow={currentIndex + 1} aria-label={`Step ${progress}`}><span className="block h-full rounded-full bg-navy-900 transition-all" style={{ width: `${((currentIndex + 1) / stepOrder.length) * 100}%` }} /></div><span className="shrink-0 rounded-full bg-navy-900 px-3 py-1 text-[10px] font-extrabold text-white" aria-current="step">{progress}</span></div><p className="sr-only" aria-live="polite">Current step: {stepLabels[currentStep]}, {progress}</p></nav>;
}

function SiteClosedCard({ message }: { message: string }) {
  return <Card className="mx-auto max-w-2xl border-amber-200 bg-amber-50/70 p-8 text-center"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Payment portal updating</p><h3 className="mt-2 text-xl font-extrabold text-navy-900">Payments are temporarily closed</h3><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-amber-900/75">{message}</p></Card>;
}

function CompactStudentDetailsStep({ form, errors, yearOptions, sectionSuggestions, schoolLevels, maxNames, allowMultipleNames, onChange, onNameChange, onAddName, onRemoveName, onSchoolLevelChange }: { form: PaymentFormState; errors: FormErrors; yearOptions: string[]; sectionSuggestions: string[]; schoolLevels: SchoolLevel[]; maxNames: number; allowMultipleNames: boolean; onChange: <K extends keyof PaymentFormState>(key: K, value: PaymentFormState[K]) => void; onNameChange: (index: number, value: string) => void; onAddName: () => void; onRemoveName: (index: number) => void; onSchoolLevelChange: (level: SchoolLevel) => void }) {
  return (
    <FormSection icon={ShieldCheck} eyebrow="01 · Student details" title="Add the attendee names" description="Use one email for the whole payment. School details apply to every attendee in this submission.">
      <div className="grid gap-5 md:grid-cols-2">
        <FormField label="Email address" required error={errors.email} className="md:col-span-2">
          <div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-slate-400" /><Input className="pl-10" type="email" value={form.email} onChange={(event) => onChange("email", event.target.value)} placeholder="you@example.com" autoComplete="email" /></div>
        </FormField>
        <div className="md:col-span-2">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
             <div>
               <FieldLabel required>Attendee name{allowMultipleNames ? "s" : ""}</FieldLabel>
               <p className="mt-1 text-[10px] font-semibold text-slate-400">Maximum of {maxNames} attendee{maxNames === 1 ? "" : "s"} per transaction.</p>
             </div>
          </div>
           <div className="space-y-2">{form.attendeeNames.map((name, index) => <div key={index} className="flex min-w-0 gap-2"><Input className="min-w-0" value={name} onChange={(event) => onNameChange(index, event.target.value)} placeholder={index === 0 ? "e.g., Dela Cruz, Juan B." : `Attendee ${index + 1}`} autoComplete={index === 0 ? "name" : "off"} aria-label={`Attendee name ${index + 1}`} /><button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-coral transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40" onClick={() => onRemoveName(index)} disabled={form.attendeeNames.length === 1} aria-label={`Remove attendee ${index + 1}`}>×</button></div>)}</div>
          <div className="mt-3 flex justify-end">{allowMultipleNames ? <Button type="button" size="sm" variant="outline" onClick={onAddName} disabled={form.attendeeNames.length >= maxNames}>Add attendee</Button> : null}</div>
          {errors.attendeeNames ? <p className="mt-1.5 text-xs font-semibold text-coral">{errors.attendeeNames}</p> : null}
        </div>
          <FormField label="School level" required error={errors.schoolLevel} className="md:col-span-2"><div className="flex min-w-0 flex-wrap gap-2">{schoolLevels.map((level) => <CapsuleOption key={level} label={shortSchoolLevel(level)} title={level} selected={form.schoolLevel === level} onClick={() => onSchoolLevelChange(level)} />)}</div></FormField>
          <FormField label="Year level" required error={errors.yearLevel}><div className="flex min-w-0 flex-wrap gap-2">{yearOptions.map((year) => <CapsuleOption key={year} label={year} selected={form.yearLevel === year} onClick={() => onChange("yearLevel", year)} />)}</div></FormField>
          {form.schoolLevel === "Senior High School" ? <FormField label="Strand" required error={errors.strand}><div className="flex min-w-0 flex-wrap gap-2">{strands.map((strand) => <CapsuleOption key={strand} label={strand} selected={form.strand === strand} onClick={() => onChange("strand", strand)} />)}</div></FormField> : null}
          {form.schoolLevel === "College" ? <FormField label="Course or program" required error={errors.course}><Input value={form.course} onChange={(event) => onChange("course", event.target.value)} placeholder="BS Computer Science" autoComplete="organization-title" /></FormField> : null}
          <FormField label="Section" required error={errors.section}><Input value={form.section} onChange={(event) => onChange("section", event.target.value)} placeholder="e.g., Section A" list="section-suggestions" autoComplete="off" /><datalist id="section-suggestions">{sectionSuggestions.map((section) => <option key={section} value={section} />)}</datalist></FormField>
       </div>
    </FormSection>
  );
}

function PaymentTypeStep({ offerings, selectedOffering, schoolLevel, error, onSelect }: { offerings: PaymentOffering[]; selectedOffering?: PaymentOffering; schoolLevel: SchoolLevel; error?: string; onSelect: (offeringId: string) => void }) {
  return <FormSection icon={CalendarClock} eyebrow="02 · Payment type" title="Choose what you are paying for" description={`Available payment types for ${schoolLevel}.`}><div className="grid gap-3 sm:grid-cols-2">{offerings.map((offering) => <OfferingOption key={offering.id} offering={offering} selected={selectedOffering?.id === offering.id} onClick={() => onSelect(offering.id)} />)}</div>{!offerings.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">No payment type is currently available for {schoolLevel}.</div> : null}{error ? <p className="mt-2 text-xs font-semibold text-coral">{error}</p> : null}</FormSection>;
}

function PaymentMethodStep({ form, availableMethods, method, methodConfig, paymentMode, selectedOffering, totalAmount, attendeeCount, isPayLater, isCashless, errors, proofImage, onMethodChange, onModeChange, onChange, onProofUpload, onProofClear }: { form: PaymentFormState; availableMethods: PaymentMethod[]; method: PaymentMethod | ""; methodConfig?: { id: PaymentMethod; accountName: string; accountNumber: string; instructions: string; qrImage?: string }; paymentMode: PaymentMode; selectedOffering?: PaymentOffering; totalAmount: number; attendeeCount: number; isPayLater: boolean; isCashless: boolean; errors: FormErrors; proofImage: string; onMethodChange: (method: PaymentMethod) => void; onModeChange: (mode: PaymentMode) => void; onChange: <K extends keyof PaymentFormState>(key: K, value: PaymentFormState[K]) => void; onProofUpload: (event: ChangeEvent<HTMLInputElement>) => void; onProofClear: () => void }) {
  const totalLabel = method === "Cash" ? "Total to pay" : "Total to send";
  const showPaymentTiming = payLaterAvailableFor(selectedOffering, method);
  return <FormSection icon={WalletCards} eyebrow="03 · Payment method" title="Select how you will pay" description={selectedOffering ? `Total due for ${attendeeCount} attendee${attendeeCount === 1 ? "" : "s"}: ${formatCurrency(totalAmount)}.` : "Choose a payment type first."}><div className="grid gap-3 sm:grid-cols-3">{availableMethods.map((availableMethod) => { const config = methodConfig?.id === availableMethod ? methodConfig : undefined; return <MethodOption key={availableMethod} method={availableMethod} accountName={config?.accountName ?? ""} logo={paymentMethodLogos[availableMethod]} selected={method === availableMethod} onClick={() => onMethodChange(availableMethod)} />; })}</div>{!availableMethods.length ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">No payment methods are enabled for this offering.</p> : null}{errors.method ? <p className="mt-2 text-xs font-semibold text-coral">{errors.method}</p> : null}{methodConfig ? <div className="mt-5 rounded-2xl border border-navy-100 bg-navy-50/60 p-4"><div className="flex items-start gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-sm ring-1 ring-line">{paymentMethodLogos[methodConfig.id] ? <img src={paymentMethodLogos[methodConfig.id]} alt={`${methodConfig.id} logo`} className="h-full w-full rounded-xl object-contain" /> : <CircleHelp className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="break-words text-xs font-bold text-navy-900">{methodConfig.accountName}</p><p className="mt-1 break-words text-xs font-semibold text-navy-800">{methodConfig.accountNumber}</p>{methodConfig.instructions ? <p className="mt-2 break-words text-[11px] leading-5 text-slate-500">{methodConfig.instructions}</p> : null}{methodConfig.qrImage ? <img src={methodConfig.qrImage} alt={`${methodConfig.id} payment QR`} className="mt-4 max-h-40 w-full rounded-xl bg-white object-contain p-2" /> : null}</div></div><div className="mt-5 rounded-xl bg-white p-3 ring-1 ring-line"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{totalLabel}</p><p className="mt-1 text-xl font-extrabold text-navy-900">{formatCurrency(totalAmount)}</p><p className="mt-1 text-[11px] text-slate-500">{attendeeCount} attendee{attendeeCount === 1 ? "" : "s"}</p></div>{showPaymentTiming ? <div className="mt-5"><FieldLabel>Payment timing</FieldLabel><div className="grid gap-2 sm:grid-cols-2"><ModeOption mode="PayNow" selected={paymentMode === "PayNow"} onClick={() => onModeChange("PayNow")} /><ModeOption mode="PayLater" selected={paymentMode === "PayLater"} deadline={selectedOffering?.payLaterDeadlineAt} onClick={() => onModeChange("PayLater")} /></div>{errors.paymentMode ? <p className="mt-1.5 text-xs font-semibold text-coral">{errors.paymentMode}</p> : null}</div> : null}</div> : null}{isCashless && !isPayLater ? <div className="mt-5"><ProofUpload image={proofImage} error={errors.proofImage} onUpload={onProofUpload} onClear={onProofClear} /></div> : null}</FormSection>;
}

function payLaterAvailableFor(offering: PaymentOffering | undefined, method: PaymentMethod | "") {
  return Boolean(method && offering?.payLaterMethods.includes(method) && offering.payLaterDeadlineAt && !isOverdue(offering.payLaterDeadlineAt));
}

function ReviewPaymentStep({ form, selectedOffering, totalAmount, isPayLater, summarySchoolDetails, submissionTime }: { form: PaymentFormState; selectedOffering?: PaymentOffering; totalAmount: number; isPayLater: boolean; summarySchoolDetails: string; submissionTime: Date }) {
  const names = form.attendeeNames.map((name) => name.trim()).filter(Boolean);
  return <FormSection icon={FileImage} eyebrow="04 · Review payment" title="Check everything before submitting" description="Review the attendee list, total amount, and payment details before sending."><div className="rounded-2xl bg-mist p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-bold text-navy-900">{selectedOffering?.name}</p><p className="mt-1 break-words text-xs text-slate-500">{form.method} · {isPayLater ? "Pay Later" : "Pay Now"} · {formatDateTime(submissionTime)}</p></div><div className="shrink-0 text-right"><p className="text-lg font-extrabold text-navy-900">{formatCurrency(totalAmount)}</p><p className="text-[10px] text-slate-400">{formatCurrency(selectedOffering?.amount ?? 0)} × {names.length}</p></div></div></div><div className="mt-5 rounded-2xl border border-line p-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Attendees</p><ol className="mt-3 space-y-2">{names.map((name, index) => <li key={`${name}-${index}`} className="flex items-center gap-3 text-sm font-semibold text-navy-900"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-[10px] text-navy-700">{index + 1}</span><span className="break-words">{name}</span></li>)}</ol></div><div className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><ReviewLine label="Email" value={form.email} /><ReviewLine label="School details" value={summarySchoolDetails} /><ReviewLine label="Status after submission" value={isPayLater ? "Not Paid Yet" : "Pending admin review"} />{isPayLater ? <ReviewLine label="Deadline" value={selectedOffering?.payLaterDeadlineAt ? formatManilaDateTime(selectedOffering.payLaterDeadlineAt) : "-"} /> : null}</div>{form.proofImage && !isPayLater ? <img src={form.proofImage} alt="Proof preview" className="mt-5 max-h-48 w-full rounded-xl border border-line object-contain bg-slate-50 p-2" /> : null}<div className="mt-5 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-navy-800"><FileImage className="mt-0.5 h-4 w-4 shrink-0" /><span>{isPayLater ? "Your reservation will be saved as Not Paid Yet. A separate attendance QR will be emailed for every attendee." : "Your payment will be saved as Pending and reviewed by the JPCS admin team. Each attendee receives a QR after approval."}</span></div></FormSection>;
}

function CapsuleOption({ label, title, selected, onClick }: { label: string; title?: string; selected: boolean; onClick: () => void }) {
  return <button type="button" title={title} aria-pressed={selected} className={`min-h-11 min-w-[78px] shrink-0 rounded-2xl border px-2 py-2 text-[10px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 motion-safe:hover:-translate-y-0.5 ${selected ? "border-navy-800 bg-navy-900 text-white shadow-[0_0_0_3px_rgba(96,165,250,0.18)]" : "border-line bg-white text-slate-500 hover:border-navy-300 hover:bg-navy-50 hover:text-navy-900"}`} onClick={onClick}>{label}</button>;
}

function OfferingOption({ offering, selected, onClick }: { offering: PaymentOffering; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={selected} className={`group relative overflow-hidden rounded-3xl border p-5 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 motion-safe:hover:-translate-y-0.5 ${selected ? "border-navy-700 bg-navy-900 text-white shadow-[0_0_0_3px_rgba(96,165,250,0.22),0_18px_40px_rgba(11,31,58,0.18)]" : "border-line bg-white hover:border-navy-300 hover:bg-navy-50"}`} onClick={onClick}>
      {offering.imageUrl ? <><img src={offering.imageUrl} alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30 transition duration-500 group-hover:scale-105" /><span className={`pointer-events-none absolute inset-0 ${selected ? "bg-navy-950/60" : "bg-white/70"}`} /></> : null}
      <img src={jpcsLogo} alt="" aria-hidden="true" className="pointer-events-none absolute -right-8 -top-8 z-10 h-36 w-36 rounded-full object-contain opacity-[0.09] transition duration-500 group-hover:rotate-6 group-hover:scale-110" />
      <span className="relative z-10 flex items-start justify-between gap-3"><span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-transparent"><img src={jpcsLogo} alt="JPCS logo" className="h-full w-full rounded-full object-contain" /></span><span className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full border ${selected ? "border-blue-200 bg-blue-400 text-navy-950" : "border-slate-200 text-transparent"}`}><Check className="h-3.5 w-3.5" /></span><span className={`text-xl font-extrabold ${selected ? "text-white" : "text-navy-900"}`}>{formatCurrency(offering.amount)}</span></span></span>
      <span className={`relative z-10 mt-5 block text-[10px] font-bold uppercase tracking-[0.14em] ${selected ? "text-blue-100/60" : "text-slate-400"}`}>Price per name</span>
      <span className={`relative z-10 mt-1 block break-words text-base font-extrabold ${selected ? "text-white" : "text-navy-900"}`}>{offering.name}</span>
    </button>
  );
}

function MethodOption({ method, accountName, logo, selected, onClick }: { method: PaymentMethod; accountName: string; logo?: string; selected: boolean; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} className={`payment-method-option min-w-0 flex-1 rounded-2xl border p-4 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 motion-safe:hover:-translate-y-0.5 ${selected ? "border-navy-700 bg-navy-50 ring-2 ring-blue-400/50 shadow-[0_0_0_3px_rgba(96,165,250,0.18)]" : "border-line bg-white hover:border-navy-300 hover:bg-navy-50"}`} onClick={onClick}><span className="flex items-center justify-between gap-3"><span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${logo ? "overflow-hidden bg-white p-1.5 ring-1 ring-line" : "text-white"}`} style={logo ? undefined : { backgroundColor: methodAccent[method] }}>{logo ? <img src={logo} alt={`${method} logo`} className="h-full w-full rounded-xl object-contain" /> : method === "Cash" ? <Banknote className="h-4 w-4" /> : <WalletCards className="h-4 w-4" />}</span><span className={`flex h-5 w-5 items-center justify-center rounded-full border ${selected ? "border-navy-700 bg-navy-700 text-white" : "border-slate-200 text-transparent"}`}><Check className="h-3 w-3" /></span></span><span className="mt-4 block text-sm font-extrabold text-navy-900">{method}</span><span className="mt-1 block break-words text-[10px] leading-4 text-slate-500">{accountName}</span></button>;
}

function ModeOption({ mode, selected, disabled = false, deadline, onClick }: { mode: PaymentMode; selected: boolean; disabled?: boolean; deadline?: string; onClick: () => void }) {
  return <button type="button" aria-pressed={selected} disabled={disabled} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-700 disabled:cursor-not-allowed disabled:opacity-45 ${selected ? "border-navy-700 bg-navy-900 text-white shadow-[0_0_0_3px_rgba(96,165,250,0.18)]" : "border-line bg-white text-slate-600 hover:border-navy-300 hover:bg-navy-50"}`} onClick={onClick}><span><span className="block text-xs font-extrabold">{mode === "PayLater" ? "Pay Later" : "Pay Now"}</span><span className={`mt-1 block text-[10px] ${selected ? "text-blue-100/70" : "text-slate-400"}`}>{mode === "PayLater" ? deadline ? `Due ${formatManilaDateTime(deadline)}` : "Not configured" : "Submit for review now"}</span></span>{selected ? <Check className="h-4 w-4 shrink-0 text-blue-200" /> : null}</button>;
}

function FormSection({ icon: Icon, eyebrow, children }: { icon: typeof ShieldCheck; eyebrow: string; title?: string; description?: string; children: ReactNode }) {
  return <div className="payment-step-section"><div className="mb-5 flex items-center gap-3 sm:mb-6"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700"><Icon className="h-5 w-5" /></span><p className="text-sm font-extrabold uppercase tracking-[0.1em] text-navy-900">{stepLabels[eyebrow.startsWith("01") ? "details" : eyebrow.startsWith("02") ? "type" : eyebrow.startsWith("03") ? "method" : "review"]}</p></div>{children}</div>;
}

function FormField({ label, required, error, children, className = "" }: { label: string; required?: boolean; error?: string; children: ReactNode; className?: string }) {
  return <div className={className}><FieldLabel required={required}>{label}</FieldLabel>{children}{error ? <p className="mt-1.5 text-xs font-semibold text-coral">{error}</p> : null}</div>;
}

function ProofUpload({ image, error, onUpload, onClear }: { image: string; error?: string; onUpload: (event: ChangeEvent<HTMLInputElement>) => void; onClear: () => void }) {
  return <div className="sm:col-span-2"><FieldLabel required>Proof of payment</FieldLabel>{image ? <div className="relative overflow-hidden rounded-2xl border border-line bg-slate-50 p-2"><img src={image} alt="Uploaded proof preview" className="max-h-64 w-full rounded-xl object-contain" /><div className="absolute right-4 top-4 flex flex-wrap justify-end gap-2"><label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-white px-2.5 text-[10px] font-bold text-navy-800 shadow-sm ring-1 ring-line"><Upload className="h-3.5 w-3.5" />Replace<input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={onUpload} /></label><button type="button" className="rounded-lg bg-white px-2.5 text-[10px] font-bold text-coral shadow-sm ring-1 ring-line" onClick={onClear}>Remove</button></div></div> : <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-5 py-8 text-center transition hover:border-navy-400 hover:bg-navy-50/40"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-navy-700 shadow-sm"><ImagePlus className="h-5 w-5" /></span><span className="mt-3 text-xs font-bold text-navy-900">Upload a screenshot</span><span className="mt-1 text-[10px] text-slate-400">PNG, JPG, or WEBP · maximum 3 MB</span><input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={onUpload} /></label>}{error ? <p className="mt-1.5 text-xs font-semibold text-coral">{error}</p> : null}</div>;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4"><span className="shrink-0 text-xs text-slate-400">{label}</span><span className="min-w-0 max-w-[70%] break-words text-right text-xs font-bold text-navy-900 [overflow-wrap:anywhere]">{value}</span></div>;
}

function ReviewLine({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1 break-words text-xs font-semibold text-navy-900 [overflow-wrap:anywhere]">{value}</p></div>;
}

function LegacyPaymentCompleteContent({ payment, onNewPayment }: { payment: PaymentRecord; onNewPayment: () => void }) {
  const isPayLater = payment.paymentMode === "PayLater";
  const isPaid = payment.paymentState === "Paid";
  const attendees = getPaymentAttendees(payment);
  return <div className="space-y-5"><Card className="p-5 shadow-soft sm:p-7"><div className="flex items-center justify-between gap-3 border-b border-line pb-4"><OrganizationLogo surface="light" /><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isPaid ? "bg-emerald-50 text-emerald-700" : isPayLater ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{isPaid ? "Paid" : isPayLater ? "Not Paid Yet" : "Pending review"}</span></div><div className="mt-5 flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-mint"><Check className="h-5 w-5" /></span><div className="min-w-0"><p className="text-base font-extrabold text-navy-900">{isPaid ? "Payment paid" : isPayLater ? "Reservation saved" : "Payment submitted"}</p><p className="mt-1 break-words text-xs leading-5 text-slate-500">{isPaid ? "Your payment is confirmed." : isPayLater ? "Your reservation is Not Paid Yet. Follow the deadline in your email." : "Your payment is Pending while the JPCS admin team reviews it."}</p></div></div><div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2"><SummaryLine label="Reference" value={payment.reference} /><SummaryLine label="Total" value={formatCurrency(payment.amount)} /><SummaryLine label="Attendees" value={String(attendees.length)} /><SummaryLine label="Type" value={payment.offeringName} /><SummaryLine label="Email" value={payment.email} />{isPayLater && payment.paymentDeadlineAt ? <SummaryLine label="Deadline" value={formatManilaDateTime(payment.paymentDeadlineAt)} /> : null}</div><div className="mt-5 rounded-2xl border border-line p-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">QR list</p><div className="mt-3 space-y-2">{attendees.map((attendee) => <div key={attendee.id} className="flex items-center justify-between gap-3 rounded-xl bg-mist px-3 py-2 text-xs"><span className="break-words font-semibold text-navy-900">{attendee.name}</span><span className="shrink-0 font-mono text-[10px] text-slate-500">{attendee.ticketId ?? "After approval"}</span></div>)}</div></div></Card><div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-navy-800"><ReceiptText className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{isPaid ? `A confirmation email with one QR per attendee will be sent to ${payment.email}.` : isPayLater ? `The attendee QR list was emailed to ${payment.email}. Keep the matching QR for each person.` : `A confirmation email with the attendee QR list will be sent to ${payment.email} after approval.`}</span></div><div className="flex justify-end"><Button variant="outline" onClick={onNewPayment}>Submit another payment</Button></div></div>;
}

function PaymentCompleteContent({ payment, onNewPayment }: { payment: PaymentRecord; onNewPayment: () => void }) {
  const attendees = getPaymentAttendees(payment);
  const isPaid = payment.paymentState === "Paid";
  const isPayLater = payment.paymentMode === "PayLater";
  const emailNotice = payment.emailDeliveryStatus === "Failed"
    ? `The confirmation could not be sent to ${payment.email}.`
    : payment.generateQr
      ? `The confirmation with the attendance QR list will be sent to ${payment.email}.`
      : `Take a screenshot of this confirmation as proof. A confirmation will be sent to ${payment.email}.`;
  return (
    <div className="space-y-5">
      <Card className="p-5 shadow-soft sm:p-7">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-4"><OrganizationLogo surface="light" /><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${isPaid ? "bg-emerald-50 text-emerald-700" : isPayLater ? "bg-amber-50 text-amber-700" : "bg-blue-50 text-blue-700"}`}>{isPaid ? "Paid" : isPayLater ? "Not Paid Yet" : "Pending review"}</span></div>
        <div className="mt-5 flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-mint"><Check className="h-5 w-5" /></span><div className="min-w-0"><p className="text-base font-extrabold text-navy-900">{isPaid ? "Payment paid" : isPayLater ? "Reservation saved" : "Payment submitted"}</p><p className="mt-1 break-words text-xs leading-5 text-slate-500">{isPaid ? "Your payment is confirmed." : isPayLater ? "Your reservation is Not Paid Yet. Follow the deadline in your email." : "Your payment is Pending while the JPCS admin team reviews it."}</p></div></div>
        <div className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2"><SummaryLine label="Reference" value={payment.reference} /><SummaryLine label="Total" value={formatCurrency(payment.amount)} /><SummaryLine label="Attendees" value={String(attendees.length)} /><SummaryLine label="Type" value={payment.offeringName} /><SummaryLine label="Email" value={payment.email} />{isPayLater && payment.paymentDeadlineAt ? <SummaryLine label="Deadline" value={formatManilaDateTime(payment.paymentDeadlineAt)} /> : null}</div>
        {payment.generateQr ? <div className="mt-5 rounded-2xl border border-line p-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Attendance QR status</p><div className="mt-3 space-y-2">{attendees.map((attendee) => <div key={attendee.id} className="flex items-center justify-between gap-3 rounded-xl bg-mist px-3 py-2 text-xs"><span className="break-words font-semibold text-navy-900">{attendee.name}</span><span className="shrink-0 font-mono text-[10px] text-slate-500">{attendee.ticketId ?? "Pending approval"}</span></div>)}</div></div> : null}
        <div className={`mt-5 rounded-2xl border p-4 text-xs leading-5 ${payment.emailDeliveryStatus === "Failed" ? "border-red-100 bg-red-50 text-red-800" : "border-blue-100 bg-blue-50 text-navy-800"}`}>{emailNotice}</div>
        <div className="mt-6 flex justify-end"><Button type="button" onClick={onNewPayment}>Start a new payment</Button></div>
      </Card>
    </div>
  );
}

function PaymentPageSkeleton() {
  return <div className="mx-auto w-full max-w-[1180px] space-y-6" role="status" aria-label="Loading payment portal"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div className="w-full max-w-2xl space-y-3"><Skeleton className="h-3 w-32" /><Skeleton className="h-9 w-72" /><Skeleton className="h-4 w-full max-w-xl" /></div><Skeleton className="h-9 w-32" /></div><div className="flex items-center gap-3"><Skeleton className="h-1.5 min-w-0 flex-1" /><Skeleton className="h-6 w-14 rounded-full" /></div><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><Card className="space-y-6 p-5 sm:p-7"><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 shrink-0" /><Skeleton className="h-5 w-44" /></div><div className="grid gap-5 md:grid-cols-2"><Skeleton className="h-11 md:col-span-2" /><Skeleton className="h-11" /><Skeleton className="h-11" /><Skeleton className="h-11 md:col-span-2" /><Skeleton className="h-11 md:col-span-2" /></div><div className="flex justify-end"><Skeleton className="h-12 w-28" /></div></Card><div className="hidden space-y-6 lg:block"><Card className="overflow-hidden"><Skeleton className="h-32 rounded-none" /><div className="space-y-5 p-5"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div></Card><Card className="space-y-5 p-5"><Skeleton className="h-10 w-40" /><Skeleton className="h-4 w-full" /></Card></div></div></div>;
}

function LegacyPaymentPageSkeleton() {
  return <div className="mx-auto w-full max-w-[1180px] space-y-6" role="status" aria-label="Loading payment portal"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div className="w-full max-w-2xl space-y-3"><Skeleton className="h-3 w-32" /><Skeleton className="h-9 w-72" /><Skeleton className="h-4 w-full max-w-xl" /></div><Skeleton className="h-9 w-32" /></div><div className="overflow-x-hidden"><div className="flex min-w-[620px] items-start"><Skeleton className="h-9 w-9 shrink-0 rounded-full" /><Skeleton className="mt-4 h-px min-w-8 flex-1" /><Skeleton className="h-9 w-9 shrink-0 rounded-full" /><Skeleton className="mt-4 h-px min-w-8 flex-1" /><Skeleton className="h-9 w-9 shrink-0 rounded-full" /><Skeleton className="mt-4 h-px min-w-8 flex-1" /><Skeleton className="h-9 w-9 shrink-0 rounded-full" /><Skeleton className="mt-4 h-px min-w-8 flex-1" /><Skeleton className="h-9 w-9 shrink-0 rounded-full" /></div></div><div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><Card className="space-y-6 p-5 sm:p-7"><div className="flex items-start gap-3"><Skeleton className="h-10 w-10 shrink-0" /><div className="space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-5 w-44" /><Skeleton className="h-3 w-64" /></div></div><div className="grid gap-5 md:grid-cols-2"><Skeleton className="h-11 md:col-span-2" /><Skeleton className="h-11" /><Skeleton className="h-11" /><Skeleton className="h-11 md:col-span-2" /><Skeleton className="h-11 md:col-span-2" /></div><div className="flex justify-end"><Skeleton className="h-12 w-28" /></div></Card><div className="hidden space-y-6 lg:block"><Card className="overflow-hidden"><Skeleton className="h-32 rounded-none" /><div className="space-y-5 p-5"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-full" /></div></Card><Card className="space-y-5 p-5"><Skeleton className="h-10 w-40" /><Skeleton className="h-4 w-full" /></Card></div></div><span className="sr-only">Loading payment portal</span></div>;
}
