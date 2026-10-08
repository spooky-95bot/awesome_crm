// src/modules/integrations/mail/mail-templates.spec.ts
import { renderTemplate } from './mail-templates';

describe('renderTemplate', () => {
  it('bilinen şablonu konu+gövde olarak render eder', () => {
    const r = renderTemplate('deal.won', {
      title: 'ACME',
      value: '1000',
      currency: 'EUR',
    });
    expect(r.subject).toContain('ACME');
    expect(r.text).toContain('1000');
  });

  it('eksik context alanlarını güvenli işler', () => {
    const r = renderTemplate('welcome', {});
    expect(r.subject).toBeTruthy();
    expect(r.text).toContain('kullanıcı');
  });

  it('bilinmeyen şablonda hata fırlatır', () => {
    expect(() => renderTemplate('yok', {})).toThrow();
  });
});
