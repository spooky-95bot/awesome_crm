'use client';
// app/login/page.tsx
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { LoginForm } from '@/components/organisms/LoginForm';

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace('/');
  }, [loading, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-amber-50 to-orange-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-elysence.svg"
            alt="Elysence Partner"
            className="mx-auto mb-4 h-16 w-auto object-contain"
          />
          <h1 className="text-2xl font-bold text-gray-900">Elysence Partner</h1>
          <p className="mt-2 text-sm text-gray-600">
            Gestion des leads et clients
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
