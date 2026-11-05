export const BRANDING = {
  projectName: "JPCS - LCC Payment and QR Ticketing System",
  organization: "JPCS - LCC",
  fullOrganization: "Junior Philippines Computer Society",
  systemName: "Payment Portal",
  credits: [
    "Web Developer • John Benedict Javier",
    "QA Tester • Aerol Justine • Ms. Joyce",
  ],
  qrPrefix: "JPCS-LCC-TICKET:",
} as const;

export const createTicketQrValue = (ticketId: string) => `${BRANDING.qrPrefix}${ticketId}`;
