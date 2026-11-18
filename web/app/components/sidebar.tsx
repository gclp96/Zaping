"use client";

import { PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";

import {
  isNavigationItemActive,
  getVisibleNavigationGroups,
} from "@/app/components/navigation";
import type { UserRole } from "@/app/auth-session";

type SidebarProps = {
  pathname: string;
  collapsed?: boolean;
  collapsible?: boolean;
  className?: string;
  id?: string;
  onNavigate?: () => void;
  onToggleCollapsed?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
  transitionEnabled?: boolean;
  currentUserRole?: UserRole | null;
};

export default function Sidebar({
  pathname,
  collapsed = false,
  collapsible = false,
  className = "",
  id,
  onNavigate,
  onToggleCollapsed,
  showCloseButton = false,
  onClose,
  transitionEnabled = true,
  currentUserRole,
}: SidebarProps) {
  const navigationGroups = getVisibleNavigationGroups(currentUserRole);

  return (
    <aside
      id={id}
      className={`min-h-0 flex-col overflow-y-auto overscroll-contain bg-slate-950 py-4 text-white ${
        collapsed ? "w-20 px-2" : "w-64 px-4"
      } ${
        transitionEnabled
          ? "transition-[width,padding] duration-[var(--motion-duration-normal)] ease-[var(--motion-easing-standard)]"
          : ""
      } ${className}`}
    >
      <div
        className={
          collapsed
            ? "flex flex-col items-center gap-2"
            : "flex items-center justify-between gap-3"
        }
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-md bg-primary text-base font-bold text-primary-foreground"
          >
            Z
          </span>

          {collapsed ? null : (
            <p className="truncate text-lg font-semibold">Zaping ERP</p>
          )}
        </div>

        {showCloseButton ? (
          <button
            type="button"
            aria-label="Cerrar navegación"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-md border border-white/15 text-slate-200 transition-colors duration-[var(--motion-duration-fast)] hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            onClick={onClose}
          >
            <X aria-hidden="true" size={19} />
          </button>
        ) : null}

        {collapsible ? (
          <button
            type="button"
            aria-label={
              collapsed ? "Expandir navegación" : "Colapsar navegación"
            }
            aria-controls={id}
            aria-expanded={!collapsed}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-md border border-white/15 text-slate-300 transition-colors duration-[var(--motion-duration-fast)] hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            onClick={onToggleCollapsed}
          >
            {collapsed ? (
              <PanelLeftOpen aria-hidden="true" size={19} />
            ) : (
              <PanelLeftClose aria-hidden="true" size={19} />
            )}
          </button>
        ) : null}
      </div>

      <nav
        className={`${collapsed ? "mt-5 space-y-5" : "mt-6 space-y-5"}`}
        aria-label="Navegación principal"
      >
        {navigationGroups.map((group) => (
          <div key={group.label}>
            <p
              className={
                collapsed
                  ? "sr-only"
                  : "mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400"
              }
            >
              {group.label}
            </p>

            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => {
                const active = isNavigationItemActive(pathname, item.href);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`flex min-h-10 items-center rounded-ui-md border-l-2 py-2 text-sm font-medium transition-colors duration-[var(--motion-duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                      collapsed ? "justify-center px-2" : "gap-3 px-3"
                    } ${
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-subtle"
                        : "border-transparent text-slate-300 hover:bg-white/10 hover:text-white"
                    }`}
                    onClick={onNavigate}
                  >
                    <Icon
                      aria-hidden="true"
                      className="shrink-0"
                      size={19}
                      strokeWidth={1.8}
                    />
                    <span className={collapsed ? "sr-only" : "min-w-0 whitespace-normal break-words leading-5"}>
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
