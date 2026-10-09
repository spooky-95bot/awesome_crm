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

  // --- Elysence : cycle de vie d'une réservation ---
  'reservation.confirmed': {
    subject: (c) =>
      `Votre rendez-vous chez Maison ELYSENCE${s(c, 'date') ? ` — ${s(c, 'date')}` : ''}`,
    text: (c) =>
      `Bonjour ${s(c, 'firstName', 'chère cliente')},\n\n` +
      `Nous avons le plaisir de confirmer votre rendez-vous chez Maison ELYSENCE.\n\n` +
      `Prestation : ${s(c, 'service', 'à préciser')}\n` +
      `Date : ${s(c, 'date', 'à confirmer')}\n` +
      `Créneau : ${s(c, 'timeSlot', 'à confirmer')}\n` +
      `Durée : ${s(c, 'duration', '-')}\n\n` +
      `Merci de nous prévenir au moins 24 h à l'avance en cas d'empêchement.\n` +
      `Pour toute question : maisonelysence@hotmail.com\n\n` +
      `À très bientôt,\nMaison ELYSENCE`,
  },
  'reservation.cancelled': {
    subject: () => `Annulation de votre rendez-vous — Maison ELYSENCE`,
    text: (c) =>
      `Bonjour ${s(c, 'firstName', 'chère cliente')},\n\n` +
      `Votre rendez-vous${s(c, 'date') ? ` du ${s(c, 'date')}` : ''}` +
      `${s(c, 'timeSlot') ? ` (${s(c, 'timeSlot')})` : ''} est annulé.\n\n` +
      `Vous pouvez demander un nouveau créneau à tout moment via notre site ou par email.\n` +
      `Pour toute question : maisonelysence@hotmail.com\n\n` +
      `À très bientôt,\nMaison ELYSENCE`,
  },
  'reservation.updated': {
    subject: () => `Modification de votre rendez-vous — Maison ELYSENCE`,
    text: (c) =>
      `Bonjour ${s(c, 'firstName', 'chère cliente')},\n\n` +
      `Votre rendez-vous a été modifié.\n\n` +
      `Nouvelle date : ${s(c, 'date', 'à confirmer')}\n` +
      `Nouveau créneau : ${s(c, 'timeSlot', 'à confirmer')}\n` +
      `Prestation : ${s(c, 'service', 'à préciser')}\n\n` +
      `Si ce créneau ne vous convient pas, répondez simplement à cet email.\n\n` +
      `À très bientôt,\nMaison ELYSENCE`,
  },
  'reservation.received': {
    subject: () => `Nous avons bien reçu votre demande — Maison ELYSENCE`,
    text: (c) =>
      `Bonjour ${s(c, 'firstName', 'chère cliente')},\n\n` +
      `Nous avons bien reçu votre demande de rendez-vous` +
      `${s(c, 'service') ? ` pour « ${s(c, 'service')} »` : ''}.\n\n` +
      `Il s'agit d'un accusé de réception : votre créneau n'est pas encore réservé. ` +
      `Nous vous confirmons votre rendez-vous par email dans les plus brefs délais.\n\n` +
      `Pour toute question : maisonelysence@hotmail.com\n\n` +
      `À très bientôt,\nMaison ELYSENCE`,
  },
  'reservation.admin': {
    subject: (c) => `Nouvelle réservation — ${s(c, 'firstName')} ${s(c, 'lastName')}`,
    text: (c) =>
      `Nouvelle demande de réservation.\n\n` +
      `Cliente : ${s(c, 'firstName')} ${s(c, 'lastName')}\n` +
      `Email : ${s(c, 'email')}\n` +
      `Téléphone : ${s(c, 'phone')}\n` +
      `Prestation : ${s(c, 'service')}\n` +
      `Date souhaitée : ${s(c, 'date', 'non précisée')}\n` +
      `Créneau souhaité : ${s(c, 'timeSlot', 'non précisé')}\n` +
      `Message : ${s(c, 'message', '-')}\n`,
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
