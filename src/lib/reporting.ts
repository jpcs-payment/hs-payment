import type { PaymentAttendee, PaymentRecord } from "../types";

export interface AllocationSummary {
  recipient: string;
  allocated: number;
  collected: number;
  outstanding: number;
  pending: number;
  recordCount: number;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export const summarizeAllocations = (payments: PaymentRecord[]): AllocationSummary[] => {
  const summaries = new Map<string, AllocationSummary>();

  payments
    .filter((payment) => payment.status !== "Rejected")
    .forEach((payment) => {
      payment.allocations.forEach((allocation) => {
        const recipient = allocation.recipient.trim();
        if (!recipient) return;
        const key = recipient.toLowerCase();
        const current = summaries.get(key) ?? { recipient, allocated: 0, collected: 0, outstanding: 0, pending: 0, recordCount: 0 };
        const amount = Number(allocation.amount) || 0;
        current.allocated += amount;
        current.recordCount += 1;
        if (payment.paymentState === "Paid") current.collected += amount;
        else if (payment.paymentState === "Unpaid") current.outstanding += amount;
        else if (payment.paymentState === "AwaitingReview") current.pending += amount;
        summaries.set(key, current);
      });
    });

  return Array.from(summaries.values())
    .map((summary) => ({
      ...summary,
      allocated: roundMoney(summary.allocated),
      collected: roundMoney(summary.collected),
      outstanding: roundMoney(summary.outstanding),
      pending: roundMoney(summary.pending),
    }))
    .sort((a, b) => b.allocated - a.allocated || a.recipient.localeCompare(b.recipient));
};

export interface AttendanceReportEntry {
  payment: PaymentRecord;
  attendee: PaymentAttendee;
}

export interface AttendanceSectionGroup {
  schoolLevel: string;
  yearLevel: string;
  strand: string;
  section: string;
  entries: AttendanceReportEntry[];
}

const reportLabel = (value: string | undefined, fallback: string) => value?.trim() || fallback;
const reportKey = (value: string) => value.trim().toLocaleLowerCase();
const naturalCompare = (left: string, right: string) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });

export const groupAttendanceEntries = (entries: AttendanceReportEntry[]): AttendanceSectionGroup[] => {
  const groups = new Map<string, AttendanceSectionGroup>();
  entries.forEach((entry) => {
    const group = {
      schoolLevel: reportLabel(entry.payment.schoolLevel, "Unassigned school level"),
      yearLevel: reportLabel(entry.payment.yearLevel, "Unassigned year level"),
      strand: reportLabel(entry.payment.strand, "No strand"),
      section: reportLabel(entry.payment.section, "Unassigned section"),
    };
    const key = [group.schoolLevel, group.yearLevel, group.strand, group.section].map(reportKey).join("|");
    const current = groups.get(key) ?? { ...group, entries: [] };
    current.entries.push(entry);
    groups.set(key, current);
  });

  return Array.from(groups.values()).sort((left, right) =>
    naturalCompare(left.schoolLevel, right.schoolLevel)
    || naturalCompare(left.yearLevel, right.yearLevel)
    || naturalCompare(left.strand, right.strand)
    || naturalCompare(left.section, right.section),
  ).map((group) => ({
    ...group,
    entries: [...group.entries].sort((left, right) => naturalCompare(left.attendee.name, right.attendee.name)),
  }));
};
