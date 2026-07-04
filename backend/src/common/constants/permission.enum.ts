// src/common/constants/permission.enum.ts
// Merkezi izin sabitleri (DRY) — "kaynak.eylem" biçimi. Hem Guard'lar hem seed kullanır.

export const PERMISSIONS = {
  USER: {
    CREATE: 'user.create',
    READ: 'user.read',
    UPDATE: 'user.update',
    DELETE: 'user.delete',
  },
  ROLE: {
    CREATE: 'role.create',
    READ: 'role.read',
    UPDATE: 'role.update',
    DELETE: 'role.delete',
    ASSIGN: 'role.assign',
  },
  DEAL: {
    CREATE: 'deal.create',
    READ: 'deal.read',
    UPDATE: 'deal.update',
    DELETE: 'deal.delete',
    MOVE: 'deal.move',
  },
  // v2.1c — nitelenmemiş Lead (Contact+Deal'e dönüştürülür)
  LEAD: {
    CREATE: 'lead.create',
    READ: 'lead.read',
    UPDATE: 'lead.update',
    DELETE: 'lead.delete',
    CONVERT: 'lead.convert',
  },
  // Lead intake — embed form + gelen webhook yapılandırması
  LEAD_FORM: {
    READ: 'lead_form.read',
    MANAGE: 'lead_form.manage',
  },
  // Pipeline / Kanban stage yapılandırması
  PIPELINE: {
    READ: 'pipeline.read',
    MANAGE: 'pipeline.manage',
  },
  // Marka (logo + uygulama adı) yönetimi
  BRANDING: {
    MANAGE: 'branding.manage',
  },
  // v3.1 — WhatsApp mesajlaşma
  WHATSAPP: {
    SEND: 'whatsapp.send',
    READ: 'whatsapp.read',
  },
  // v4.0 — Marka Radarı (markalar + niş + rakip + trend)
  BRAND: {
    READ: 'brand.read',
    MANAGE: 'brand.manage',
  },
  INVOICE: {
    CREATE: 'invoice.create',
    READ: 'invoice.read',
    UPDATE: 'invoice.update',
    DELETE: 'invoice.delete',
    READ_FINANCIAL: 'invoice.read_financial',
  },
  INTEGRATION: {
    READ: 'integration.read',
    MANAGE: 'integration.manage',
  },
  // v2.1 — çekirdek CRM nesneleri
  COMPANY: {
    CREATE: 'company.create',
    READ: 'company.read',
    UPDATE: 'company.update',
    DELETE: 'company.delete',
  },
  CONTACT: {
    CREATE: 'contact.create',
    READ: 'contact.read',
    UPDATE: 'contact.update',
    DELETE: 'contact.delete',
  },
  // v2.2 — takvim/toplantı
  MEETING: {
    CREATE: 'meeting.create',
    READ: 'meeting.read',
    UPDATE: 'meeting.update',
    DELETE: 'meeting.delete',
  },
  // v2.3 — otomasyon kuralları
  AUTOMATION: {
    READ: 'automation.read',
    MANAGE: 'automation.manage',
  },
  // v2.5 — özel alan tanımları
  CUSTOM_FIELD: {
    READ: 'custom_field.read',
    MANAGE: 'custom_field.manage',
  },
  // v2.6 — yapay zekâ (Claude) yardımcıları
  AI: {
    USE: 'ai.use',
  },
  // v2.7 — ürün kataloğu
  PRODUCT: {
    CREATE: 'product.create',
    READ: 'product.read',
    UPDATE: 'product.update',
    DELETE: 'product.delete',
  },
  // v2.7 — teklif (CPQ)
  QUOTE: {
    CREATE: 'quote.create',
    READ: 'quote.read',
    UPDATE: 'quote.update',
    DELETE: 'quote.delete',
    SEND: 'quote.send',
    CONVERT: 'quote.convert',
  },
  // v2.8 — veri içe/dışa aktarma + birleştirme
  DATA: {
    EXPORT: 'data.export',
    IMPORT: 'data.import',
    MERGE: 'data.merge',
  },
  // v2.9 — platform olgunluk
  AUDIT: {
    READ: 'audit.read',
  },
  GDPR: {
    EXPORT: 'gdpr.export',
    ERASE: 'gdpr.erase',
  },
  // v2.10 — platform yönetimi (tenant'lar arası; yalnız platform-admin)
  PLATFORM: {
    TENANT_MANAGE: 'platform.tenant.manage',
  },
} as const;

// Tüm izinlerin düz listesi (seed + doğrulama için).
export const ALL_PERMISSIONS: string[] = Object.values(PERMISSIONS).flatMap(
  (group) => Object.values(group),
);

export const ROLE_NAMES = {
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  SALES: 'SALES',
  FINANCE: 'FINANCE',
  VIEWER: 'VIEWER',
} as const;

// Varsayılan rol → izin eşlemesi (seed). En az ayrıcalık ilkesi.
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  [ROLE_NAMES.ADMIN]: ALL_PERMISSIONS, // tüm izinler
  [ROLE_NAMES.MANAGER]: [
    PERMISSIONS.USER.READ,
    PERMISSIONS.DEAL.CREATE,
    PERMISSIONS.DEAL.READ,
    PERMISSIONS.DEAL.UPDATE,
    PERMISSIONS.DEAL.DELETE,
    PERMISSIONS.DEAL.MOVE,
    PERMISSIONS.INVOICE.READ,
    // Faz 5: entegrasyon yönetimi yalnız ADMIN/MANAGER.
    PERMISSIONS.INTEGRATION.READ,
    PERMISSIONS.INTEGRATION.MANAGE,
    // v2.1: çekirdek nesneler — MANAGER tam yetki
    PERMISSIONS.COMPANY.CREATE,
    PERMISSIONS.COMPANY.READ,
    PERMISSIONS.COMPANY.UPDATE,
    PERMISSIONS.COMPANY.DELETE,
    PERMISSIONS.CONTACT.CREATE,
    PERMISSIONS.CONTACT.READ,
    PERMISSIONS.CONTACT.UPDATE,
    PERMISSIONS.CONTACT.DELETE,
    PERMISSIONS.LEAD.CREATE,
    PERMISSIONS.LEAD.READ,
    PERMISSIONS.LEAD.UPDATE,
    PERMISSIONS.LEAD.DELETE,
    PERMISSIONS.LEAD.CONVERT,
    PERMISSIONS.LEAD_FORM.READ,
    PERMISSIONS.LEAD_FORM.MANAGE,
    PERMISSIONS.PIPELINE.READ,
    PERMISSIONS.PIPELINE.MANAGE,
    PERMISSIONS.WHATSAPP.SEND,
    PERMISSIONS.WHATSAPP.READ,
    PERMISSIONS.BRAND.READ,
    PERMISSIONS.BRAND.MANAGE,
    PERMISSIONS.MEETING.CREATE,
    PERMISSIONS.MEETING.READ,
    PERMISSIONS.MEETING.UPDATE,
    PERMISSIONS.MEETING.DELETE,
    PERMISSIONS.AUTOMATION.READ,
    PERMISSIONS.AUTOMATION.MANAGE,
    PERMISSIONS.CUSTOM_FIELD.READ,
    PERMISSIONS.CUSTOM_FIELD.MANAGE,
    PERMISSIONS.AI.USE,
    PERMISSIONS.PRODUCT.CREATE,
    PERMISSIONS.PRODUCT.READ,
    PERMISSIONS.PRODUCT.UPDATE,
    PERMISSIONS.PRODUCT.DELETE,
    PERMISSIONS.QUOTE.CREATE,
    PERMISSIONS.QUOTE.READ,
    PERMISSIONS.QUOTE.UPDATE,
    PERMISSIONS.QUOTE.DELETE,
    PERMISSIONS.QUOTE.SEND,
    PERMISSIONS.QUOTE.CONVERT,
    PERMISSIONS.DATA.EXPORT,
    PERMISSIONS.DATA.IMPORT,
    PERMISSIONS.DATA.MERGE,
  ],
  [ROLE_NAMES.SALES]: [
    PERMISSIONS.DEAL.CREATE,
    PERMISSIONS.DEAL.READ,
    PERMISSIONS.DEAL.UPDATE,
    PERMISSIONS.DEAL.MOVE,
    // v2.1c: satışçı nitelenmemiş lead'leri yönetir ve dönüştürür
    PERMISSIONS.LEAD.CREATE,
    PERMISSIONS.LEAD.READ,
    PERMISSIONS.LEAD.UPDATE,
    PERMISSIONS.LEAD.CONVERT,
    PERMISSIONS.LEAD_FORM.READ,
    PERMISSIONS.PIPELINE.READ,
    PERMISSIONS.WHATSAPP.SEND,
    PERMISSIONS.WHATSAPP.READ,
    PERMISSIONS.BRAND.READ,
    PERMISSIONS.BRAND.MANAGE,
    PERMISSIONS.MEETING.CREATE,
    PERMISSIONS.MEETING.READ,
    PERMISSIONS.MEETING.UPDATE,
    PERMISSIONS.MEETING.DELETE,
    // Faz 4: satışçı faturanın varlığını görür ama tutarları göremez
    // (invoice.read_financial YOK → API'de finansal alanlar kesilir).
    PERMISSIONS.INVOICE.READ,
    // v2.1: satışçı kişi/şirket oluşturur ve yönetir
    PERMISSIONS.COMPANY.CREATE,
    PERMISSIONS.COMPANY.READ,
    PERMISSIONS.CONTACT.CREATE,
    PERMISSIONS.CONTACT.READ,
    PERMISSIONS.CONTACT.UPDATE,
    PERMISSIONS.CUSTOM_FIELD.READ,
    PERMISSIONS.AI.USE,
    PERMISSIONS.PRODUCT.READ,
    PERMISSIONS.QUOTE.CREATE,
    PERMISSIONS.QUOTE.READ,
    PERMISSIONS.QUOTE.UPDATE,
    PERMISSIONS.QUOTE.SEND,
    PERMISSIONS.QUOTE.CONVERT,
    PERMISSIONS.DATA.EXPORT,
  ],
  [ROLE_NAMES.FINANCE]: [
    PERMISSIONS.INVOICE.CREATE,
    PERMISSIONS.INVOICE.READ,
    PERMISSIONS.INVOICE.UPDATE,
    PERMISSIONS.INVOICE.DELETE,
    PERMISSIONS.INVOICE.READ_FINANCIAL,
    PERMISSIONS.PRODUCT.READ,
    PERMISSIONS.QUOTE.READ,
    PERMISSIONS.QUOTE.CONVERT,
  ],
  // VIEWER: salt okuma (hassas finansal okuma HARİÇ).
  [ROLE_NAMES.VIEWER]: [
    PERMISSIONS.USER.READ,
    PERMISSIONS.ROLE.READ,
    PERMISSIONS.DEAL.READ,
    PERMISSIONS.INVOICE.READ,
    PERMISSIONS.COMPANY.READ,
    PERMISSIONS.CONTACT.READ,
    PERMISSIONS.LEAD.READ,
    PERMISSIONS.LEAD_FORM.READ,
    PERMISSIONS.PIPELINE.READ,
    PERMISSIONS.MEETING.READ,
    PERMISSIONS.CUSTOM_FIELD.READ,
    PERMISSIONS.PRODUCT.READ,
    PERMISSIONS.QUOTE.READ,
  ],
};
