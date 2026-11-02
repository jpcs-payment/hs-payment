import type { PaymentAttendee, PaymentRecord } from "../types";

export const getPaymentAttendees = (payment: PaymentRecord): PaymentAttendee[] => {
  if (payment.attendees.length) return payment.attendees;
  return [{
    id: `legacy-${payment.id}`,
    name: payment.studentName,
    position: 1,
    ticketId: payment.ticketId,
    ticketQrValue: payment.ticketQrValue,
    attendedAt: payment.attendedAt,
  }];
};

export const getPaymentNames = (payment: PaymentRecord) =>
  getPaymentAttendees(payment).map((attendee) => attendee.name);

export const getPaymentAttendeeSummary = (payment: PaymentRecord) => {
  const names = getPaymentNames(payment);
  if (names.length <= 1) return names[0] ?? "Unnamed attendee";
  return `${names[0]}, and ${names.length - 1} others`;
};

export const getPaymentPayerIds = (payment: PaymentRecord) =>
  Array.from(new Set([
    payment.studentId,
    ...getPaymentAttendees(payment).map((attendee) => attendee.payerId).filter((payerId): payerId is string => Boolean(payerId)),
  ]));

export const getFirstPaymentAttendee = (payment: PaymentRecord) =>
  getPaymentAttendees(payment)[0];
