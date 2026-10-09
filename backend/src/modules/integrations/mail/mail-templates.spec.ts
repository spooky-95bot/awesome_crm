// src/modules/integrations/mail/mail-templates.spec.ts
import { renderTemplate } from './mail-templates';

describe('renderTemplate', () => {
  it('rend un modèle connu en sujet + corps', () => {
    const r = renderTemplate('deal.won', {
      title: 'ACME',
      value: '1000',
      currency: 'EUR',
    });
    expect(r.subject).toContain('ACME');
    expect(r.text).toContain('1000');
  });

  it('gère un contexte incomplet sans erreur', () => {
    const r = renderTemplate('welcome', {});
    expect(r.subject).toBeTruthy();
    expect(r.text).toContain('utilisateur');
  });

  it('lève une erreur sur un modèle inconnu', () => {
    expect(() => renderTemplate('yok', {})).toThrow();
  });
});

// --- Elysence : modèles transactionnels de réservation ---
describe('modèles de réservation Elysence', () => {
  const ctx = {
    firstName: 'Marie',
    lastName: 'Dupont',
    email: 'marie.dupont@example.fr',
    phone: '0600000000',
    service: 'Massage relaxant',
    date: '15/10/2026',
    timeSlot: '14h00',
    duration: '1 h',
    message: 'Merci',
  };

  it('rend chaque modèle de réservation sans lever d\'erreur', () => {
    for (const key of [
      'reservation.confirmed',
      'reservation.cancelled',
      'reservation.updated',
      'reservation.received',
      'reservation.admin',
    ]) {
      const r = renderTemplate(key, ctx);
      expect(r.subject.length).toBeGreaterThan(0);
      expect(r.text.length).toBeGreaterThan(0);
    }
  });

  it('la confirmation contient la prestation, la date et le créneau', () => {
    const r = renderTemplate('reservation.confirmed', ctx);
    expect(r.subject).toContain('15/10/2026');
    expect(r.text).toContain('Massage relaxant');
    expect(r.text).toContain('14h00');
  });

  it('l\'accusé de réception précise que le créneau n\'est pas réservé', () => {
    const r = renderTemplate('reservation.received', ctx);
    expect(r.text).toContain('pas encore réservé');
  });

  it('gère un contexte vide avec des libellés de repli', () => {
    const r = renderTemplate('reservation.confirmed', {});
    expect(r.text).toContain('chère cliente');
    expect(r.text).toContain('à confirmer');
  });

  it('aucun modèle de réservation ne contient de caractère turc', () => {
    for (const key of [
      'reservation.confirmed',
      'reservation.cancelled',
      'reservation.updated',
      'reservation.received',
      'reservation.admin',
    ]) {
      const r = renderTemplate(key, ctx);
      expect(`${r.subject}${r.text}`).not.toMatch(/[\u011f\u0131\u015f\u0130\u011e\u015e]/);
    }
  });
});
