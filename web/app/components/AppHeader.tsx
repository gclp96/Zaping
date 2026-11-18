'use client';

import { Building2, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { Ref } from 'react';

import type { AuthenticatedSession } from '@/app/auth-session';
import CompanyClock from './CompanyClock';
import UserMenu from './UserMenu';

type AppHeaderProps = {
  title: string;
  pathname: string;
  user: Pick<
    AuthenticatedSession,
    'firstName' | 'lastName' | 'email' | 'companyName' | 'companyTimezone'
  >;
  onLogout: () => void;
  mobileNavigationId: string;
  mobileNavigationOpen: boolean;
  menuButtonRef?: Ref<HTMLButtonElement>;
  onMenuClick: () => void;
  desktopNavigationId?: string;
  desktopSidebarCollapsed?: boolean;
  onToggleDesktopSidebar?: () => void;
};

export default function AppHeader({
  title,
  pathname,
  user,
  onLogout,
  mobileNavigationId,
  mobileNavigationOpen,
  menuButtonRef,
  onMenuClick,
  desktopNavigationId = 'desktop-navigation',
  desktopSidebarCollapsed = false,
  onToggleDesktopSidebar,
}: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-[var(--z-sticky)] flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface/90 sm:px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <button
          ref={menuButtonRef}
          type="button"
          aria-label="Abrir navegación"
          aria-controls={mobileNavigationId}
          aria-expanded={mobileNavigationOpen}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-md text-text-secondary transition-colors duration-[var(--motion-duration-fast)] hover:bg-surface-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring xl:hidden"
          onClick={onMenuClick}
        >
          <Menu aria-hidden="true" size={20} />
        </button>
        {onToggleDesktopSidebar ? (
          <button
            type="button"
            aria-label={desktopSidebarCollapsed ? 'Expandir navegación' : 'Colapsar navegación'}
            aria-controls={desktopNavigationId}
            aria-expanded={!desktopSidebarCollapsed}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-ui-md text-text-secondary transition-colors duration-[var(--motion-duration-fast)] hover:bg-surface-subtle hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring xl:inline-flex"
            onClick={onToggleDesktopSidebar}
          >
            {desktopSidebarCollapsed ? (
              <PanelLeftOpen aria-hidden="true" size={20} />
            ) : (
              <PanelLeftClose aria-hidden="true" size={20} />
            )}
          </button>
        ) : null}
        <p className="truncate text-sm font-semibold text-text">{title}</p>
      </div>

      {mobileNavigationOpen ? null : (
        <div className="flex min-w-0 shrink-0 items-center gap-3 lg:gap-4">
          <div
            className="hidden min-w-0 max-w-64 items-center gap-2 rounded-ui-md border border-border bg-surface-subtle px-3 py-1.5 md:flex xl:max-w-72"
            aria-label="Empresa de la sesión"
            title={user.companyName}
          >
            <Building2 aria-hidden="true" size={18} className="shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="truncate text-[11px] leading-tight text-text-muted">Empresa</p>
              <p className="truncate text-sm font-semibold leading-tight text-text">
                {user.companyName}
              </p>
            </div>
          </div>
          <CompanyClock timezone={user.companyTimezone} />
          <UserMenu key={pathname} user={user} onLogout={onLogout} />
        </div>
      )}
    </header>
  );
}
