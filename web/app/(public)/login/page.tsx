'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import {
  AUTH_TOKEN_STORAGE_KEY,
  clearAuthenticatedSessionCache,
} from '@/app/auth-session';
import Button from '@/app/components/ui/Button';
import Input from '@/app/components/ui/Input';
import { api } from '@/services/api';
import { getApiErrorStatus } from '@/services/errors';

function ZapingBrandMark() {
  // Provisional geometric brand mark; no external asset or official logo required.
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 96 72"
      fill="none"
      className="mx-auto h-16 w-20"
    >
      <defs>
        <linearGradient id="zaping-login-mark" x1="9" y1="8" x2="87" y2="61" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <path d="M30 8H87L69 27H12L30 8Z" fill="url(#zaping-login-mark)" />
      <path d="M67 8H87L27 60H7L67 8Z" fill="#2563eb" />
      <path d="M27 41H84L66 60H9L27 41Z" fill="url(#zaping-login-mark)" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setErrorMessage('');

    try {
      const response = await api.post('/auth/login', { email, password });
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, response.data.token);
      clearAuthenticatedSessionCache();
      router.replace('/home');
    } catch (error: unknown) {
      setErrorMessage(
        getApiErrorStatus(error) === 401
          ? 'Correo o contraseña incorrectos.'
          : 'No fue posible iniciar sesión. Intenta nuevamente.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden bg-[#f8faff] px-4 py-10 text-slate-900 sm:px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-48 -top-64 h-[38rem] w-[38rem] rotate-[-20deg] rounded-full bg-blue-100/70 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-64 -right-48 h-[38rem] w-[38rem] rotate-[20deg] rounded-full bg-indigo-100/70 blur-3xl"
      />

      <section
        aria-labelledby="login-title"
        className="relative z-10 w-full max-w-[29rem] rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-[0_24px_70px_-35px_rgba(30,64,175,0.28)] sm:p-10"
      >
        <div className="text-center">
          <ZapingBrandMark />
          <h1
            id="login-title"
            className="mt-5 text-3xl font-bold tracking-tight text-slate-900"
          >
            Iniciar sesión
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Accede a tu espacio de trabajo en Zaping ERP.
          </p>
        </div>

        <form onSubmit={handleLogin} className="mt-8 space-y-5">
          <div className="space-y-5">
            <Input
              label="Correo"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="usuario@empresa.com"
              value={email}
              required
              disabled={loading}
              onChange={(event) => {
                setEmail(event.target.value);
                setErrorMessage('');
              }}
              className="h-12 rounded-xl border-slate-300 px-4 text-base text-slate-900 placeholder:text-slate-400"
            />

            <Input
              label="Contraseña"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              required
              disabled={loading}
              onChange={(event) => {
                setPassword(event.target.value);
                setErrorMessage('');
              }}
              className="h-12 rounded-xl border-slate-300 px-4 text-base text-slate-900 placeholder:text-slate-400"
            />
          </div>

          {errorMessage ? (
            <p
              role="alert"
              aria-live="polite"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {errorMessage}
            </p>
          ) : null}

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={loading}
            loadingText="Ingresando..."
            className="min-h-12 rounded-xl"
          >
            Iniciar sesión
          </Button>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm">
            <Link
              href="/forgot-password"
              className="font-medium text-blue-600 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Olvidé mi contraseña
            </Link>
            <Link
              href="/register"
              className="font-semibold text-blue-600 underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Crear cuenta
            </Link>
          </div>
        </form>
      </section>
    </main>
  );
}
