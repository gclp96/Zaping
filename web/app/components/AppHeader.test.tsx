import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AppHeader from './AppHeader';

const account = {
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana@example.test',
  companyName: 'INSAP',
  companyTimezone: 'America/Hermosillo',
};

afterEach(() => {
  cleanup();
});

describe('AppHeader', () => {
  it('renders persistent page context and account without introducing an h1', () => {
    render(
      <AppHeader
        pathname="/products"
        user={account}
        onLogout={vi.fn()}
        title="Productos"
        mobileNavigationId="mobile-navigation"
        mobileNavigationOpen={false}
        onMenuClick={vi.fn()}
      />,
    );

    const header = screen.getByRole('banner');

    expect(within(header).getByText('Productos')).toBeTruthy();
    const company = within(header).getByText('INSAP');
    expect(company).toBeTruthy();
    expect(company.classList.contains('truncate')).toBe(false);
    expect(within(header).getByText('Empresa')).toBeTruthy();
    expect(within(header).getByLabelText('Fecha y hora de la empresa')).toBeTruthy();
    expect(within(header).queryByRole('heading', { level: 1 })).toBeNull();
    expect(header.classList.contains('sticky')).toBe(true);
    expect(header.classList.contains('xl:hidden')).toBe(false);
    expect(
      screen.getByRole('button', { name: 'Cuenta de Ana Pérez' }),
    ).toBeTruthy();
    expect(header.classList.contains('lg:hidden')).toBe(false);
    expect(within(header).queryByText('Notificaciones')).toBeNull();
    expect(
      within(header).getByText('Productos').classList.contains('lg:sr-only'),
    ).toBe(false);
  });

  it('offers the desktop sidebar toggle in the header when configured', async () => {
    const user = userEvent.setup();
    const onToggleDesktopSidebar = vi.fn();

    const { rerender } = render(
      <AppHeader
        pathname="/home"
        user={account}
        onLogout={vi.fn()}
        title="Inicio"
        mobileNavigationId="mobile-navigation"
        mobileNavigationOpen={false}
        onMenuClick={vi.fn()}
        desktopNavigationId="desktop-navigation"
        desktopSidebarCollapsed={false}
        onToggleDesktopSidebar={onToggleDesktopSidebar}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Colapsar navegación' });
    expect(toggle.getAttribute('aria-controls')).toBe('desktop-navigation');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await user.click(toggle);
    expect(onToggleDesktopSidebar).toHaveBeenCalledTimes(1);

    rerender(
      <AppHeader
        pathname="/home"
        user={account}
        onLogout={vi.fn()}
        title="Inicio"
        mobileNavigationId="mobile-navigation"
        mobileNavigationOpen={false}
        onMenuClick={vi.fn()}
        desktopNavigationId="desktop-navigation"
        desktopSidebarCollapsed
        onToggleDesktopSidebar={onToggleDesktopSidebar}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Expandir navegación' }).getAttribute('aria-expanded'),
    ).toBe('false');
  });

  it('exposes the drawer relationship and current expanded state', () => {
    render(
      <AppHeader
        pathname="/products"
        user={account}
        onLogout={vi.fn()}
        title="Productos"
        mobileNavigationId="mobile-navigation"
        mobileNavigationOpen
        onMenuClick={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', {
      name: 'Abrir navegación',
    });

    expect(button.getAttribute('aria-controls')).toBe('mobile-navigation');
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.classList.contains('lg:hidden')).toBe(false);
    expect(button.classList.contains('xl:hidden')).toBe(true);
    expect(
      screen.queryByRole('button', { name: 'Cuenta de Ana Pérez' }),
    ).toBeNull();
  });

  it('invokes the mobile menu command without rendering placeholders', async () => {
    const user = userEvent.setup();
    const onMenuClick = vi.fn();

    render(
      <AppHeader
        pathname="/products"
        user={account}
        onLogout={vi.fn()}
        title="Productos"
        mobileNavigationId="mobile-navigation"
        mobileNavigationOpen={false}
        onMenuClick={onMenuClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Abrir navegación' }));

    expect(onMenuClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByText('Notificaciones')).toBeNull();
    expect(screen.queryByText('Company')).toBeNull();
  });
});
