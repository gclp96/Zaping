'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuthenticatedSession } from '@/app/auth-session';
import Button from '@/app/components/ui/Button';
import Loading from '@/app/components/ui/Loading';

export default function EntryPage() {
  const router = useRouter();
  const session = useAuthenticatedSession({ requireToken: true });

  useEffect(() => {
    if (session.status === 'success') {
      router.replace('/home');
    } else if (session.status === 'unauthenticated') {
      router.replace('/login');
    }
  }, [router, session.status]);

  if (session.status === 'error') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface-subtle p-6">
        <div
          className="w-full max-w-md rounded-ui-lg border border-border bg-surface p-6 shadow-subtle"
          role="alert"
        >
          <h1 className="text-lg font-semibold text-text">
            No se pudo verificar tu sesión
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {session.message}
          </p>
          <Button type="button" className="mt-5" onClick={session.retry}>
            Reintentar
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-subtle p-6">
      <div className="w-full max-w-md" role="status" aria-live="polite">
        <Loading
          message={
            session.status === 'loading'
              ? 'Verificando sesión...'
              : 'Redirigiendo...'
          }
        />
      </div>
    </main>
  );
}
