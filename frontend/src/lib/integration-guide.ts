// src/lib/integration-guide.ts
// Entegrasyon rehberi içeriği — YALNIZCA İngilizce (en) + Türkçe (tr). Bu dokümantasyon
// uygulama dilinden BAĞIMSIZDIR ve her zaman İngilizce açılır (guide sayfası kendi seçicisiyle).
// `{DOMAIN}` yer tutucusu render anında window.location.origin ile değiştirilir.

export interface GuideLang {
  summary: string;
  prerequisites: string[];
  steps: string[];
  fields: { label: string; hint: string }[];
  notes: string[];
  docUrl: string;
}

export interface GuideEntry {
  key: string;
  name: string; // marka adı (sabit)
  icon: string; // emoji
  category: string; // messaging | payments | accounting | research
  en: GuideLang;
  tr: GuideLang;
}

export const INTEGRATION_GUIDE: GuideEntry[] = [
  {
    key: 'whatsapp',
    name: 'WhatsApp Business',
    icon: '💬',
    category: 'messaging',
    en: {
      summary:
        'Send WhatsApp messages from the CRM (leads, quotes, invoices) and receive inbound replies linked to the matching lead/contact — via the official WhatsApp Cloud API.',
      prerequisites: [
        'A Meta (Facebook) account and a Meta Business account.',
        'A phone number for WhatsApp that is NOT tied to a personal WhatsApp app.',
      ],
      steps: [
        'Go to Meta for Developers (developers.facebook.com) and log in.',
        'My Apps → Create App → choose the "Business" app type.',
        'In the app dashboard, add the "WhatsApp" product.',
        'Open WhatsApp → API Setup: note the Phone number ID and generate an access token. For production, create a System User permanent token (Business Settings → System Users) with the whatsapp_business_messaging and whatsapp_business_management permissions.',
        'Copy the Access token and the Phone number ID.',
        'In the CRM Connections page, click Connect on WhatsApp Business and paste the Access Token and Phone Number ID.',
        'Optional (inbound replies): open WhatsApp → Configuration, set the Callback URL to {DOMAIN}/api/v1/webhooks/whatsapp and a Verify Token of your choice, then subscribe to the "messages" field. Copy the App Secret from App Settings → Basic, and enter the same Verify Token and App Secret in the CRM connect form.',
        'Save, then click Test to verify the connection.',
      ],
      fields: [
        { label: 'Access Token', hint: 'Cloud API token (System User token for production).' },
        { label: 'Phone Number ID', hint: 'From WhatsApp → API Setup.' },
        { label: 'App Secret (inbound)', hint: 'Only for receiving replies — verifies webhook signatures.' },
        { label: 'Verify Token (inbound)', hint: 'A value you choose; must match the one set on Meta.' },
      ],
      notes: [
        'Inbound messages require both the webhook and the App Secret so signatures can be verified; without them inbound is rejected (secure by default).',
        'Secrets are stored encrypted and are never shown again.',
      ],
      docUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    },
    tr: {
      summary:
        'CRM’den WhatsApp mesajı gönderin (lead, teklif, fatura) ve gelen yanıtları ilgili lead/kişiye bağlı alın — resmi WhatsApp Cloud API üzerinden.',
      prerequisites: [
        'Bir Meta (Facebook) hesabı ve bir Meta Business hesabı.',
        'Kişisel WhatsApp uygulamasına bağlı OLMAYAN bir telefon numarası.',
      ],
      steps: [
        'Meta for Developers’a (developers.facebook.com) girin.',
        'My Apps → Create App → uygulama tipi olarak "Business" seçin.',
        'Uygulama panosunda "WhatsApp" ürününü ekleyin.',
        'WhatsApp → API Setup: Phone number ID’yi not edin ve bir access token üretin. Canlı için Business Settings → System Users’tan whatsapp_business_messaging ve whatsapp_business_management izinleriyle kalıcı bir System User token oluşturun.',
        'Access token’ı ve Phone number ID’yi kopyalayın.',
        'CRM Bağlantılar sayfasında WhatsApp Business için Bağla’ya tıklayın; Access Token ve Phone Number ID’yi yapıştırın.',
        'İsteğe bağlı (gelen yanıtlar): WhatsApp → Configuration’da Callback URL’i {DOMAIN}/api/v1/webhooks/whatsapp yapın, kendi belirlediğiniz bir Verify Token girin ve "messages" alanına abone olun. App Settings → Basic’ten App Secret’ı kopyalayın; aynı Verify Token ve App Secret’ı CRM bağlama formuna girin.',
        'Kaydedin, ardından Test ile bağlantıyı doğrulayın.',
      ],
      fields: [
        { label: 'Access Token', hint: 'Cloud API token (canlıda System User token).' },
        { label: 'Phone Number ID', hint: 'WhatsApp → API Setup’tan.' },
        { label: 'App Secret (gelen)', hint: 'Yalnız gelen yanıt için — webhook imzasını doğrular.' },
        { label: 'Verify Token (gelen)', hint: 'Sizin belirlediğiniz değer; Meta’dakiyle aynı olmalı.' },
      ],
      notes: [
        'Gelen mesaj için hem webhook hem App Secret gerekir (imza doğrulaması); yoksa gelen mesaj reddedilir (varsayılan güvenli).',
        'Sırlar şifreli saklanır ve bir daha gösterilmez.',
      ],
      docUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    },
  },
  {
    key: 'stripe',
    name: 'Stripe',
    icon: '💳',
    category: 'payments',
    en: {
      summary:
        'Validate a Stripe account connection with your secret key.',
      prerequisites: ['A Stripe account.'],
      steps: [
        'Log in to the Stripe Dashboard (dashboard.stripe.com).',
        'Go to Developers → API keys.',
        'Reveal and copy the Secret key (sk_live_… for production, sk_test_… for testing).',
        'In CRM Connections, click Connect on Stripe and paste the Secret Key.',
        'Save, then click Test.',
      ],
      fields: [
        { label: 'Secret Key', hint: 'sk_live_… or sk_test_… — stored encrypted.' },
      ],
      notes: [
        'Honest note: the Stripe checkout / payment-link flow is not implemented yet. For collecting invoice payments, use iyzico. This connection only validates the key.',
      ],
      docUrl: 'https://dashboard.stripe.com/apikeys',
    },
    tr: {
      summary:
        'Stripe hesabı bağlantısını gizli anahtarınızla doğrulayın.',
      prerequisites: ['Bir Stripe hesabı.'],
      steps: [
        'Stripe Dashboard’a (dashboard.stripe.com) girin.',
        'Developers → API keys’e gidin.',
        'Secret key’i görünür yapıp kopyalayın (canlı için sk_live_…, test için sk_test_…).',
        'CRM Bağlantılar’da Stripe için Bağla’ya tıklayın ve Secret Key’i yapıştırın.',
        'Kaydedin, ardından Test edin.',
      ],
      fields: [
        { label: 'Secret Key', hint: 'sk_live_… veya sk_test_… — şifreli saklanır.' },
      ],
      notes: [
        'Dürüst not: Stripe checkout / ödeme-linki akışı henüz yapılmadı. Fatura tahsilatı için iyzico kullanın. Bu bağlantı yalnızca anahtarı doğrular.',
      ],
      docUrl: 'https://dashboard.stripe.com/apikeys',
    },
  },
  {
    key: 'quickbooks',
    name: 'QuickBooks Online',
    icon: '📗',
    category: 'accounting',
    en: {
      summary: 'Connect QuickBooks Online (OAuth2) to sync invoices to your accounting.',
      prerequisites: [
        'An Intuit Developer account and a QuickBooks Online company.',
      ],
      steps: [
        'Go to the Intuit Developer portal (developer.intuit.com) and sign in.',
        'Create an app under "QuickBooks Online and Payments".',
        'In the app’s Keys & OAuth settings, add this exact Redirect URI: {DOMAIN}/api/v1/connections/oauth/callback',
        'Copy the Client ID and Client Secret (Production keys for live, Development keys for the sandbox).',
        'In CRM Connections, click Connect on QuickBooks Online, paste Client ID + Client Secret, and Save.',
        'The card now shows "pending auth" — click Authorize, grant access on Intuit, and you’ll be redirected back connected.',
      ],
      fields: [
        { label: 'Client ID', hint: 'From the Intuit app Keys & OAuth.' },
        { label: 'Client Secret', hint: 'Stored encrypted.' },
      ],
      notes: [
        'The Redirect URI must match exactly (including https).',
        'Access/refresh tokens are stored encrypted and refreshed automatically.',
      ],
      docUrl: 'https://developer.intuit.com',
    },
    tr: {
      summary: 'Faturaları muhasebeye aktarmak için QuickBooks Online’ı (OAuth2) bağlayın.',
      prerequisites: [
        'Bir Intuit Developer hesabı ve bir QuickBooks Online şirketi.',
      ],
      steps: [
        'Intuit Developer portalına (developer.intuit.com) girin.',
        '"QuickBooks Online and Payments" altında bir uygulama oluşturun.',
        'Uygulamanın Keys & OAuth ayarında şu Redirect URI’yi birebir ekleyin: {DOMAIN}/api/v1/connections/oauth/callback',
        'Client ID ve Client Secret’ı kopyalayın (canlı için Production, sandbox için Development anahtarları).',
        'CRM Bağlantılar’da QuickBooks Online için Bağla’ya tıklayın, Client ID + Client Secret’ı yapıştırın ve Kaydedin.',
        'Kart artık "yetki bekliyor" gösterir — Yetkilendir’e tıklayın, Intuit’te izni verin, bağlı olarak geri döneceksiniz.',
      ],
      fields: [
        { label: 'Client ID', hint: 'Intuit uygulaması Keys & OAuth’tan.' },
        { label: 'Client Secret', hint: 'Şifreli saklanır.' },
      ],
      notes: [
        'Redirect URI birebir eşleşmeli (https dahil).',
        'Access/refresh token’lar şifreli saklanır ve otomatik yenilenir.',
      ],
      docUrl: 'https://developer.intuit.com',
    },
  },
  {
    key: 'xero',
    name: 'Xero',
    icon: '📘',
    category: 'accounting',
    en: {
      summary: 'Connect Xero (OAuth2) to sync invoices to your accounting.',
      prerequisites: ['A Xero account and a Xero developer app.'],
      steps: [
        'Go to the Xero Developer portal (developer.xero.com) → My Apps → New app.',
        'Choose "Web app", set a name and company URL.',
        'Set the OAuth 2.0 redirect URI exactly to: {DOMAIN}/api/v1/connections/oauth/callback',
        'Generate a Client Secret, then copy the Client ID and Client Secret.',
        'In CRM Connections, click Connect on Xero, paste them, and Save.',
        'Click Authorize, consent on Xero, and you’ll return connected.',
      ],
      fields: [
        { label: 'Client ID', hint: 'From your Xero app.' },
        { label: 'Client Secret', hint: 'Stored encrypted.' },
      ],
      notes: [
        'Requested scopes: accounting.transactions, accounting.contacts, offline_access (for refresh).',
        'Tokens are stored encrypted and refreshed automatically.',
      ],
      docUrl: 'https://developer.xero.com/app/manage',
    },
    tr: {
      summary: 'Faturaları muhasebeye aktarmak için Xero’yu (OAuth2) bağlayın.',
      prerequisites: ['Bir Xero hesabı ve bir Xero geliştirici uygulaması.'],
      steps: [
        'Xero Developer portalına (developer.xero.com) → My Apps → New app gidin.',
        '"Web app" seçin, bir ad ve şirket URL’i girin.',
        'OAuth 2.0 redirect URI’sini birebir şu yapın: {DOMAIN}/api/v1/connections/oauth/callback',
        'Bir Client Secret üretin, ardından Client ID ve Client Secret’ı kopyalayın.',
        'CRM Bağlantılar’da Xero için Bağla’ya tıklayın, yapıştırın ve Kaydedin.',
        'Yetkilendir’e tıklayın, Xero’da izni verin, bağlı olarak döneceksiniz.',
      ],
      fields: [
        { label: 'Client ID', hint: 'Xero uygulamanızdan.' },
        { label: 'Client Secret', hint: 'Şifreli saklanır.' },
      ],
      notes: [
        'İstenen kapsamlar: accounting.transactions, accounting.contacts, offline_access (yenileme için).',
        'Token’lar şifreli saklanır ve otomatik yenilenir.',
      ],
      docUrl: 'https://developer.xero.com/app/manage',
    },
  },
  {
    key: 'iyzico',
    name: 'iyzico',
    icon: '🏦',
    category: 'payments',
    en: {
      summary:
        'Collect card payments for invoices via the iyzico Checkout Form. From an invoice (Sent / Partially paid), click "Pay with iyzico".',
      prerequisites: ['An iyzico merchant account (use sandbox for testing).'],
      steps: [
        'Log in to the iyzico merchant panel (merchant.iyzipay.com; sandbox: sandbox-merchant.iyzipay.com).',
        'Go to Settings → API Keys and copy your API key and Secret key.',
        'In CRM Connections, click Connect on iyzico and paste the API Key + Secret Key.',
        'Base URL: leave empty for sandbox, or enter https://api.iyzipay.com for production.',
        'Save, then click Test.',
        'Make sure your domain is allowed in the iyzico merchant panel. The payment return callback is {DOMAIN}/api/v1/webhooks/iyzico/callback — handled automatically, you don’t enter it anywhere.',
      ],
      fields: [
        { label: 'API Key', hint: 'From iyzico Settings → API Keys.' },
        { label: 'Secret Key', hint: 'Stored encrypted.' },
        { label: 'Base URL', hint: 'Empty = sandbox; https://api.iyzipay.com = production.' },
      ],
      notes: [
        'The callback is unsigned, so the CRM re-verifies each payment server-to-server before marking the invoice paid; double callbacks are idempotent.',
        'To charge a real card, use production keys and the production Base URL.',
      ],
      docUrl: 'https://dev.iyzipay.com',
    },
    tr: {
      summary:
        'iyzico Checkout Form ile fatura kart tahsilatı. Bir faturadan (Gönderildi / Kısmi ödendi) "iyzico ile Öde"ye tıklayın.',
      prerequisites: ['Bir iyzico üye işyeri hesabı (test için sandbox).'],
      steps: [
        'iyzico üye işyeri paneline girin (merchant.iyzipay.com; sandbox: sandbox-merchant.iyzipay.com).',
        'Ayarlar → API Anahtarları’ndan API key ve Secret key’i kopyalayın.',
        'CRM Bağlantılar’da iyzico için Bağla’ya tıklayın; API Key + Secret Key’i yapıştırın.',
        'Base URL: sandbox için boş bırakın; canlı için https://api.iyzipay.com girin.',
        'Kaydedin, ardından Test edin.',
        'iyzico panelinde alan adınızın (domain) tanımlı olduğundan emin olun. Ödeme dönüş callback’i {DOMAIN}/api/v1/webhooks/iyzico/callback’tir — otomatik işlenir, hiçbir yere girmenize gerek yok.',
      ],
      fields: [
        { label: 'API Key', hint: 'iyzico Ayarlar → API Anahtarları’ndan.' },
        { label: 'Secret Key', hint: 'Şifreli saklanır.' },
        { label: 'Base URL', hint: 'Boş = sandbox; https://api.iyzipay.com = canlı.' },
      ],
      notes: [
        'Callback imzasızdır; bu yüzden CRM her ödemeyi sunucu-sunucu yeniden doğrulayıp faturayı öyle ödendi işaretler; çift callback idempotenttir.',
        'Gerçek kart çekmek için canlı anahtarlar ve canlı Base URL kullanın.',
      ],
      docUrl: 'https://dev.iyzipay.com',
    },
  },
  {
    key: 'meta_ads',
    name: 'Meta Ad Library',
    icon: '📣',
    category: 'research',
    en: {
      summary:
        'Discover competitor / niche ads via the official Meta Ad Library API (ads_archive). No scraping — used in a brand’s "Ad radar" tab, searching by your niche keywords without naming brands.',
      prerequisites: ['A Meta for Developers app and a valid access token.'],
      steps: [
        'Go to Meta for Developers (developers.facebook.com) and, if prompted, confirm your identity/location for Ad Library access.',
        'Create or open an app; use Tools → Graph API Explorer, or generate an app access token.',
        'Copy the access token.',
        'In CRM Connections, click Connect on Meta Ad Library and paste the Access Token.',
        'Save, then Test. In a brand’s "Ad radar" tab, search ads by your niche keywords.',
      ],
      fields: [
        { label: 'Access Token', hint: 'Graph API token with Ad Library access.' },
      ],
      notes: [
        'Only the official ads_archive endpoint is used (compliant — no scraping/anti-bot).',
        'Results depend on your token’s permissions and Meta’s Ad Library coverage per country.',
      ],
      docUrl: 'https://www.facebook.com/ads/library/api',
    },
    tr: {
      summary:
        'Resmi Meta Ad Library API’si (ads_archive) ile rakip / niş reklamları keşfedin. Kazıma yok — markanın "Reklam radarı" sekmesinde, marka adı vermeden niş anahtar kelimelerinizle aranır.',
      prerequisites: ['Bir Meta for Developers uygulaması ve geçerli bir access token.'],
      steps: [
        'Meta for Developers’a (developers.facebook.com) girin; istenirse Ad Library erişimi için kimlik/konum doğrulaması yapın.',
        'Bir uygulama oluşturun/açın; Tools → Graph API Explorer kullanın veya bir app access token üretin.',
        'Access token’ı kopyalayın.',
        'CRM Bağlantılar’da Meta Ad Library için Bağla’ya tıklayın ve Access Token’ı yapıştırın.',
        'Kaydedin, ardından Test edin. Markanın "Reklam radarı" sekmesinde niş anahtar kelimelerinizle reklam arayın.',
      ],
      fields: [
        { label: 'Access Token', hint: 'Ad Library erişimli Graph API token.' },
      ],
      notes: [
        'Yalnızca resmi ads_archive ucu kullanılır (uyumlu — kazıma/anti-bot yok).',
        'Sonuçlar token izinlerinize ve Meta’nın ülke bazlı Ad Library kapsamına bağlıdır.',
      ],
      docUrl: 'https://www.facebook.com/ads/library/api',
    },
  },
  {
    key: 'serpapi',
    name: 'SerpAPI (Google Trends)',
    icon: '📈',
    category: 'research',
    en: {
      summary:
        'Pull Google Trends interest-over-time via SerpAPI’s official endpoint (does not scrape Google directly). Used in a brand’s "Trends" tab.',
      prerequisites: ['A SerpAPI account.'],
      steps: [
        'Register at serpapi.com.',
        'Open your Dashboard and copy your Private API Key.',
        'In CRM Connections, click Connect on SerpAPI and paste the API key.',
        'Save, then Test. In a brand’s "Trends" tab, view interest over time for your keywords.',
      ],
      fields: [{ label: 'SerpAPI Key', hint: 'Private API key from your dashboard.' }],
      notes: ['SerpAPI has a monthly search quota depending on your plan.'],
      docUrl: 'https://serpapi.com/dashboard',
    },
    tr: {
      summary:
        'SerpAPI’nin resmi ucu üzerinden Google Trends ilgi-zaman verisini çekin (Google’ı doğrudan kazımaz). Markanın "Trendler" sekmesinde kullanılır.',
      prerequisites: ['Bir SerpAPI hesabı.'],
      steps: [
        'serpapi.com’da kayıt olun.',
        'Dashboard’ınızı açıp Private API Key’inizi kopyalayın.',
        'CRM Bağlantılar’da SerpAPI için Bağla’ya tıklayın ve API anahtarını yapıştırın.',
        'Kaydedin, ardından Test edin. Markanın "Trendler" sekmesinde anahtar kelimeleriniz için ilgi-zaman grafiğini görün.',
      ],
      fields: [{ label: 'SerpAPI Key', hint: 'Dashboard’ınızdaki private API anahtarı.' }],
      notes: ['SerpAPI, planınıza göre aylık arama kotasına sahiptir.'],
      docUrl: 'https://serpapi.com/dashboard',
    },
  },
];

// Provider → emoji ikon (Bağlantılar sayfası kartlarında da kullanılır).
export const INTEGRATION_ICONS: Record<string, string> = Object.fromEntries(
  INTEGRATION_GUIDE.map((g) => [g.key, g.icon]),
);
