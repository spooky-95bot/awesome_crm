// src/modules/integrations/util/ssrf.util.spec.ts
import { isSafeWebhookUrl } from './ssrf.util';

describe('isSafeWebhookUrl (U-5.5 / S-5.1)', () => {
  it('public HTTPS URL güvenli', () => {
    expect(isSafeWebhookUrl('https://hooks.example.com/x')).toBe(true);
  });

  it('http (non HTTPS) est rejeté', () => {
    expect(isSafeWebhookUrl('http://example.com')).toBe(false);
  });

  it('cloud metadata IP reddedilir (169.254.169.254)', () => {
    expect(isSafeWebhookUrl('https://169.254.169.254/latest/meta-data')).toBe(
      false,
    );
  });

  it('loopback et réseaux privés rejetés', () => {
    expect(isSafeWebhookUrl('https://127.0.0.1/x')).toBe(false);
    expect(isSafeWebhookUrl('https://10.0.0.5/x')).toBe(false);
    expect(isSafeWebhookUrl('https://192.168.1.10/x')).toBe(false);
    expect(isSafeWebhookUrl('https://172.16.0.1/x')).toBe(false);
    expect(isSafeWebhookUrl('https://localhost/x')).toBe(false);
  });

  it('geçersiz URL reddedilir', () => {
    expect(isSafeWebhookUrl('not-a-url')).toBe(false);
  });

  it('allowPrivate autorise http+réseau privé (test/auto-hébergement)', () => {
    expect(
      isSafeWebhookUrl('http://127.0.0.1:9999/x', { allowPrivate: true }),
    ).toBe(true);
  });
});
