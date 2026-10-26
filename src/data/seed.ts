import type { AppData, PaymentRecord } from "../types";

export const initialData: AppData = {
  students: [],
  offerings: [],
  paymentMethods: [
    {
      id: "Cash",
      enabled: true,
      accountName: "JPCS - LCC Cashier",
      accountNumber: "Configure cashier reference",
      instructions: "Pay the exact amount at the cashier and enter the cashier reference.",
    },
    {
      id: "GCash",
      enabled: true,
      accountName: "JPCS - LCC Student Activities",
      accountNumber: "Configure GCash number",
      instructions: "Send the exact amount, then upload your payment screenshot and enter the sender reference.",
    },
    {
      id: "MariBank",
      enabled: true,
      accountName: "JPCS - LCC Student Activities",
      accountNumber: "Configure MariBank number",
      instructions: "Send the exact amount, then upload your payment screenshot and enter the sender reference.",
    },
  ],
  payments: [],
  developers: [],
};

export const cloneInitialData = (): AppData =>
  JSON.parse(JSON.stringify(initialData)) as AppData;

export const getLatestPayment = (payments: PaymentRecord[], studentId: string) =>
  payments
    .filter((payment) => payment.studentId === studentId)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))[0];
