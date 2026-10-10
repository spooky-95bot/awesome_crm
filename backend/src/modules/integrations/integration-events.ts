// src/modules/integrations/integration-events.ts
// Événements de domaine pris en charge (abonnement + publication limités à ceux-ci).
export const SUPPORTED_EVENTS = [
  'deal.created',
  'deal.moved',
  'invoice.issued',
  'invoice.paid',
] as const;

export type SupportedEvent = (typeof SUPPORTED_EVENTS)[number];
