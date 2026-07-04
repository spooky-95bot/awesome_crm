// src/modules/connections/provider-catalog.ts
// Entegrasyon provider kataloğu + bağlantı testi. secret=true alanlar şifreli saklanır,
// diğerleri (config) düz. available=false → panelde "yakında" (henüz bağlanamaz).

export interface ProviderField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder?: string;
}

export interface ProviderDef {
  key: string;
  name: string;
  category: string; // messaging | payments | accounting | ...
  authType: 'api_key' | 'oauth2';
  available: boolean;
  testable: boolean;
  fields: ProviderField[];
}

export const PROVIDERS: ProviderDef[] = [
  {
    key: 'whatsapp',
    name: 'WhatsApp Business',
    category: 'messaging',
    authType: 'api_key',
    available: true,
    testable: true,
    fields: [
      {
        key: 'accessToken',
        label: 'Access Token',
        secret: true,
        required: true,
      },
      {
        key: 'phoneNumberId',
        label: 'Phone Number ID',
        secret: false,
        required: true,
      },
      // Gelen webhook için (opsiyonel): imza doğrulama + Meta verify challenge.
      {
        key: 'appSecret',
        label: 'App Secret (inbound)',
        secret: true,
        required: false,
      },
      {
        key: 'verifyToken',
        label: 'Verify Token (inbound)',
        secret: true,
        required: false,
      },
    ],
  },
  {
    key: 'stripe',
    name: 'Stripe',
    category: 'payments',
    authType: 'api_key',
    available: true,
    testable: true,
    fields: [
      {
        key: 'secretKey',
        label: 'Secret Key (sk_...)',
        secret: true,
        required: true,
      },
    ],
  },
  // OAuth2 tabanlılar (v3.2): clientId/clientSecret girilir → panelden "Yetkilendir" ile
  // sağlayıcıya yönlenilir; token'lar şifreli saklanır ve otomatik yenilenir.
  {
    key: 'quickbooks',
    name: 'QuickBooks Online',
    category: 'accounting',
    authType: 'oauth2',
    available: true,
    testable: false,
    fields: [
      { key: 'clientId', label: 'Client ID', secret: false, required: true },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        secret: true,
        required: true,
      },
    ],
  },
  {
    key: 'xero',
    name: 'Xero',
    category: 'accounting',
    authType: 'oauth2',
    available: true,
    testable: false,
    fields: [
      { key: 'clientId', label: 'Client ID', secret: false, required: true },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        secret: true,
        required: true,
      },
    ],
  },
  {
    key: 'iyzico',
    name: 'iyzico',
    category: 'payments',
    authType: 'api_key',
    available: false,
    testable: false,
    fields: [],
  },
  // v4.2 — Meta Ad Library (nişe göre reklam keşfi). Resmi Graph API access token'ı.
  {
    key: 'meta_ads',
    name: 'Meta Ad Library',
    category: 'research',
    authType: 'api_key',
    available: true,
    testable: true,
    fields: [
      {
        key: 'accessToken',
        label: 'Access Token (Graph API)',
        secret: true,
        required: true,
      },
    ],
  },
];

export function findProvider(key: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.key === key);
}

// Bağlantı testi — sağlayıcının kimlik bilgileriyle hafif bir "ping".
export async function testConnection(
  provider: string,
  secrets: Record<string, string>,
  config: Record<string, unknown>,
): Promise<{ ok: boolean; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    if (provider === 'whatsapp') {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${String(config.phoneNumberId)}`,
        {
          headers: { Authorization: `Bearer ${secrets.accessToken}` },
          signal: controller.signal,
        },
      );
      return res.ok
        ? { ok: true, message: 'WhatsApp bağlantısı doğrulandı.' }
        : { ok: false, message: `WhatsApp hata: HTTP ${res.status}` };
    }
    if (provider === 'stripe') {
      const res = await fetch('https://api.stripe.com/v1/account', {
        headers: { Authorization: `Bearer ${secrets.secretKey}` },
        signal: controller.signal,
      });
      return res.ok
        ? { ok: true, message: 'Stripe bağlantısı doğrulandı.' }
        : { ok: false, message: `Stripe hata: HTTP ${res.status}` };
    }
    if (provider === 'meta_ads') {
      const url =
        'https://graph.facebook.com/v20.0/ads_archive?' +
        new URLSearchParams({
          ad_reached_countries: '["US"]',
          search_terms: 'test',
          ad_type: 'ALL',
          limit: '1',
          access_token: secrets.accessToken,
        }).toString();
      const res = await fetch(url, { signal: controller.signal });
      return res.ok
        ? { ok: true, message: 'Meta Ad Library bağlantısı doğrulandı.' }
        : {
            ok: false,
            message: `Meta hata: HTTP ${res.status} (token/erişim kapsamı?)`,
          };
    }
    return { ok: false, message: 'Bu sağlayıcı için test yok.' };
  } catch (e) {
    return {
      ok: false,
      message: `Test başarısız: ${(e as Error).message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}
