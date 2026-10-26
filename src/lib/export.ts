import type { PaymentRecord } from "../types";

type CsvValue = string | number | boolean | null | undefined;

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
