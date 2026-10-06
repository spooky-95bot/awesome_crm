// app/layout.tsx — kök layout (Providers).
import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/lib/providers';

export const metadata: Metadata = {
  title: 'Elysence Partner',
  description: 'CRM Elysence Partner — Gestion des leads et clients',
  manifest: '/manifest.json',
  icons: { icon: '/logo-elysence.svg' },
};

export const viewport: Viewport = {
  themeColor: '#80602d',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
