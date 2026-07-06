'use client';
// app/(dashboard)/connections/guide/page.tsx — Entegrasyon rehberi.
// KENDİ dil seçicisi (EN/TR) vardır; uygulama dilinden BAĞIMSIZDIR ve HER ZAMAN İngilizce açılır.
// Yalnız İngilizce + Türkçe desteklenir (bilinçli, kullanıcıya not olarak bildirilir).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DashboardTemplate } from '@/components/templates/DashboardTemplate';
import { Card } from '@/components/atoms/Card';
import { INTEGRATION_GUIDE, type GuideLang } from '@/lib/integration-guide';

type DocLang = 'en' | 'tr';

const UI = {
  en: {
    title: 'Integration Guide',
    intro:
      'Step-by-step setup for every integration on the Connections page. Pick a service below.',
    langNote:
      'This guide is available in English and Turkish only — independent of the app language — and always opens in English. Use the toggle above to switch; it will not affect the rest of the app.',
    prerequisites: 'Prerequisites',
    steps: 'Steps',
    fields: 'What to enter in the CRM',
    notes: 'Notes',
    openDocs: 'Official documentation ↗',
    back: '← Back to Connections',
    toc: 'Integrations',
  },
  tr: {
    title: 'Entegrasyon Rehberi',
    intro:
      'Bağlantılar sayfasındaki her entegrasyon için adım adım kurulum. Aşağıdan bir servis seçin.',
    langNote:
      'Bu rehber yalnızca İngilizce ve Türkçe olarak sunulur — uygulama dilinden bağımsızdır — ve her zaman İngilizce açılır. Yukarıdaki düğmeyle değiştirin; bu, uygulamanın geri kalanını etkilemez.',
    prerequisites: 'Ön koşullar',
    steps: 'Adımlar',
    fields: 'CRM’e girilecekler',
    notes: 'Notlar',
    openDocs: 'Resmi dokümantasyon ↗',
    back: '← Bağlantılara dön',
    toc: 'Entegrasyonlar',
  },
};

export default function IntegrationGuidePage() {
  // HER ZAMAN İngilizce başlar (uygulama dilinden bağımsız, kalıcı değil).
  const [lang, setLang] = useState<DocLang>('en');
  const ui = UI[lang];

  // Bağlantılar kartından #anchor ile gelindiğinde ilgili bölüme kaydır.
  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const el = document.getElementById(hash);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 60);
    }
  }, []);

  const domain =
    typeof window !== 'undefined' ? window.location.origin : '{DOMAIN}';
  const fill = (s: string) => s.replaceAll('{DOMAIN}', domain);

  const section = (title: string, items: string[], ordered?: boolean) => {
    if (!items.length) return null;
    const List = ordered ? 'ol' : 'ul';
    return (
      <div className="mt-3">
        <h4 className="mb-1 text-sm font-semibold text-gray-700">{title}</h4>
        <List
          className={`space-y-1 pl-5 text-sm text-gray-600 ${
            ordered ? 'list-decimal' : 'list-disc'
          }`}
        >
          {items.map((x, i) => (
            <li key={i}>{fill(x)}</li>
          ))}
        </List>
      </div>
    );
  };

  return (
    <DashboardTemplate title={ui.title}>
      {/* Dil seçici (bağımsız) */}
      <div className="mb-3 flex items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-gray-300">
          {(['en', 'tr'] as DocLang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={`px-3 py-1 text-sm ${
                lang === l
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {l === 'en' ? 'English' : 'Türkçe'}
            </button>
          ))}
        </div>
        <Link href="/connections" className="text-sm text-brand-600 hover:underline">
          {ui.back}
        </Link>
      </div>

      <p className="mb-2 text-sm text-gray-600">{ui.intro}</p>
      <Card className="mb-4 border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        {ui.langNote}
      </Card>

      {/* İçindekiler */}
      <Card className="mb-5 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {ui.toc}
        </p>
        <div className="flex flex-wrap gap-2">
          {INTEGRATION_GUIDE.map((g) => (
            <a
              key={g.key}
              href={`#${g.key}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1 text-sm text-gray-700 hover:border-brand-400 hover:text-brand-700"
            >
              <span aria-hidden>{g.icon}</span>
              {g.name}
            </a>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        {INTEGRATION_GUIDE.map((g) => {
          const c: GuideLang = g[lang];
          return (
            <div key={g.key} id={g.key} className="scroll-mt-6">
              <Card className="p-5">
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden>
                  {g.icon}
                </span>
                <h3 className="text-lg font-semibold text-gray-800">
                  {g.name}
                </h3>
              </div>
              <p className="mt-2 text-sm text-gray-600">{fill(c.summary)}</p>

              {section(ui.prerequisites, c.prerequisites)}
              {section(ui.steps, c.steps, true)}

              {c.fields.length > 0 && (
                <div className="mt-3">
                  <h4 className="mb-1 text-sm font-semibold text-gray-700">
                    {ui.fields}
                  </h4>
                  <ul className="space-y-1 text-sm text-gray-600">
                    {c.fields.map((f, i) => (
                      <li key={i} className="flex flex-wrap gap-1">
                        <span className="font-medium text-gray-800">
                          {f.label}:
                        </span>
                        <span className="text-gray-500">{fill(f.hint)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {section(ui.notes, c.notes)}

              <a
                href={c.docUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm text-brand-600 hover:underline"
              >
                {ui.openDocs}
              </a>
              </Card>
            </div>
          );
        })}
      </div>
    </DashboardTemplate>
  );
}
