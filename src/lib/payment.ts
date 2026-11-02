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

export const getFirstPaymentAttendee = (payment: PaymentRecord) =>
  getPaymentAttendees(payment)[0];
