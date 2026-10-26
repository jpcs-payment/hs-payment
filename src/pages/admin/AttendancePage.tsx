import { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, ClipboardCheck, ScanLine, ShieldCheck, StopCircle, Ticket, UsersRound } from "lucide-react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { Card, Button, FieldLabel, Input } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../components/Toast";
import { formatCurrency, formatDateTime } from "../../lib/utils";
import type { TicketCheckInResult } from "../../types";

export function AttendancePage() {
  const { data, checkInTicket } = useApp();
  const { pushToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const startingRef = useRef(false);
  const lastDecodedRef = useRef("");
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [result, setResult] = useState<TicketCheckInResult | null>(null);

  const approvedPayments = data.payments.filter((payment) => payment.status === "Approved");
  const checkedInCount = approvedPayments.filter((payment) => payment.attendedAt).length;

  const refreshCameras = async () => {
    try {
      const devices = await BrowserQRCodeReader.listVideoInputDevices();
      setCameraDevices(devices);
      if (!selectedDevice && devices[0]) setSelectedDevice(devices[0].deviceId);
    } catch {
      setCameraDevices([]);
    }
  };

  const stopScanner = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsScanning(false);
  };

  const handleScan = async (value: string) => {
    const scannedValue = value.trim();
    if (!scannedValue) return;
    setManualValue(scannedValue);
    setResult(null);
    const checkInResult = await checkInTicket(scannedValue);
    setResult(checkInResult);
    if (checkInResult.kind === "checked-in") {
      pushToast({ tone: "success", title: "Attendance recorded", message: `${checkInResult.payment.studentName} is checked in for ${checkInResult.payment.offeringName}.` });
    } else if (checkInResult.kind === "already-checked-in") {
      pushToast({ tone: "info", title: "Already checked in", message: `${checkInResult.payment.studentName} was checked in at ${formatDateTime(checkInResult.payment.attendedAt ?? "")}.` });
    } else {
      pushToast({ tone: "error", title: "Ticket not recognized", message: checkInResult.message });
    }
  };

  const startScanner = async () => {
    if (startingRef.current || isScanning || !videoRef.current) return;
    startingRef.current = true;
    setCameraError("");
    setResult(null);
    lastDecodedRef.current = "";
    try {
      const devices = cameraDevices.length ? cameraDevices : await BrowserQRCodeReader.listVideoInputDevices();
      if (devices.length) setCameraDevices(devices);
      const deviceId = selectedDevice || devices[0]?.deviceId;
      if (!readerRef.current) readerRef.current = new BrowserQRCodeReader();
      const controls = await readerRef.current.decodeFromVideoDevice(deviceId, videoRef.current, (decoded, _error, scannerControls) => {
        if (!decoded) return;
        const value = decoded.getText().trim();
        if (!value || value === lastDecodedRef.current) return;
        lastDecodedRef.current = value;
        scannerControls.stop();
        controlsRef.current = null;
        setIsScanning(false);
        setManualValue(value);
        void handleScan(value);
      });
      controlsRef.current = controls;
      setIsScanning(true);
    } catch (error) {
      setCameraError(error instanceof Error && error.name === "NotAllowedError" ? "Camera permission was denied. Allow camera access in the browser and try again." : "The camera could not be started. Use the manual ticket field or check that another app is not using the camera.");
      setIsScanning(false);
    } finally {
      startingRef.current = false;
    }
  };

  const resetScan = () => {
    lastDecodedRef.current = "";
    setManualValue("");
    setResult(null);
    setCameraError("");
  };

  useEffect(() => {
    void refreshCameras();
    return () => {
      controlsRef.current?.stop();
      const stream = videoRef.current?.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="mx-auto max-w-[1450px] space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Event operations</p><h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-navy-900 sm:text-3xl">Attendance scanner</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Scan an approved ticket QR to record one-time attendance. The ticket is matched against the approved payment records in this admin workspace.</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800"><ClipboardCheck className="h-4 w-4" />{checkedInCount} of {approvedPayments.length} checked in</div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3"><AttendanceStat label="Approved tickets" value={approvedPayments.length} detail="Eligible for attendance" icon={Ticket} /><AttendanceStat label="Checked in" value={checkedInCount} detail="One-time scans recorded" icon={UsersRound} /><AttendanceStat label="Remaining" value={Math.max(approvedPayments.length - checkedInCount, 0)} detail="Tickets not yet scanned" icon={ScanLine} /></section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <Card className="overflow-hidden">
          <div className="flex flex-col justify-between gap-4 border-b border-line bg-navy-900 px-5 py-5 text-white sm:flex-row sm:items-center sm:px-6"><div><div className="flex items-center gap-2"><Camera className="h-4 w-4 text-blue-200" /><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-100/60">Live camera</p></div><h3 className="mt-2 text-lg font-extrabold tracking-tight">Scan attendance QR</h3><p className="mt-1 text-[11px] text-blue-100/60">Use a camera with a clear view of the QR code.</p></div><span className={`rounded-full border px-3 py-1.5 text-[10px] font-bold ${isScanning ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-100" : "border-white/15 bg-white/10 text-blue-100"}`}>{isScanning ? "SCANNING" : "CAMERA OFF"}</span></div>
          <div className="space-y-5 p-5 sm:p-6">
            <div className="relative overflow-hidden rounded-2xl bg-slate-950"><video ref={videoRef} className="aspect-video w-full object-cover" autoPlay muted playsInline /><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className={`h-48 w-48 rounded-3xl border-2 ${isScanning ? "border-emerald-300 shadow-[0_0_0_999px_rgba(11,31,58,0.35)]" : "border-white/40"}`} /></div>{!isScanning ? <div className="absolute inset-0 flex items-center justify-center bg-navy-950/55 px-6 text-center text-xs leading-5 text-white/80">Start the camera to scan a ticket QR.</div> : null}</div>
            {cameraError ? <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{cameraError}</div> : null}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"><select className="h-11 w-full rounded-xl border border-line bg-white px-3.5 text-sm text-ink outline-none transition focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10" value={selectedDevice} onChange={(event) => { setSelectedDevice(event.target.value); if (isScanning) stopScanner(); }}><option value="">Default camera</option>{cameraDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select><Button variant={isScanning ? "danger" : "primary"} onClick={isScanning ? stopScanner : startScanner}>{isScanning ? <StopCircle className="h-4 w-4" /> : <Camera className="h-4 w-4" />}{isScanning ? "Stop camera" : "Start camera"}</Button></div>
            <p className="text-[11px] leading-5 text-slate-400">Camera access requires browser permission. On a phone or another device, use HTTPS; `localhost` is permitted for local computer testing.</p>
          </div>
        </Card>

        <div className="space-y-6">
           <Card className="p-5 sm:p-6"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50 text-navy-700"><ShieldCheck className="h-5 w-5" /></span><div><h3 className="text-base font-extrabold text-navy-900">Manual ticket check-in</h3><p className="mt-1 text-xs leading-5 text-slate-500">Use the ticket ID or full QR payload if a camera is unavailable.</p></div></div><form className="mt-5 space-y-3" onSubmit={(event) => { event.preventDefault(); stopScanner(); void handleScan(manualValue); }}><FieldLabel>Ticket ID or QR payload</FieldLabel><Input value={manualValue} onChange={(event) => setManualValue(event.target.value)} placeholder="TKT-26FS-4C80 or JPCS-LCC-TICKET:..." /><div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" onClick={resetScan}>Clear</Button><Button type="submit" disabled={!manualValue.trim()}><ClipboardCheck className="h-4 w-4" />Check in ticket</Button></div></form></Card>
          <ScanResult result={result} onReset={resetScan} />
        </div>
      </div>
    </div>
  );
}

function ScanResult({ result, onReset }: { result: TicketCheckInResult | null; onReset: () => void }) {
  if (!result) return <Card className="border-dashed p-5 sm:p-6"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><ScanLine className="h-5 w-5" /></span><div><h3 className="text-base font-extrabold text-navy-900">Scan result</h3><p className="mt-1 text-xs leading-5 text-slate-500">The attendee details and check-in status will appear here after a scan.</p></div></div></Card>;
  const isSuccess = result.kind === "checked-in";
  const isDuplicate = result.kind === "already-checked-in";
  const payment = isSuccess || isDuplicate ? result.payment : null;
  return <Card className={`overflow-hidden ${isSuccess ? "border-emerald-200" : isDuplicate ? "border-amber-200" : "border-red-200"}`}><div className={`border-b px-5 py-4 sm:px-6 ${isSuccess ? "bg-emerald-50" : isDuplicate ? "bg-amber-50" : "bg-red-50"}`}><div className="flex items-center gap-3">{isSuccess ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : <AlertCircle className={`h-5 w-5 ${isDuplicate ? "text-amber-700" : "text-red-700"}`} />}<div><p className={`text-xs font-bold uppercase tracking-[0.1em] ${isSuccess ? "text-emerald-900" : isDuplicate ? "text-amber-900" : "text-red-900"}`}>{isSuccess ? "Attendance recorded" : isDuplicate ? "Already checked in" : "Ticket rejected"}</p><p className="mt-1 text-[11px] leading-5 text-slate-600">{isSuccess ? "This approved ticket has been marked as attended." : isDuplicate ? "This ticket cannot be checked in twice." : result.message}</p></div></div></div>{payment ? <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6"><Detail label="Student" value={payment.studentName} /><Detail label="Offering" value={payment.offeringName} /><Detail label="Ticket ID" value={payment.ticketId ?? "-"} /><Detail label="Amount" value={formatCurrency(payment.amount)} /><Detail label="Receipt" value={payment.receiptNumber ?? "-"} /><Detail label={isSuccess ? "Checked in at" : "First checked in"} value={formatDateTime(payment.attendedAt ?? "")} /></div> : null}<div className="flex justify-end border-t border-line px-5 py-4 sm:px-6"><Button variant="outline" size="sm" onClick={onReset}>Scan next ticket</Button></div></Card>;
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const technical = mono ?? /reference|receipt|ticket|identifier/i.test(label);
  return <div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className={`${technical ? "font-mono" : ""} mt-1.5 break-words text-xs font-semibold text-navy-900`}>{value}</p></div>;
}

function AttendanceStat({ label, value, detail, icon: Icon }: { label: string; value: number; detail: string; icon: typeof Ticket }) {
  return <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-3 text-2xl font-extrabold text-navy-900">{String(value).padStart(2, "0")}</p><p className="mt-1 text-[11px] text-slate-400">{detail}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-50 text-navy-700"><Icon className="h-4 w-4" /></span></div></Card>;
}
