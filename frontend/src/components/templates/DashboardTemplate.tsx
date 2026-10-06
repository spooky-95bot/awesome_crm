'use client';
// src/components/templates/DashboardTemplate.tsx — korumalı panel iskeleti.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Spinner } from '../atoms/Spinner';
import { Sidebar } from '../organisms/Sidebar';
import { Topbar } from '../organisms/Topbar';

export function DashboardTemplate({
  title,
  children,
}: {
  title: string; // "page.*" ise çevrilir; değilse düz metin gösterilir
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const titleText = title.startsWith('page.') ? t(title) : title;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [router]);

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-elysence-paper">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar: hidden on mobile, drawer when open; always visible on lg+ */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <h2 className="mb-4 text-xl font-semibold text-elysence-ink">
            {titleText}
          </h2>
          {children}
        </main>
      </div>
    </div>
  );
}
