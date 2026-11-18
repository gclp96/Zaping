import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import EntryPage from './page';

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  retry: vi.fn(),
  session: { status: 'loading' } as {
    status: 'loading' | 'success' | 'unauthenticated' | 'error';
    message?: string;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock('@/app/auth-session', () => ({
  useAuthenticatedSession: () => ({
    ...mocks.session,
    retry: mocks.retry,
  }),
}));

describe('root entry route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { status: 'loading' };
  });

  afterEach(() => {
    cleanup();
  });

  it('shows session verification without redirecting prematurely', () => {
    render(<EntryPage />);

    expect(screen.getByText('Verificando sesión...')).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it('redirects valid sessions to /home without adding a history entry', () => {
    mocks.session = { status: 'success' };

    render(<EntryPage />);

    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/home');
  });

  it('redirects unauthenticated sessions to /login', () => {
    mocks.session = { status: 'unauthenticated' };

    render(<EntryPage />);

    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/login');
  });

  it('offers retry instead of redirecting when session verification fails', async () => {
    mocks.session = {
      status: 'error',
      message: 'No fue posible verificar tu sesión.',
    };

    render(<EntryPage />);

    expect(
      screen.getByRole('heading', {
        name: 'No se pudo verificar tu sesión',
      }),
    ).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();

    await userEvent.setup().click(
      screen.getByRole('button', { name: 'Reintentar' }),
    );
    expect(mocks.retry).toHaveBeenCalledOnce();
  });
});
