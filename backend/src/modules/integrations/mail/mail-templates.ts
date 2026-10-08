// src/modules/integrations/mail/mail-templates.ts
// Registre simple de modèles : clé -> générateur d'objet + corps. DRY et testable.
type Ctx = Record<string, unknown>;

interface Template {
  subject: (c: Ctx) => string;
  text: (c: Ctx) => string;
}

const s = (c: Ctx, k: string, d = ''): string =>
  c[k] === undefined || c[k] === null ? d : String(c[k]);

export const MAIL_TEMPLATES: Record<string, Template> = {
  welcome: {
    subject: () => 'Elysence Partner — Bienvenue',
    text: (c) =>
      `Bonjour ${s(c, 'firstName', 'utilisateur')},\n\nVotre compte a été créé. Bon travail !`,
  },
  'deal.won': {
    subject: (c) => `Vente conclue : ${s(c, 'title')}`,
    text: (c) =>
      `Félicitations ! La vente « ${s(c, 'title')} » a été conclue (${s(c, 'value', '-')} ${s(c, 'currency', 'EUR')}).`,
  },
  'lead.assigned': {
    subject: () => 'Nouvelle demande assignée',
    text: (c) =>
      `Une nouvelle demande vous a été assignée : ${s(c, 'firstName')} ${s(c, 'lastName')} (${s(c, 'companyName', '-')}).`,
  },
  'invoice.issued': {
    subject: (c) => `Votre facture est prête : ${s(c, 'number')}`,
    text: (c) =>
      `La facture ${s(c, 'number')} a été émise pour ${s(c, 'customerName')}. Montant : ${s(c, 'total', '-')} ${s(c, 'currency', 'EUR')}.`,
  },
};

export function renderTemplate(
  templateKey: string,
  context: Ctx,
): { subject: string; text: string } {
  const tpl = MAIL_TEMPLATES[templateKey];
  if (!tpl) {
    throw new Error(`Modèle d'e-mail inconnu : ${templateKey}`);
  }
  return { subject: tpl.subject(context), text: tpl.text(context) };
}
