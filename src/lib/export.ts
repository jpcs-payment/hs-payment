import type { PaymentRecord } from "../types";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import pdfFontUrl from "../assets/geist-pdf.ttf?url";
import { BRANDING } from "./branding";
import { formatCurrency, formatDateTime } from "./utils";
import { getPaymentAttendees, getPaymentNameLines } from "./payment";
import { groupAttendanceEntries, type AttendanceReportEntry } from "./reporting";

type CsvValue = string | number | boolean | null | undefined;
type PdfValue = string | number | boolean | null | undefined;

const csvCell = (value: CsvValue) => {
  const text = String(value ?? "");
  const safeText = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
};

export const downloadCsv = (filename: string, headers: string[], rows: CsvValue[][]) => {
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

export const paymentExportHeaders = [
  "Reference",
  "Site",
  "Payer",
  "Attendee count",
  "Attendee names",
  "Email",
  "School level",
  "Year level",
  "Section",
  "Strand",
  "Course",
  "Type",
  "Amount",
  "Allocations",
  "Payment method",
  "Payment mode",
  "Payment status",
  "Payment state",
  "Deadline",
  "Submitted at",
  "Paid at",
  "Receipt number",
  "Ticket ID",
  "Ticket IDs",
  "Attended at",
];

export const paymentToExportRow = (payment: PaymentRecord): CsvValue[] => [
  payment.reference,
  payment.siteKey === "test-payment" ? "Test" : "Public",
  payment.studentName,
  getPaymentAttendees(payment).length,
  getPaymentNameLines(payment),
  payment.email,
  payment.schoolLevel,
  payment.yearLevel,
  payment.section,
  payment.strand,
  payment.course,
  payment.offeringName,
  formatCurrency(payment.amount),
  payment.allocations.map((allocation) => `${allocation.recipient}: ${formatCurrency(allocation.amount)}`).join(" | "),
  payment.method,
  payment.paymentMode,
  payment.status,
  payment.paymentState,
  payment.paymentDeadlineAt,
  payment.submittedAt,
  payment.paidAt,
  payment.receiptNumber,
  payment.ticketId,
  getPaymentAttendees(payment).map((attendee) => `${attendee.name}: ${attendee.ticketId ?? "-"}`).join(" | "),
  payment.attendedAt,
];

export const downloadPaymentCsv = (payments: PaymentRecord[], filename = `jpcs-payment-report-${new Date().toISOString().slice(0, 10)}.csv`) => {
  downloadCsv(filename, paymentExportHeaders, payments.map(paymentToExportRow));
};

interface PdfExportOptions {
  filename: string;
  title: string;
  subtitle?: string;
  headers: string[];
  rows: PdfValue[][];
  orientation?: "portrait" | "landscape";
}

const pdfText = (value: PdfValue) => String(value ?? "-");
const pdfFontFile = "geist-pdf.ttf";
const pdfFontName = "GeistPdf";

const toBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return window.btoa(binary);
};

let pdfFontBase64Promise: Promise<string | null> | null = null;
const loadPdfFont = () => {
  if (!pdfFontBase64Promise) {
    pdfFontBase64Promise = fetch(pdfFontUrl)
      .then((response) => response.ok ? response.arrayBuffer() : Promise.reject(new Error("PDF font could not be loaded.")))
      .then(toBase64)
      .catch(() => null);
  }
  return pdfFontBase64Promise;
};

const registerPdfFont = async (document: jsPDF) => {
  const base64 = await loadPdfFont();
  if (!base64) return "helvetica";
  try {
    document.addFileToVFS(pdfFontFile, base64);
    document.addFont(pdfFontFile, pdfFontName, "normal");
    document.addFont(pdfFontFile, pdfFontName, "bold");
    return pdfFontName;
  } catch {
    return "helvetica";
  }
};

export const downloadPdf = async ({ filename, title, subtitle, headers, rows, orientation = "portrait" }: PdfExportOptions) => {
  const document = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const fontName = await registerPdfFont(document);
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 36;
  const generatedAt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const drawHeader = () => {
    document.setFillColor(11, 31, 58);
    document.rect(0, 0, pageWidth, 68, "F");
    document.setTextColor(255, 255, 255);
    document.setFont(fontName, "normal");
    document.setFontSize(15);
    document.text(title, margin, 30);
    document.setFont(fontName, "normal");
    document.setFontSize(8);
    document.setTextColor(201, 219, 241);
    document.text(`${BRANDING.organization} · ${subtitle ?? "Export report"}`, margin, 48);
  };
  const drawFooter = () => {
    document.setDrawColor(218, 226, 236);
    document.line(margin, pageHeight - 42, pageWidth - margin, pageHeight - 42);
    document.setFont(fontName, "normal");
    document.setFontSize(7);
    document.setTextColor(112, 128, 148);
    document.text(BRANDING.credits[0], margin, pageHeight - 30);
    document.text(BRANDING.credits[1], margin, pageHeight - 18);
    document.setFontSize(8);
    document.text(`Generated ${generatedAt}`, pageWidth / 2, pageHeight - 18, { align: "center" });
    document.text(`Page ${document.getNumberOfPages()}`, pageWidth - margin, pageHeight - 18, { align: "right" });
  };

  drawHeader();
  autoTable(document, {
    startY: 84,
    margin: { top: 84, right: margin, bottom: 54, left: margin },
    head: [headers],
    body: rows.map((row) => row.map(pdfText)),
    theme: "grid",
    styles: {
       font: fontName,
      fontSize: orientation === "landscape" ? 7 : 8,
      cellPadding: 5,
      overflow: "linebreak",
      textColor: [23, 36, 58],
      lineColor: [218, 226, 236],
      lineWidth: 0.5,
      valign: "middle",
    },
    headStyles: {
      fillColor: [22, 58, 99],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      halign: "left",
    },
    alternateRowStyles: { fillColor: [246, 249, 252] },
    tableLineColor: [218, 226, 236],
    tableLineWidth: 0.5,
    didDrawPage: () => {
      if (document.getNumberOfPages() > 1) drawHeader();
      drawFooter();
    },
  });
  document.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
};

export const downloadAttendancePdf = async (
  entries: AttendanceReportEntry[],
  schoolLevel: string,
  yearLevel: string,
  filename = `jpcs-attendance-${new Date().toISOString().slice(0, 10)}.pdf`,
) => {
  const document = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const fontName = await registerPdfFont(document);
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 36;
  const generatedAt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const groups = groupAttendanceEntries(entries);
  const subtitle = `${schoolLevel} · ${yearLevel} · ${entries.length} matching tickets`;
  const drawHeader = () => {
    document.setFillColor(11, 31, 58);
    document.rect(0, 0, pageWidth, 68, "F");
    document.setTextColor(255, 255, 255);
    document.setFont(fontName, "normal");
    document.setFontSize(15);
    document.text("Attendance Report", margin, 30);
    document.setFont(fontName, "normal");
    document.setFontSize(8);
    document.setTextColor(201, 219, 241);
    document.text(`${BRANDING.organization} · ${subtitle}`, margin, 48);
  };
  const drawFooter = () => {
    document.setDrawColor(218, 226, 236);
    document.line(margin, pageHeight - 42, pageWidth - margin, pageHeight - 42);
    document.setFont(fontName, "normal");
    document.setFontSize(7);
    document.setTextColor(112, 128, 148);
    document.text(BRANDING.credits[0], margin, pageHeight - 30);
    document.text(BRANDING.credits[1], margin, pageHeight - 18);
    document.setFontSize(8);
    document.text(`Generated ${generatedAt}`, pageWidth / 2, pageHeight - 18, { align: "center" });
    document.text(`Page ${document.getNumberOfPages()}`, pageWidth - margin, pageHeight - 18, { align: "right" });
  };

  drawHeader();
  let cursorY = 86;
  groups.forEach((group) => {
    if (cursorY > pageHeight - 130) {
      document.addPage();
      cursorY = 84;
      drawHeader();
    }
    document.setTextColor(22, 58, 99);
    document.setFont(fontName, "normal");
    document.setFontSize(10);
    document.text(`${group.schoolLevel} · ${group.yearLevel} · ${group.strand} · Section ${group.section}`, margin, cursorY);
    const rows = group.entries.map(({ payment, attendee }) => [
      attendee.name,
      payment.email,
      payment.reference,
      attendee.ticketId ?? "-",
      formatCurrency(payment.amount),
      attendee.attendedAt ? "Checked in" : "Not checked in",
      attendee.attendedAt ? formatDateTime(attendee.attendedAt) : "-",
    ]);
    autoTable(document, {
      startY: cursorY + 10,
      margin: { top: 84, right: margin, bottom: 54, left: margin },
      head: [["Attendee", "Email", "Reference", "Ticket ID", "Amount", "Attendance", "Checked in at"]],
      body: rows.map((row) => row.map(pdfText)),
      theme: "grid",
      styles: {
        font: fontName,
        fontSize: 8,
        cellPadding: 5,
        overflow: "linebreak",
        textColor: [23, 36, 58],
        lineColor: [218, 226, 236],
        lineWidth: 0.5,
        valign: "middle",
      },
      headStyles: {
        fillColor: [22, 58, 99],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        halign: "left",
      },
      alternateRowStyles: { fillColor: [246, 249, 252] },
      tableLineColor: [218, 226, 236],
      tableLineWidth: 0.5,
      didDrawPage: () => {
        if (document.getNumberOfPages() > 1) drawHeader();
        drawFooter();
      },
    });
    cursorY = ((document as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? cursorY) + 24;
  });
  document.save(filename.endsWith(".pdf") ? filename : `${filename}.pdf`);
};

export const downloadPaymentPdf = (payments: PaymentRecord[], filename = `jpcs-payment-report-${new Date().toISOString().slice(0, 10)}.pdf`) => {
  const headers = ["Reference", "Site", "Email", "Names", "School level", "Year level", "Section", "Total", "Type", "Method", "Mode", "Status", "Payment state", "Submitted", "Tickets"];
  const rows = payments.map((payment) => [
    payment.reference,
    payment.siteKey === "test-payment" ? "Test" : "Public",
    payment.email,
    getPaymentNameLines(payment),
    payment.schoolLevel,
    payment.yearLevel,
    payment.section ?? "",
    formatCurrency(payment.amount),
    payment.offeringName,
    payment.method,
    payment.paymentMode,
    payment.status,
    payment.paymentState,
    formatDateTime(payment.submittedAt),
     getPaymentAttendees(payment).map((attendee) => `${attendee.ticketId ?? "-"}`).join("\n"),
  ]);
  downloadPdf({
    filename,
    title: "Payment Report",
    subtitle: `${payments.length} payment records`,
    headers,
    rows,
    orientation: "landscape",
  });
};
