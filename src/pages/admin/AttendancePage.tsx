import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { AlertCircle, Camera, CheckCircle2, ClipboardCheck, Clock3, Download, RotateCcw, ScanLine, Search, StopCircle, Ticket, UsersRound, XCircle } from "lucide-react";
import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { Pagination } from "../../components/Pagination";
import { Card, Button, ConfirmDialog, FieldLabel, Input, Select } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../components/Toast";
import { downloadCsv } from "../../lib/export";
import { formatCurrency, formatDateTime } from "../../lib/utils";
import { getPageCount, getPageItems } from "../../lib/pagination";
import type { PaymentRecord, TicketCheckInResult } from "../../types";

interface ScanHistoryItem {
  id: string;
  scannedAt: string;
  result: TicketCheckInResult;
}

const isUnpaidPayLater = (payment: PaymentRecord) => payment.paymentMode === "PayLater" && payment.paymentState === "Unpaid" && payment.status === "Pending";
const isAttendanceEligible = (payment: PaymentRecord) => Boolean(payment.ticketId && (payment.status === "Approved" || isUnpaidPayLater(payment)));
const manilaDateTimeFormatter = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const manilaDateTimeParts = (value: string) => Object.fromEntries(manilaDateTimeFormatter.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
const manilaDateKey = (value: string) => { const parts = manilaDateTimeParts(value); return `${parts.year}-${parts.month}-${parts.day}`; };
const manilaTimeKey = (value: string) => { const parts = manilaDateTimeParts(value); return `${parts.hour}:${parts.minute}`; };
const PAGE_SIZE = 10;

export function AttendancePage() {
  const { data, checkInTicket, undoAttendance } = useApp();
  const { pushToast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);
  const startingRef = useRef(false);
  const scanProcessingRef = useRef(false);
  const scannerGenerationRef = useRef(0);
  const mountedRef = useRef(true);
  const lastDecodedRef = useRef("");
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manualValue, setManualValue] = useState("");
  const [result, setResult] = useState<TicketCheckInResult | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanHistoryItem[]>([]);
  const [eventFilter, setEventFilter] = useState("All types");
  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [undoId, setUndoId] = useState<string | null>(null);
  const [undoLoading, setUndoLoading] = useState(false);
  const [page, setPage] = useState(1);

  const eligiblePayments = useMemo(
    () => data.payments.filter(isAttendanceEligible),
    [data.payments],
  );
  const events = useMemo(
    () => [
      "All types",
      ...Array.from(
        new Set(eligiblePayments.map((payment) => payment.offeringName)),
      ),
    ],
    [eligiblePayments],
  );
  const filteredAttendance = useMemo(
    () =>
      eligiblePayments
        .filter((payment) => {
          if (
            eventFilter !== "All types" &&
            payment.offeringName !== eventFilter
          )
            return false;
          if (
            query &&
            !`${payment.studentName} ${payment.email} ${payment.reference} ${payment.ticketId ?? ""}`
              .toLowerCase()
              .includes(query.toLowerCase())
          )
            return false;
          if (
            dateFrom &&
            (!payment.attendedAt ||
              manilaDateKey(payment.attendedAt) < dateFrom)
          )
            return false;
          if (
            dateTo &&
            (!payment.attendedAt || manilaDateKey(payment.attendedAt) > dateTo)
          )
            return false;
          if (timeFrom || timeTo) {
            if (!payment.attendedAt) return false;
            const time = manilaTimeKey(payment.attendedAt);
            if (timeFrom && time < timeFrom) return false;
            if (timeTo && time > timeTo) return false;
          }
          return true;
        })
        .sort((a, b) => (b.attendedAt ?? "").localeCompare(a.attendedAt ?? "")),
    [dateFrom, dateTo, eligiblePayments, eventFilter, query, timeFrom, timeTo],
  );
  const checkedInCount = filteredAttendance.filter(
    (payment) => payment.attendedAt,
  ).length;
  const pendingAfterAttendance = filteredAttendance.filter(
    (payment) => payment.attendedAt && isUnpaidPayLater(payment),
  ).length;
  const pageCount = getPageCount(filteredAttendance.length, PAGE_SIZE);
  const visibleAttendance = getPageItems(filteredAttendance, page, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [dateFrom, dateTo, eventFilter, query, timeFrom, timeTo]);

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

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
    scannerGenerationRef.current += 1;
    startingRef.current = false;
    controlsRef.current?.stop();
    controlsRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream instanceof MediaStream)
      stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    lastDecodedRef.current = "";
    setCameraStarting(false);
    setIsScanning(false);
  };

  const handleScan = async (value: string) => {
    const scannedValue = value.trim();
    if (!scannedValue || scanLoading || scanProcessingRef.current) return;
    scanProcessingRef.current = true;
    setManualValue(scannedValue);
    setResult(null);
    setScanLoading(true);
    try {
      const checkInResult = await checkInTicket(scannedValue);
      setResult(checkInResult);
      setScanHistory((current) =>
        [
          {
            id: `${Date.now()}-${Math.random()}`,
            scannedAt: new Date().toISOString(),
            result: checkInResult,
          },
          ...current,
        ].slice(0, 8),
      );
      if (checkInResult.kind === "checked-in")
        pushToast({
          tone: checkInResult.paymentPending ? "info" : "success",
          title: checkInResult.paymentPending
            ? "Attendance recorded, payment pending"
            : "Attendance recorded",
          message: checkInResult.paymentPending
            ? `${checkInResult.payment.studentName} attended, but ${formatCurrency(checkInResult.payment.amount)} is still unpaid.`
            : `${checkInResult.payment.studentName} is checked in for ${checkInResult.payment.offeringName}.`,
        });
      else if (checkInResult.kind === "already-checked-in")
        pushToast({
          tone: "info",
          title: "Already checked in",
          message: `${checkInResult.payment.studentName} was checked in at ${formatDateTime(checkInResult.payment.attendedAt ?? "")}.`,
        });
      else if (checkInResult.kind === "unpaid")
        pushToast({
          tone: "error",
          title: "Payment not received",
          message: `${checkInResult.payment.studentName}'s Pay Later payment is still marked Not Paid Yet.`,
        });
      else
        pushToast({
          tone: "error",
          title: "Ticket not recognized",
          message: checkInResult.message,
        });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The attendance check-in could not be saved.";
      setResult({ ok: false, kind: "invalid", message });
      pushToast({ tone: "error", title: "Check-in failed", message });
    } finally {
      scanProcessingRef.current = false;
      setScanLoading(false);
    }
  };

  const startScanner = async () => {
    if (startingRef.current || isScanning || !videoRef.current) return;
    startingRef.current = true;
    const generation = ++scannerGenerationRef.current;
    setCameraStarting(true);
    setCameraError("");
    setResult(null);
    lastDecodedRef.current = "";
    try {
      const devices = cameraDevices.length
        ? cameraDevices
        : await BrowserQRCodeReader.listVideoInputDevices();
      if (devices.length) setCameraDevices(devices);
      const deviceId = selectedDevice || devices[0]?.deviceId;
      if (!readerRef.current) readerRef.current = new BrowserQRCodeReader();
      const controls = await readerRef.current.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (decoded, _error, scannerControls) => {
          if (
            !mountedRef.current ||
            generation !== scannerGenerationRef.current
          )
            return;
          if (!decoded) return;
          const value = decoded.getText().trim();
          if (!value || value === lastDecodedRef.current) return;
          lastDecodedRef.current = value;
          if (!controlsRef.current) controlsRef.current = scannerControls;
          setManualValue(value);
          void handleScan(value);
        },
      );
      if (!mountedRef.current || generation !== scannerGenerationRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setIsScanning(true);
    } catch (error) {
      if (mountedRef.current && generation === scannerGenerationRef.current) {
        setCameraError(
          error instanceof Error && error.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in the browser and try again."
            : "The camera could not be started. Use the manual ticket field or check that another app is not using the camera.",
        );
        setIsScanning(false);
      }
    } finally {
      if (generation === scannerGenerationRef.current) {
        startingRef.current = false;
        setCameraStarting(false);
      }
    }
  };

  const handleDeviceChange = (deviceId: string) => {
    if (deviceId !== selectedDevice && (isScanning || startingRef.current))
      stopScanner();
    setSelectedDevice(deviceId);
  };

  const resetScan = () => {
    lastDecodedRef.current = "";
    setManualValue("");
    setResult(null);
    setCameraError("");
  };

  const exportCsv = () => {
    const headers = [
      "Type",
      "Student",
      "Email",
      "Reference",
      "Ticket ID",
      "Amount",
      "Payment method",
      "Payment mode",
      "Payment state",
      "Attendance status",
      "Checked in at",
    ];
    const rows = filteredAttendance.map((payment) => [
      payment.offeringName,
      payment.studentName,
      payment.email,
      payment.reference,
      payment.ticketId ?? "",
      String(payment.amount),
      payment.method,
      payment.paymentMode,
      payment.paymentState,
      payment.attendedAt
        ? isUnpaidPayLater(payment)
          ? "Checked in · Payment pending"
          : "Checked in"
        : "Not checked in",
      payment.attendedAt ? formatDateTime(payment.attendedAt) : "",
    ]);
    downloadCsv(
      `jpcs-attendance-${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows,
    );
    pushToast({
      tone: "success",
      title: "Attendance report exported",
      message: `${filteredAttendance.length} ticket records were included.`,
    });
  };

  const handleUndoAttendance = async () => {
    if (!undoId) return;
    setUndoLoading(true);
    try {
      const payment = await undoAttendance(undoId);
      if (payment)
        pushToast({
          tone: "success",
          title: "Attendance removed",
          message: `${payment.studentName} can be checked in again.`,
        });
      setUndoId(null);
    } catch (error) {
      pushToast({
        tone: "error",
        title: "Could not remove attendance",
        message: error instanceof Error ? error.message : "Try again.",
      });
    } finally {
      setUndoLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    void refreshCameras();
    return () => {
      mountedRef.current = false;
      stopScanner();
    };
  }, []);

  return (
    <div className="mx-auto max-w-[1450px] space-y-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">
            Event operations
          </p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-[-0.035em] text-navy-900 sm:text-3xl">
            Attendance scanner
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Scan approved tickets or unpaid Pay Later QR codes. Attendance is
            recorded immediately while unpaid reservations remain visible for
            payment follow-up.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
            <ClipboardCheck className="h-4 w-4" />
            {checkedInCount} checked in
          </span>
          {pendingAfterAttendance ? (
            <span className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
              <Clock3 className="h-4 w-4" />
              {pendingAfterAttendance} payment pending
            </span>
          ) : null}
        </div>
      </div>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AttendanceStat
          label="Eligible tickets"
          value={filteredAttendance.length}
          detail="Approved or Pay Later"
          icon={Ticket}
        />
        <AttendanceStat
          label="Checked in"
          value={checkedInCount}
          detail="Attendance recorded"
          icon={UsersRound}
        />
        <AttendanceStat
          label="Remaining"
          value={Math.max(filteredAttendance.length - checkedInCount, 0)}
          detail="Not yet scanned"
          icon={ScanLine}
        />
        <AttendanceStat
          label="Needs payment"
          value={pendingAfterAttendance}
          detail="Attended while unpaid"
          icon={Clock3}
        />
      </section>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <ScannerCard
          cameraDevices={cameraDevices}
          cameraError={cameraError}
          cameraStarting={cameraStarting}
          isScanning={isScanning}
          manualValue={manualValue}
          selectedDevice={selectedDevice}
          scanLoading={scanLoading}
          videoRef={videoRef}
          onManualChange={setManualValue}
          onDeviceChange={handleDeviceChange}
          onStart={() => void startScanner()}
          onStop={stopScanner}
          onScan={() => void handleScan(manualValue)}
        />
        <div className="space-y-6">
          <ScanResult result={result} onReset={resetScan} />
          <ScanHistory history={scanHistory} />
        </div>
      </section>
      <AttendanceFilters
        eventFilter={eventFilter}
        events={events}
        query={query}
        dateFrom={dateFrom}
        dateTo={dateTo}
        timeFrom={timeFrom}
        timeTo={timeTo}
        resultCount={filteredAttendance.length}
        onEventChange={setEventFilter}
        onQueryChange={setQuery}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onTimeFromChange={setTimeFrom}
        onTimeToChange={setTimeTo}
        onExport={exportCsv}
      />
      <AttendanceList
        payments={visibleAttendance}
        onUndo={(payment) => setUndoId(payment.id)}
        page={page}
        pageCount={pageCount}
        onPageChange={setPage}
      />
      <ConfirmDialog
        open={Boolean(undoId)}
        onClose={() => setUndoId(null)}
        onConfirm={() => void handleUndoAttendance()}
        title="Undo attendance?"
        description="This clears the check-in time but keeps the payment and ticket record. The attendee can be scanned again."
        confirmLabel="Undo check-in"
        loading={undoLoading}
      />
    </div>
  );
}

function AttendanceFilters({ eventFilter, events, query, dateFrom, dateTo, timeFrom, timeTo, resultCount, onEventChange, onQueryChange, onDateFromChange, onDateToChange, onTimeFromChange, onTimeToChange, onExport }: { eventFilter: string; events: string[]; query: string; dateFrom: string; dateTo: string; timeFrom: string; timeTo: string; resultCount: number; onEventChange: (value: string) => void; onQueryChange: (value: string) => void; onDateFromChange: (value: string) => void; onDateToChange: (value: string) => void; onTimeFromChange: (value: string) => void; onTimeToChange: (value: string) => void; onExport: () => void }) {
  return <Card className="p-4 sm:p-5"><div className="flex flex-col gap-4"><div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Attendance report</p><h3 className="mt-1 text-base font-extrabold text-navy-900">Filter and export check-ins</h3><p className="mt-1 text-xs text-slate-500">{resultCount} matching ticket{resultCount === 1 ? "" : "s"}</p></div><Button className="w-full sm:w-auto" variant="outline" size="sm" onClick={onExport} disabled={!resultCount}><Download className="h-3.5 w-3.5" /> Export CSV</Button></div><div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-7"><div className="min-w-0 2xl:col-span-2"><FieldLabel>Search</FieldLabel><div className="relative"><Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-slate-400" /><Input className="min-w-0 pl-10" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Student, email, reference, ticket" /></div></div><div className="min-w-0"><FieldLabel>Type</FieldLabel><Select className="min-w-0" value={eventFilter} onChange={(event) => onEventChange(event.target.value)}>{events.map((event) => <option key={event}>{event}</option>)}</Select></div><div className="min-w-0"><FieldLabel>Date from</FieldLabel><Input className="min-w-0" type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} /></div><div className="min-w-0"><FieldLabel>Date to</FieldLabel><Input className="min-w-0" type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} /></div><div className="min-w-0"><FieldLabel>Time from</FieldLabel><Input className="min-w-0" type="time" value={timeFrom} onChange={(event) => onTimeFromChange(event.target.value)} /></div><div className="min-w-0"><FieldLabel>Time to</FieldLabel><Input className="min-w-0" type="time" value={timeTo} onChange={(event) => onTimeToChange(event.target.value)} /></div></div></div></Card>;
}

interface ScannerCardProps {
  cameraDevices: MediaDeviceInfo[];
  cameraError: string;
  cameraStarting: boolean;
  isScanning: boolean;
  manualValue: string;
  selectedDevice: string;
  scanLoading: boolean;
  videoRef: RefObject<HTMLVideoElement>;
  onManualChange: (value: string) => void;
  onDeviceChange: (value: string) => void;
  onStart: () => void;
  onStop: () => void;
  onScan: () => void;
}

function ScannerCard({ cameraDevices, cameraError, cameraStarting, isScanning, manualValue, selectedDevice, scanLoading, videoRef, onManualChange, onDeviceChange, onStart, onStop, onScan }: ScannerCardProps) {
  const cameraActive = isScanning || cameraStarting;
  return <Card className="overflow-hidden"><div className="border-b border-line bg-navy-900 px-5 py-5 text-white sm:px-6"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-100/60">Check-in desk</p><h3 className="mt-1 text-base font-extrabold">Scan attendance QR</h3></div><Camera className="h-5 w-5 text-blue-200" /></div></div><div className="space-y-4 p-5 sm:p-6"><div className="relative aspect-video overflow-hidden rounded-2xl bg-navy-950"><video ref={videoRef} className="h-full w-full object-cover" muted playsInline /><div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/35" />{!isScanning ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-navy-950/65 text-center text-white"><ScanLine className="h-8 w-8 text-blue-200" /><p className="text-xs font-semibold">{cameraStarting ? "Starting camera..." : "Camera is ready"}</p></div> : null}</div>{cameraError ? <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{cameraError}</div> : null}{cameraDevices.length > 1 ? <Select value={selectedDevice} onChange={(event) => onDeviceChange(event.target.value)} disabled={cameraActive} aria-label="Camera device">{cameraDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</Select> : null}<div className="flex flex-col gap-2 sm:flex-row"><Button className="flex-1" onClick={onStart} disabled={cameraActive} loading={cameraStarting}><Camera className="h-4 w-4" /> Start camera</Button><Button className="flex-1" variant="outline" onClick={onStop} disabled={!cameraActive}><StopCircle className="h-4 w-4" /> Stop camera</Button></div><div className="border-t border-line pt-4"><FieldLabel>Manual ticket or QR value</FieldLabel><div className="flex gap-2"><Input className="min-w-0" value={manualValue} onChange={(event) => onManualChange(event.target.value)} placeholder="Paste ticket ID or QR text" /><Button variant="secondary" onClick={onScan} disabled={!manualValue.trim()} loading={scanLoading}>Scan</Button></div><p className="mt-2 text-[11px] leading-5 text-slate-400">The camera stays active after a successful scan. Use Stop camera when the check-in desk is closed.</p></div></div></Card>;
}

function LegacyScannerCard({ cameraDevices, cameraError, cameraStarting, isScanning, manualValue, selectedDevice, scanLoading, videoRef, onManualChange, onDeviceChange, onStart, onStop, onScan }: ScannerCardProps) {
  return <Card className="overflow-hidden"><div className="border-b border-line bg-navy-900 px-5 py-5 text-white sm:px-6"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-100/60">Check-in desk</p><h3 className="mt-1 text-base font-extrabold">Scan attendance QR</h3></div><Camera className="h-5 w-5 text-blue-200" /></div></div><div className="space-y-4 p-5 sm:p-6"><div className="relative aspect-video overflow-hidden rounded-2xl bg-navy-950"><video ref={videoRef} className="h-full w-full object-cover" muted playsInline /><div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/35" />{!isScanning ? <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-navy-950/65 text-center text-white"><ScanLine className="h-8 w-8 text-blue-200" /><p className="text-xs font-semibold">Camera is ready</p></div> : null}</div>{cameraError ? <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{cameraError}</div> : null}{cameraDevices.length > 1 ? <Select value={selectedDevice} onChange={(event) => onDeviceChange(event.target.value)} aria-label="Camera device">{cameraDevices.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</Select> : null}<div className="flex flex-col gap-2 sm:flex-row"><Button className="flex-1" onClick={onStart} disabled={isScanning}><Camera className="h-4 w-4" /> Start camera</Button><Button className="flex-1" variant="outline" onClick={onStop} disabled={!isScanning}><StopCircle className="h-4 w-4" /> Stop camera</Button></div><div className="border-t border-line pt-4"><FieldLabel>Manual ticket or QR value</FieldLabel><div className="flex gap-2"><Input className="min-w-0" value={manualValue} onChange={(event) => onManualChange(event.target.value)} placeholder="TKT-... or full QR value" /><Button onClick={onScan} loading={scanLoading} disabled={!manualValue.trim()}>Check in</Button></div></div></div></Card>;
}

function AttendanceList({
  payments,
  onUndo,
  page,
  pageCount,
  onPageChange,
}: {
  payments: PaymentRecord[];
  onUndo: (payment: PaymentRecord) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (!payments.length)
    return (
      <Card className="overflow-hidden">
        <div className="border-b border-line px-5 py-5 sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Student attendance list
          </p>
          <h3 className="mt-1 text-base font-extrabold text-navy-900">
            Filtered tickets
          </h3>
        </div>
        <div className="p-8 text-center text-sm text-slate-500">
          No tickets match the current filters.
        </div>
      </Card>
    );
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-5 py-5 sm:px-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
          Student attendance list
        </p>
        <h3 className="mt-1 text-base font-extrabold text-navy-900">
          Filtered tickets
        </h3>
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1050px] text-left">
          <thead className="border-b border-line bg-mist text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
            <tr>
              <th className="px-5 py-3">Student</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Ticket</th>
              <th className="px-5 py-3">Attendance</th>
              <th className="px-5 py-3">Payment</th>
              <th className="px-5 py-3">Checked in</th>
              <th className="px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {payments.map((payment) => (
              <AttendanceRow
                key={payment.id}
                payment={payment}
                onUndo={onUndo}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 p-4 md:hidden">
        {payments.map((payment) => (
          <div key={payment.id} className="rounded-2xl border border-line p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-bold text-navy-900">
                  {payment.studentName}
                </p>
                <p className="mt-1 break-words text-xs text-slate-400">
                  {payment.email}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-navy-50 px-2.5 py-1 text-[10px] font-bold text-navy-700">
                {payment.paymentMode}
              </span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
              <Detail label="Type" value={payment.offeringName} />
              <Detail label="Ticket" value={payment.ticketId ?? "-"} />
              <Detail
                label="Attendance"
                value={payment.attendedAt ? "Checked in" : "Not checked in"}
              />
              <Detail
                label="Payment"
                value={isUnpaidPayLater(payment) ? "Payment pending" : "Paid"}
              />
            </dl>
            {payment.attendedAt ? (
              <Button
                className="mt-4 w-full"
                size="sm"
                variant="outline"
                onClick={() => onUndo(payment)}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Undo check-in
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      <Pagination page={page} pageCount={pageCount} onPageChange={onPageChange} />
    </Card>
  );
}

function AttendanceRow({ payment, onUndo }: { payment: PaymentRecord; onUndo: (payment: PaymentRecord) => void }) {
  const pending = isUnpaidPayLater(payment);
  return <tr className="text-xs"><td className="px-5 py-4"><p className="font-bold text-navy-900">{payment.studentName}</p><p className="mt-1 text-slate-400">{payment.email}</p></td><td className="px-5 py-4 font-semibold text-slate-600">{payment.offeringName}</td><td className="px-5 py-4 font-mono text-[10px] font-bold text-navy-800">{payment.ticketId}</td><td className="px-5 py-4">{payment.attendedAt ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Checked in</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">Not checked in</span>}</td><td className="px-5 py-4">{pending ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">Payment pending</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Paid</span>}</td><td className="px-5 py-4 font-semibold text-slate-600">{payment.attendedAt ? formatDateTime(payment.attendedAt) : "-"}</td><td className="px-5 py-4">{payment.attendedAt ? <Button size="sm" variant="outline" onClick={() => onUndo(payment)}><RotateCcw className="h-3.5 w-3.5" /> Undo</Button> : <span className="text-slate-400">-</span>}</td></tr>;
}

function LegacyAttendanceList({ payments }: { payments: PaymentRecord[] }) {
  return <Card className="overflow-hidden"><div className="border-b border-line px-5 py-5 sm:px-6"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Student attendance list</p><h3 className="mt-1 text-base font-extrabold text-navy-900">Filtered tickets</h3></div>{payments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left"><thead className="border-b border-line bg-mist text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400"><tr><th className="px-5 py-3">Student</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Ticket</th><th className="px-5 py-3">Attendance</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Checked in</th></tr></thead><tbody className="divide-y divide-line">{payments.map((payment) => { const pending = isUnpaidPayLater(payment); return <tr key={payment.id} className="text-xs"><td className="px-5 py-4"><p className="font-bold text-navy-900">{payment.studentName}</p><p className="mt-1 text-slate-400">{payment.email}</p></td><td className="px-5 py-4 font-semibold text-slate-600">{payment.offeringName}</td><td className="px-5 py-4 font-mono text-[10px] font-bold text-navy-800">{payment.ticketId}</td><td className="px-5 py-4">{payment.attendedAt ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Checked in</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">Not checked in</span>}</td><td className="px-5 py-4">{pending ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">Payment pending</span> : <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">Paid</span>}</td><td className="px-5 py-4 font-semibold text-slate-600">{payment.attendedAt ? formatDateTime(payment.attendedAt) : "-"}</td></tr>; })}</tbody></table></div> : <div className="p-8 text-center text-sm text-slate-500">No tickets match the current filters.</div>}</Card>;
}

function ScanHistory({ history }: { history: ScanHistoryItem[] }) {
  return <Card className="p-5 sm:p-6"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Recent scans</p><h3 className="mt-1 text-base font-extrabold text-navy-900">Session history</h3></div><ScanLine className="h-5 w-5 text-navy-700" /></div>{history.length ? <div className="mt-4 space-y-2">{history.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-mist px-3 py-2.5 text-xs"><span className="min-w-0 truncate font-semibold text-navy-800">{"payment" in item.result ? item.result.payment.studentName : item.result.message}</span><span className={`shrink-0 text-[10px] font-bold ${item.result.kind === "checked-in" ? item.result.paymentPending ? "text-amber-700" : "text-emerald-700" : item.result.kind === "already-checked-in" ? "text-amber-700" : "text-coral"}`}>{item.result.kind === "checked-in" ? item.result.paymentPending ? "Recorded · unpaid" : "Recorded" : item.result.kind === "already-checked-in" ? "Duplicate" : item.result.kind === "unpaid" ? "Unpaid" : "Rejected"}</span></div>)}</div> : <p className="mt-4 text-xs leading-5 text-slate-500">Scan results will appear here during this session.</p>}</Card>;
}

function ScanResult({ result, onReset }: { result: TicketCheckInResult | null; onReset: () => void }) {
  if (!result) return <Card className="border-dashed p-5 sm:p-6"><div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><ScanLine className="h-5 w-5" /></span><div><h3 className="text-base font-extrabold text-navy-900">Scan result</h3><p className="mt-1 text-xs leading-5 text-slate-500">Attendee details and payment state appear here after a scan.</p></div></div></Card>;
  const isSuccess = result.kind === "checked-in";
  const isDuplicate = result.kind === "already-checked-in";
  const paymentPending = (isSuccess || isDuplicate) ? result.paymentPending : false;
  const payment = "payment" in result ? result.payment : null;
  return <Card className={`overflow-hidden ${isSuccess ? "border-emerald-200" : isDuplicate ? "border-amber-200" : "border-red-200"}`}><div className={`border-b px-5 py-4 sm:px-6 ${isSuccess ? "bg-emerald-50" : isDuplicate ? "bg-amber-50" : "bg-red-50"}`}><div className="flex items-center gap-3">{isSuccess ? <CheckCircle2 className="h-5 w-5 text-emerald-700" /> : isDuplicate ? <Clock3 className="h-5 w-5 text-amber-700" /> : <XCircle className="h-5 w-5 text-red-700" />}<div><p className={`text-xs font-bold uppercase tracking-[0.1em] ${isSuccess ? "text-emerald-900" : isDuplicate ? "text-amber-900" : "text-red-900"}`}>{isSuccess ? paymentPending ? "Attendance recorded · payment pending" : "Attendance recorded" : isDuplicate ? "Already checked in" : result.kind === "unpaid" ? "Payment pending" : "Ticket rejected"}</p><p className="mt-1 text-[11px] leading-5 text-slate-600">{isSuccess ? paymentPending ? "The attendee entered the event, but the Pay Later amount still needs to be collected." : "This ticket has been marked as attended." : isDuplicate ? "This ticket cannot be checked in twice." : result.kind === "unpaid" ? "The Pay Later payment remains unpaid." : result.message}</p></div></div></div>{payment ? <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6"><Detail label="Student" value={payment.studentName} /><Detail label="Type" value={payment.offeringName} /><Detail label="Ticket ID" value={payment.ticketId ?? "-"} /><Detail label="Amount" value={formatCurrency(payment.amount)} /><Detail label="Payment state" value={payment.paymentState === "Unpaid" ? "Not Paid Yet" : payment.paymentState} /><Detail label={payment.attendedAt ? "Checked in at" : "Attendance"} value={payment.attendedAt ? formatDateTime(payment.attendedAt) : "Not checked in"} /></div> : null}<div className="flex justify-end border-t border-line px-5 py-4 sm:px-6"><Button variant="outline" size="sm" onClick={onReset}>Scan next ticket</Button></div></Card>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className="mt-1.5 break-words text-xs font-semibold text-navy-900 [overflow-wrap:anywhere]">{value}</p></div>;
}

function AttendanceStat({ label, value, detail, icon: Icon }: { label: string; value: number; detail: string; icon: typeof Ticket }) {
  return <Card className="p-5"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p><p className="mt-3 text-2xl font-extrabold text-navy-900">{String(value).padStart(2, "0")}</p><p className="mt-1 text-[11px] text-slate-400">{detail}</p></div><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-navy-50 text-navy-700"><Icon className="h-4 w-4" /></span></div></Card>;
}
