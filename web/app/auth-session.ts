"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/services/api";
import { getApiErrorStatus } from "@/services/errors";

export const AUTH_TOKEN_STORAGE_KEY = "token";

export type UserRole = "ADMIN" | "MANAGER" | "SALES" | "WAREHOUSE";

export type AuthenticatedSession = {
  id: string;
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  companyTimezone: string;
  companyName: string;
};

export type AuthenticatedSessionState =
  | { status: "loading" }
  | { status: "success"; user: AuthenticatedSession }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

type AuthenticatedSessionHookState = AuthenticatedSessionState & {
  retry: () => void;
};

type SessionLoadOptions = {
  requireToken?: boolean;
};

export function hasStoredAuthToken(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return Boolean(window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY));
  } catch {
    return false;
  }
}

let cachedSession: AuthenticatedSession | null = null;
let sessionRequest: Promise<AuthenticatedSession> | null = null;
let sessionGeneration = 0;

export async function loadAuthenticatedSession({
  requireToken = false,
}: SessionLoadOptions = {}): Promise<AuthenticatedSession | null> {
  if (requireToken && !hasStoredAuthToken()) {
    cachedSession = null;
    return null;
  }

  if (cachedSession && (!requireToken || hasStoredAuthToken())) {
    return cachedSession;
  }

  const generation = sessionGeneration;
  sessionRequest ??= api
    .get<AuthenticatedSession>("/auth/me")
    .then((response) => {
      if (generation === sessionGeneration) cachedSession = response.data;
      return response.data;
    })
    .finally(() => {
      if (generation === sessionGeneration) sessionRequest = null;
    });

  return sessionRequest;
}

export function clearAuthenticatedSessionCache() {
  sessionGeneration += 1;
  cachedSession = null;
  sessionRequest = null;
}

export function clearAuthenticatedSession() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    } catch {
      // The in-memory session still clears when storage is unavailable.
    }
    clearAuthenticatedSessionCache();
    return;
  }

  clearAuthenticatedSessionCache();
}

export function useAuthenticatedSession({
  requireToken = false,
}: SessionLoadOptions = {}): AuthenticatedSessionHookState {
  const [state, setState] = useState<AuthenticatedSessionState>(() =>
    cachedSession && (!requireToken || hasStoredAuthToken())
      ? { status: "success", user: cachedSession }
      : { status: "loading" },
  );
  const [retryVersion, setRetryVersion] = useState(0);
  const retry = useCallback(() => {
    setState({ status: "loading" });
    setRetryVersion((currentVersion) => currentVersion + 1);
  }, []);

  useEffect(() => {
    let mounted = true;

    if (requireToken && !hasStoredAuthToken()) {
      cachedSession = null;
      // The client-only token check transitions the bootstrap state explicitly.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "unauthenticated" });
      return () => {
        mounted = false;
      };
    }

    loadAuthenticatedSession({ requireToken })
      .then((user) => {
        if (!mounted) return;

        if (!user) {
          setState({ status: "unauthenticated" });
          return;
        }

        setState({ status: "success", user });
      })
      .catch((error: unknown) => {
        if (mounted) {
          if (getApiErrorStatus(error) === 401) {
            setState({ status: "unauthenticated" });
            return;
          }

          setState({
            status: "error",
            message: "No fue posible verificar tu sesión.",
          });
        }
      });

    return () => {
      mounted = false;
    };
  }, [requireToken, retryVersion]);

  return { ...state, retry };
}
