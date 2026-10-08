'use client';
// src/components/organisms/Sidebar.tsx — Navigation métier Elysence Partner.
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Logo } from '../molecules/Logo';

const LS_KEY = 'crm_nav_open';

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const { can } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setOpen(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, []);

  const toggle = (id: string) =>
    setOpen((o) => {
      const next = { ...o, [id]: !o[id] };
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  const NavLink = ({ href, label }: { href: string; label: string }) => (
    <a
      href={href}
      className="block rounded-md px-3 py-2 text-sm font-medium text-elysence-cream hover:bg-elysence-gold/10"
    >
      {label}
    </a>
  );

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="pt-3">
      <button
        onClick={() => toggle(id)}
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider text-elysence-gold/70 hover:bg-elysence-gold/10"
      >
        <span>{title}</span>
        <svg
          className={`h-4 w-4 transition-transform ${open[id] ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open[id] && (
        <div className="ml-2 space-y-1 border-l border-elysence-gold/20 pl-2">
          {children}
        </div>
      )}
    </div>
  );

  return (
    <aside className="flex w-56 flex-col bg-elysence-espresso p-4">
      <div className="mb-4 flex items-center justify-between px-2">
        <Logo size={28} textClass="text-base text-elysence-cream" />
        {onClose && (
          <button
            onClick={onClose}
            className="rounded p-1 text-elysence-gold/70 hover:bg-elysence-gold/10 hover:text-elysence-gold lg:hidden"
            aria-label="Fermer le menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto">
        {/* ACTIVITÉ */}
        <Section id="activite" title="Activité">
          <NavLink href="/" label="Tableau de bord" />
          {can('lead.read') && <NavLink href="/leads" label="Nouvelles demandes" />}
          {can('contact.read') && <NavLink href="/contacts" label="Clientes" />}
          {can('meeting.read') && <NavLink href="/meetings" label="Rendez-vous" />}
        </Section>

        {/* VENTES */}
        <Section id="ventes" title="Ventes">
          {can('product.read') && <NavLink href="/products" label="Prestations" />}
          {can('deal.read') && <NavLink href="/sales" label="Ventes" />}
          {can('invoice.read') && <NavLink href="/invoices" label="Factures" />}
        </Section>

        {/* ADMINISTRATION */}
        <Section id="admin" title="Administration">
          {can('lead_form.read') && <NavLink href="/lead-forms" label="Formulaires" />}
          {can('user.read') && <NavLink href="/users" label="Utilisateurs" />}
          {can('branding.manage') && <NavLink href="/branding" label="Paramètres" />}
        </Section>
      </nav>
    </aside>
  );
}
