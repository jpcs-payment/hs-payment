import type { PaymentRecord } from "../types";

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
