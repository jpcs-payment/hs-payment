import type { PaymentRecord } from "../types";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BRANDING } from "./branding";
import { formatCurrency, formatDateTime } from "./utils";

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
  "Payer",
  "Email",
  "School level",
  "Year level",
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
  "Attended at",
];

export const paymentToExportRow = (payment: PaymentRecord): CsvValue[] => [
  payment.reference,
  payment.studentName,
  payment.email,
  payment.schoolLevel,
  payment.yearLevel,
  payment.strand,
  payment.course,
  payment.offeringName,
  payment.amount,
  payment.allocations.map((allocation) => `${allocation.recipient}: ${allocation.amount}`).join(" | "),
  payment.method,
  payment.paymentMode,
  payment.status,
  payment.paymentState,
  payment.paymentDeadlineAt,
  payment.submittedAt,
  payment.paidAt,
  payment.receiptNumber,
  payment.ticketId,
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

export const downloadPdf = ({ filename, title, subtitle, headers, rows, orientation = "portrait" }: PdfExportOptions) => {
  const document = new jsPDF({ orientation, unit: "pt", format: "a4" });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 36;
  const generatedAt = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short" }).format(new Date());
  const drawHeader = () => {
    document.setFillColor(11, 31, 58);
    document.rect(0, 0, pageWidth, 68, "F");
    document.setTextColor(255, 255, 255);
    document.setFont("helvetica", "bold");
    document.setFontSize(15);
    document.text(title, margin, 30);
    document.setFont("helvetica", "normal");
    document.setFontSize(8);
    document.setTextColor(201, 219, 241);
    document.text(`${BRANDING.organization} · ${subtitle ?? "Export report"}`, margin, 48);
  };
  const drawFooter = () => {
    document.setDrawColor(218, 226, 236);
    document.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30);
    document.setFont("helvetica", "normal");
    document.setFontSize(8);
    document.setTextColor(112, 128, 148);
    document.text(BRANDING.projectLead, margin, pageHeight - 18);
    document.text(`Generated ${generatedAt}`, pageWidth / 2, pageHeight - 18, { align: "center" });
    document.text(`Page ${document.getNumberOfPages()}`, pageWidth - margin, pageHeight - 18, { align: "right" });
  };

  drawHeader();
  autoTable(document, {
    startY: 84,
    margin: { top: 84, right: margin, bottom: 42, left: margin },
    head: [headers],
    body: rows.map((row) => row.map(pdfText)),
    theme: "grid",
    styles: {
      font: "helvetica",
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

export const downloadPaymentPdf = (payments: PaymentRecord[], filename = `jpcs-payment-report-${new Date().toISOString().slice(0, 10)}.pdf`) => {
  const headers = ["Reference", "Payer", "Email", "Type", "Amount", "Method", "Mode", "Status", "Payment state", "Submitted", "Ticket"];
  const rows = payments.map((payment) => [
    payment.reference,
    payment.studentName,
    payment.email,
    payment.offeringName,
    formatCurrency(payment.amount),
    payment.method,
    payment.paymentMode,
    payment.status,
    payment.paymentState,
    formatDateTime(payment.submittedAt),
    payment.ticketId ?? "-",
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
