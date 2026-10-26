export type Role = "student" | "admin";

export type SchoolLevel = "Junior High School" | "Senior High School" | "College";

export type PaymentMethod = "Cash" | "GCash" | "MariBank";

export type PaymentStatus = "Pending" | "Approved" | "Rejected";

export type PaymentMode = "PayNow" | "PayLater";

export type PaymentState = "Unpaid" | "AwaitingReview" | "Paid" | "Rejected" | "Cancelled";

export type EmailDeliveryStatus = "Sending" | "Sent" | "Failed";

export interface PaymentAllocation {
  recipient: string;
  amount: number;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  schoolLevel: SchoolLevel;
  yearLevel: string;
  strand?: string;
  course?: string;
  avatar: string;
}

export interface PaymentMethodConfig {
  id: PaymentMethod;
  enabled: boolean;
  accountName: string;
  accountNumber: string;
  instructions: string;
  qrImage?: string;
}

export interface PaymentOffering {
  id: string;
  slug: string;
  name: string;
  description: string;
  amount: number;
  active: boolean;
  availableMethods: PaymentMethod[];
  applicableSchoolLevels: SchoolLevel[];
  allocations: PaymentAllocation[];
  payLaterMethods: PaymentMethod[];
  payLaterDeadlineAt?: string;
}

export interface PaymentRecord {
  id: string;
  reference: string;
  studentId: string;
  studentName: string;
  email: string;
  schoolLevel: SchoolLevel;
  yearLevel: string;
  strand?: string;
  course?: string;
  offeringId: string;
  offeringName: string;
  amount: number;
  allocations: PaymentAllocation[];
  method: PaymentMethod;
  paymentMode: PaymentMode;
  paymentState: PaymentState;
  paymentDeadlineAt?: string;
  senderAccountName?: string;
  senderReference?: string;
  proofImage?: string;
  submittedAt: string;
  status: PaymentStatus;
  rejectionReason?: string;
  approvedAt?: string;
  approvedByName?: string;
  approvedByEmail?: string;
  paidAt?: string;
  paidByName?: string;
  paidByEmail?: string;
  receiptNumber?: string;
  ticketId?: string;
  ticketQrValue?: string;
  emailDeliveryStatus?: EmailDeliveryStatus;
  emailSentAt?: string;
  emailId?: string;
  emailDeliveryError?: string;
  attendedAt?: string;
}

export interface Developer {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: string;
  bio: string;
}

export interface AppData {
  students: Student[];
  offerings: PaymentOffering[];
  paymentMethods: PaymentMethodConfig[];
  payments: PaymentRecord[];
  developers: Developer[];
}

export interface Session {
  role: Role;
  studentId?: string;
  adminName?: string;
  adminEmail?: string;
}

export interface NewPaymentInput {
  studentId?: string;
  studentName: string;
  email: string;
  schoolLevel: SchoolLevel;
  yearLevel: string;
  strand?: string;
  course?: string;
  offeringId: string;
  offeringName: string;
  amount: number;
  allocations: PaymentAllocation[];
  method: PaymentMethod;
  paymentMode: PaymentMode;
  paymentDeadlineAt?: string;
  senderAccountName?: string;
  senderReference?: string;
  proofImage?: string;
}

export interface NewPaymentOfferingInput {
  slug: string;
  name: string;
  description: string;
  amount: number;
  active: boolean;
  availableMethods: PaymentMethod[];
  applicableSchoolLevels: SchoolLevel[];
  allocations: PaymentAllocation[];
  payLaterMethods: PaymentMethod[];
  payLaterDeadlineAt?: string;
}

export type TicketCheckInResult =
  | { ok: true; kind: "checked-in"; payment: PaymentRecord; paymentPending?: boolean }
  | { ok: false; kind: "already-checked-in"; payment: PaymentRecord; paymentPending?: boolean }
  | { ok: false; kind: "unpaid"; payment: PaymentRecord }
  | { ok: false; kind: "invalid"; message: string };
