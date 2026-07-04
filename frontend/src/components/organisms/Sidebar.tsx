'use client';
// src/components/organisms/Sidebar.tsx — izne göre gruplanmış, açılır-kapanır menü (i18n).
// Tüm gruplar varsayılan KAPALI; kullanıcı ok ile açar, seçim localStorage'da kalır.
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { NavItem } from '../molecules/NavItem';
import { NavSection } from '../molecules/NavSection';
import { Logo } from '../molecules/Logo';

const LS_KEY = 'crm_nav_open';

export function Sidebar() {
  const { can } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Açık/kapalı tercihini geri yükle (varsayılan: hepsi kapalı).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setOpen(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* yok say */
    }
  }, []);

  const toggle = (id: string) =>
    setOpen((o) => {
      const next = { ...o, [id]: !o[id] };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
        /* yok say */
      }
      return next;
    });

  const sec = (id: string) => ({
    open: !!open[id],
    onToggle: () => toggle(id),
  });

  return (
    <aside className="flex w-56 flex-col bg-gray-900 p-4">
      <div className="mb-4 px-2">
        <Logo size={28} textClass="text-base text-white" />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {/* Genel (her zaman görünür) */}
        <NavItem href="/" label={t('nav.dashboard')} />

        <NavSection title={t('nav.grpRadar')} {...sec('radar')}>
          {can('brand.read') && (
            <NavItem href="/brands" label={t('nav.brands')} />
          )}
        </NavSection>

        <NavSection title={t('nav.grpSales')} {...sec('sales')}>
          {can('lead.read') && <NavItem href="/leads" label={t('nav.leads')} />}
          {can('lead_form.read') && (
            <NavItem href="/lead-forms" label={t('nav.leadForms')} />
          )}
          {can('deal.read') && <NavItem href="/deals" label={t('nav.deals')} />}
          {can('pipeline.read') && (
            <NavItem href="/pipeline" label={t('nav.pipeline')} />
          )}
          {can('contact.read') && (
            <NavItem href="/contacts" label={t('nav.contacts')} />
          )}
          {can('company.read') && (
            <NavItem href="/companies" label={t('nav.companies')} />
          )}
          {can('meeting.read') && (
            <NavItem href="/meetings" label={t('nav.meetings')} />
          )}
          {can('whatsapp.read') && (
            <NavItem href="/whatsapp" label={t('nav.whatsapp')} />
          )}
        </NavSection>

        <NavSection title={t('nav.grpFinance')} {...sec('finance')}>
          {can('product.read') && (
            <NavItem href="/products" label={t('nav.products')} />
          )}
          {can('quote.read') && (
            <NavItem href="/quotes" label={t('nav.quotes')} />
          )}
          {can('invoice.read') && (
            <NavItem href="/invoices" label={t('nav.invoices')} />
          )}
        </NavSection>

        <NavSection title={t('nav.grpInsights')} {...sec('insights')}>
          {can('deal.read') && (
            <NavItem href="/reports" label={t('nav.reports')} />
          )}
          {can('ai.use') && <NavItem href="/ai" label={t('nav.ai')} />}
        </NavSection>

        <NavSection title={t('nav.grpConfig')} {...sec('config')}>
          {(can('data.export') || can('data.import')) && (
            <NavItem href="/data" label={t('nav.data')} />
          )}
          {can('automation.read') && (
            <NavItem href="/automation" label={t('nav.automation')} />
          )}
          {can('custom_field.read') && (
            <NavItem href="/custom-fields" label={t('nav.customFields')} />
          )}
          {can('integration.read') && (
            <NavItem href="/connections" label={t('nav.connections')} />
          )}
          {can('integration.read') && (
            <NavItem href="/integrations" label={t('nav.integrations')} />
          )}
        </NavSection>

        <NavSection title={t('nav.grpAdmin')} {...sec('admin')}>
          {can('audit.read') && (
            <NavItem href="/audit" label={t('nav.audit')} />
          )}
          {can('role.read') && <NavItem href="/roles" label={t('nav.roles')} />}
          {can('platform.tenant.manage') && (
            <NavItem href="/tenants" label={t('nav.tenants')} />
          )}
          {can('user.read') && <NavItem href="/users" label={t('nav.users')} />}
        </NavSection>

        <NavSection title={t('nav.grpPrefs')} {...sec('prefs')}>
          {can('branding.manage') && (
            <NavItem href="/branding" label={t('nav.branding')} />
          )}
          <NavItem href="/language" label={t('nav.language')} />
        </NavSection>
      </nav>
    </aside>
  );
}
