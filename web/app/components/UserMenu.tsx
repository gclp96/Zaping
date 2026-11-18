"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, KeyRound, LogOut, UserRound } from "lucide-react";
import type { AuthenticatedSession } from "@/app/auth-session";

type UserMenuProps = {
  user: Pick<AuthenticatedSession, "firstName" | "lastName" | "email">;
  onLogout: () => void;
};

export default function UserMenu({ user, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const name = [user.firstName.trim(), user.lastName.trim()]
    .filter(Boolean)
    .join(" ");
  const identity = name || user.email.trim();
  const label = identity || "Cuenta";

  useEffect(() => {
    if (!open) return;
    function closeOutside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative shrink-0"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          triggerRef.current?.focus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={identity ? `Cuenta de ${identity}` : "Cuenta"}
        aria-expanded={open}
        aria-controls={panelId}
        title="Cuenta"
        className="inline-flex min-h-10 items-center gap-2 rounded-ui-md border border-border bg-surface px-3 text-sm font-medium text-text transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        onClick={() => setOpen((current) => !current)}
      >
        <div
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
        >
          <UserRound size={18} strokeWidth={2} />
        </div>
        <span className="hidden max-w-40 truncate sm:block">{label}</span>
        <ChevronDown aria-hidden="true" size={16} className="shrink-0" />
      </button>
      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Opciones de cuenta"
          className="absolute right-0 top-full z-[var(--z-popover)] mt-2 max-h-[calc(100dvh-5rem)] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-ui-lg border border-border bg-surface p-2 text-text shadow-lg"
        >
          <p className="break-words px-3 py-2 text-sm font-semibold">{label}</p>
          <Link
            href="/change-password"
            className="flex min-h-10 items-center gap-2 rounded-ui-md px-3 py-2 text-sm hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            onClick={() => setOpen(false)}
          >
            <KeyRound aria-hidden="true" size={18} className="shrink-0" />
            Cambiar contraseña
          </Link>
          <button
            type="button"
            className="flex min-h-10 w-full items-center gap-2 rounded-ui-md px-3 py-2 text-left text-sm hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut aria-hidden="true" size={18} className="shrink-0" />
            Cerrar sesión
          </button>
        </div>
      ) : null}
    </div>
  );
}
