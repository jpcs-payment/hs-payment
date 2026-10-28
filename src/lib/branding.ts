export const BRANDING = {
  projectName: "JPCS - LCC Payment and QR Ticketing System",
  organization: "JPCS - LCC",
  fullOrganization: "Junior Philippines Computer Studies",
  systemName: "JPCS - LCC Payment Portal",
  credits: [
    "Web Developer • John Benedict Javier",
    "Web QA Engineer • Aerol Justine • Ms. Joyce",
  ],
  qrPrefix: "JPCS-LCC-TICKET:",
} as const;

export const createTicketQrValue = (ticketId: string) => `${BRANDING.qrPrefix}${ticketId}`;
