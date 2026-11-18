"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import AppHeader from "@/app/components/AppHeader";
import {
  clearAuthenticatedSession,
  useAuthenticatedSession,
} from "@/app/auth-session";
import { getRouteTitle } from "@/app/components/navigation";
import Sidebar from "@/app/components/sidebar";
import Loading from "@/app/components/ui/Loading";

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "zaping.sidebar.collapsed";

const MOBILE_NAVIGATION_ID = "mobile-navigation-drawer";
// Keep aligned with Tailwind xl (80rem); only the open drawer subscribes.
const DESKTOP_MEDIA_QUERY = "(min-width: 80rem)";

type AppShellProps = {
  children: ReactNode;
};

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [loggedOut, setLoggedOut] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPreferenceReady, setSidebarPreferenceReady] = useState(false);
  const sessionState = useAuthenticatedSession({ requireToken: true });
  const drawerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const drawerWasOpenRef = useRef(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!loggedOut && sessionState.status !== "unauthenticated") {
      return;
    }

    router.replace("/login");
    // The router is stable in the App Router; status prevents repeated redirects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState.status, loggedOut]);

  useEffect(() => {
    try {
      const storedPreference = window.localStorage.getItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
      );

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSidebarCollapsed(storedPreference === "true");
    } catch {
      // The expanded default remains usable when storage is unavailable.
    } finally {
      setSidebarPreferenceReady(true);
    }
  }, []);

  useEffect(() => {
    if (!mobileNavigationOpen) {
      if (
        drawerWasOpenRef.current &&
        !window.matchMedia(DESKTOP_MEDIA_QUERY).matches
      ) {
        menuButtonRef.current?.focus();
      }

      drawerWasOpenRef.current = false;
      return;
    }

    const desktop = window.matchMedia(DESKTOP_MEDIA_QUERY);
    function closeAtDesktop() {
      if (!desktop.matches) return;
      const activeElement = document.activeElement;
      if (
        drawerRef.current?.contains(activeElement) ||
        activeElement === menuButtonRef.current ||
        activeElement === document.body
      ) {
        mainRef.current?.focus();
      }
      setMobileNavigationOpen(false);
    }

    // The viewport may change between the opening click and this effect.
    if (desktop.matches) {
      closeAtDesktop();
      return;
    }

    desktop.addEventListener("change", closeAtDesktop);
    drawerWasOpenRef.current = true;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileNavigationOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      desktop.removeEventListener("change", closeAtDesktop);
    };
  }, [mobileNavigationOpen]);

  if (
    loggedOut ||
    sessionState.status === "loading" ||
    sessionState.status === "unauthenticated"
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-subtle p-6">
        <div className="w-full max-w-md" role="status" aria-live="polite">
          <Loading
            message={
              loggedOut || sessionState.status === "unauthenticated"
                ? "Redirigiendo al inicio de sesión..."
                : "Cargando sesión..."
            }
          />
        </div>
      </div>
    );
  }

  if (sessionState.status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-subtle p-6">
        <div
          className="w-full max-w-md rounded-ui-lg border border-border bg-surface p-6 shadow-subtle"
          role="alert"
        >
          <h1 className="text-lg font-semibold text-text">
            No se pudo verificar tu sesión
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {sessionState.message}
          </p>
          <button
            type="button"
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-ui-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            onClick={sessionState.retry}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const title = getRouteTitle(pathname);
  const currentUserRole = sessionState.user.role;

  function logout() {
    clearAuthenticatedSession();
    setMobileNavigationOpen(false);
    setLoggedOut(true);
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((currentValue) => {
      const nextValue = !currentValue;

      try {
        window.localStorage.setItem(
          SIDEBAR_COLLAPSED_STORAGE_KEY,
          String(nextValue),
        );
      } catch {
        // The visual preference remains usable when storage is unavailable.
      }

      return nextValue;
    });
  }

  return (
    <div className="flex min-h-screen bg-surface-subtle text-text">
      <Sidebar
        id="desktop-navigation"
        pathname={pathname}
        collapsed={sidebarCollapsed}
        className="sticky top-0 hidden h-screen xl:flex"
        transitionEnabled={sidebarPreferenceReady}
        currentUserRole={currentUserRole}
      />

      {mobileNavigationOpen ? (
        <div
          ref={drawerRef}
          id={MOBILE_NAVIGATION_ID}
          className="fixed inset-0 z-[var(--z-drawer)] xl:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navegación principal"
          tabIndex={-1}
        >
          <button
            type="button"
            aria-label="Cerrar navegación"
            data-testid="navigation-backdrop"
            tabIndex={-1}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-[1px]"
            onClick={() => setMobileNavigationOpen(false)}
          />

          <Sidebar
            id="mobile-navigation"
            pathname={pathname}
            className="relative z-10 flex h-full w-[min(20rem,calc(100vw-2rem))] min-h-0"
            onNavigate={() => setMobileNavigationOpen(false)}
            showCloseButton
            onClose={() => setMobileNavigationOpen(false)}
            currentUserRole={currentUserRole}
          />
        </div>
      ) : null}

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <AppHeader
          pathname={pathname}
          user={sessionState.user}
          onLogout={logout}
          title={title}
          mobileNavigationId={MOBILE_NAVIGATION_ID}
          mobileNavigationOpen={mobileNavigationOpen}
          menuButtonRef={menuButtonRef}
          onMenuClick={() => setMobileNavigationOpen(true)}
          desktopNavigationId="desktop-navigation"
          desktopSidebarCollapsed={sidebarCollapsed}
          onToggleDesktopSidebar={toggleSidebarCollapsed}
        />
        <main ref={mainRef} tabIndex={-1} className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
