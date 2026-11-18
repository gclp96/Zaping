import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/services/api';
import LoginPage from './page';

const navigationMock = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
}));

function sensitiveAxiosLikeError() {
  return {
    isAxiosError: true,
    config: {
      headers: { Authorization: 'Bearer SUPER_SECRET_JWT' },
      data: {
        email: 'qa@example.test',
        password: 'SUPER_SECRET_PASSWORD',
        currentPassword: 'SUPER_SECRET_CURRENT_PASSWORD',
        newPassword: 'SUPER_SECRET_NEW_PASSWORD',
      },
      url: '/reset-password?token=SUPER_SECRET_RESET_TOKEN',
    },
    request: { body: 'SUPER_SECRET_REQUEST_SECRET' },
    response: {
      status: 401,
      data: { secret: 'SUPER_SECRET_RESPONSE_SECRET' },
    },
  };
}

vi.mock('next/navigation', () => ({
  useRouter: () => navigationMock,
}));

vi.mock('@/services/api', () => ({
  api: { post: vi.fn() },
}));

describe('LoginPage UX-002', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.stubGlobal('alert', vi.fn());
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  async function fillLogin(email = 'user@example.com', password = 'secure-password') {
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: /Correo/ }), email);
    await user.type(screen.getByLabelText(/Contraseña/), password);
    return user;
  }

  it('renders the centered premium login with accessible fields and recovery links', () => {
    render(<LoginPage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Iniciar sesión' }),
    ).toBeTruthy();
    expect(
      screen.getByText('Accede a tu espacio de trabajo en Zaping ERP.'),
    ).toBeTruthy();
    expect(
      screen.getByRole('textbox', { name: /Correo/ }).getAttribute('autocomplete'),
    ).toBe('username');
    expect(
      screen.getByLabelText(/Contraseña/).getAttribute('autocomplete'),
    ).toBe('current-password');
    expect(
      screen.getByRole('link', { name: 'Olvidé mi contraseña' }).getAttribute('href'),
    ).toBe('/forgot-password');
    expect(
      screen.getByRole('link', { name: 'Crear cuenta' }).getAttribute('href'),
    ).toBe('/register');
    expect(
      screen.getByRole('button', { name: 'Iniciar sesión' }),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stores the token and replaces history with /home after successful login', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { token: 'session-token' },
    } as never);

    render(<LoginPage />);
    const user = await fillLogin();
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/login', {
        email: 'user@example.com',
        password: 'secure-password',
      });
      expect(localStorage.getItem('token')).toBe('session-token');
      expect(navigationMock.replace).toHaveBeenCalledWith('/home');
    });
    expect(navigationMock.push).not.toHaveBeenCalled();
  });

  it('shows an inline message without redirecting for invalid credentials', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401 },
    });

    render(<LoginPage />);
    const user = await fillLogin('user@example.com', 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(
      await screen.findByRole('alert'),
    ).toHaveProperty('textContent', 'Correo o contraseña incorrectos.');
    expect(navigationMock.replace).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('shows a generic inline error when the login API fails', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('Internal service unavailable'));

    render(<LoginPage />);
    const user = await fillLogin();
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(
      await screen.findByRole('alert'),
    ).toHaveProperty('textContent', 'No fue posible iniciar sesión. Intenta nuevamente.');
    expect(screen.queryByText('Internal service unavailable')).toBeNull();
    expect(navigationMock.replace).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('prevents duplicate submission while the login request is pending', async () => {
    let resolveLogin: ((value: unknown) => void) | undefined;
    vi.mocked(api.post).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLogin = resolve;
        }),
    );

    render(<LoginPage />);
    const user = await fillLogin();
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    const pendingButton = screen.getByRole('button', { name: 'Ingresando...' });
    expect((pendingButton as HTMLButtonElement).disabled).toBe(true);
    expect(api.post).toHaveBeenCalledTimes(1);

    resolveLogin?.({ data: { token: 'session-token' } });
    await waitFor(() => {
      expect(navigationMock.replace).toHaveBeenCalledWith('/home');
    });
  });

  it('does not log sensitive authentication errors', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(sensitiveAxiosLikeError());

    render(<LoginPage />);
    const user = await fillLogin('qa@example.test', 'SUPER_SECRET_PASSWORD');
    await user.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(
      await screen.findByRole('alert'),
    ).toHaveProperty('textContent', 'Correo o contraseña incorrectos.');
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();

    const serializedConsoleArgs = JSON.stringify(consoleErrorSpy.mock.calls);
    for (const secret of [
      'SUPER_SECRET_JWT',
      'SUPER_SECRET_PASSWORD',
      'SUPER_SECRET_CURRENT_PASSWORD',
      'SUPER_SECRET_NEW_PASSWORD',
      'SUPER_SECRET_RESET_TOKEN',
      'SUPER_SECRET_RESPONSE_SECRET',
    ]) {
      expect(serializedConsoleArgs).not.toContain(secret);
    }
  });
});
