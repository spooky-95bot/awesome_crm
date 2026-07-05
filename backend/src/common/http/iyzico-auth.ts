// src/common/http/iyzico-auth.ts
// iyzico IYZWSv2 kimlik doğrulama başlığı (HMAC-SHA256). Saf fonksiyon — hem payments
// servisinde hem de bağlantı testinde (provider-catalog) kullanılır, Nest bağımlılığı yok.
//
// İmza = HMAC-SHA256( randomKey + uriPath + requestBody, secretKey ) → hex.
// İMZA, gövdenin GÖNDERİLEN string'i üzerinden hesaplanmalı; bu yüzden çağıran taraf
// aynı JSON string'i hem imzaya hem de HTTP gövdesine verir (byte-eş).
import { createHmac, randomBytes } from 'crypto';

export function iyziRandomKey(): string {
  return Date.now().toString() + randomBytes(8).toString('hex');
}

export function iyziAuthHeaders(
  apiKey: string,
  secretKey: string,
  uriPath: string,
  body: string,
  randomKey: string = iyziRandomKey(),
): Record<string, string> {
  const signature = createHmac('sha256', secretKey)
    .update(randomKey + uriPath + body)
    .digest('hex');
  const authorization =
    'IYZWSv2 ' +
    Buffer.from(
      [
        `apiKey:${apiKey}`,
        `randomKey:${randomKey}`,
        `signature:${signature}`,
      ].join('&'),
    ).toString('base64');
  return {
    Authorization: authorization,
    'x-iyzi-rnd': randomKey,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// Sandbox varsayılan (canlı ödeme için bilinçli güvenli varsayılan). Sondaki '/' temizlenir.
export function iyziBaseUrl(config: Record<string, unknown>): string {
  const b = (config?.baseUrl as string) || 'https://sandbox-api.iyzipay.com';
  return b.replace(/\/+$/, '');
}
