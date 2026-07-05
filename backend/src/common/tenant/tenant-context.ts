// src/common/tenant/tenant-context.ts
// İstek kapsamlı tenant bağlamı (AsyncLocalStorage). Prisma orta katmanı ve servisler
// mevcut tenantId'yi buradan okur → her sorguda elle taşımaya gerek yok.
import { AsyncLocalStorage } from 'async_hooks';

interface TenantStore {
  tenantId: string | null;
}

const storage = new AsyncLocalStorage<TenantStore>();

export function runWithTenant<T>(tenantId: string | null, fn: () => T): T {
  return storage.run({ tenantId }, fn);
}

export function getCurrentTenantId(): string | null {
  return storage.getStore()?.tenantId ?? null;
}

// Tenant kapsamına alınan modeller (otomatik filtre uygulanır).
// Deal + Invoice kapsanıyor. User auth (global e-posta sorgusu) nedeniyle hariç —
// kademeli geçişte ayrı ele alınır (docs/06 §10).
export const TENANT_MODELS = new Set<string>([
  'Deal',
  'Invoice',
  'Company',
  'Contact',
  'Lead',
  'Meeting',
  'AutomationRule',
  'Product',
  'Quote',
  'LeadForm',
  'Connection',
  'WhatsAppMessage',
  'Brand',
  'Competitor',
  'SavedAd',
  'CompetitorProduct',
  'PaymentIntent',
]);
