import { useEffect } from "react";

import {
  cleanup,
  act,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearAuthenticatedSessionCache,
  loadAuthenticatedSession,
  type AuthenticatedSession,
} from "@/app/auth-session";
import { api } from "@/services/api";

import AppShell from "./AppShell";

const navigationMock = vi.hoisted(() => ({
  pathname: "/products",
  replace: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  api: {
    get: vi.fn(),
  },
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationMock.pathname,
  useRouter: () => navigationMock,
}));

const adminSession: AuthenticatedSession = {
  id: "admin-1",
  companyId: "company-1",
  email: "admin@test.test",
  firstName: "Admin",
  lastName: "Test",
  role: "ADMIN",
  companyTimezone: "America/Hermosillo",
  companyName: 'QA Company',
};

const salesSession: AuthenticatedSession = {
  ...adminSession,
  id: "sales-1",
  email: "sales@test.test",
  firstName: "Sales",
  role: "SALES",
};

function axiosError(status: number) {
  return {
    isAxiosError: true,
    response: {
      status,
      data: { message: `HTTP ${status}` },
    },
  };
}

function sensitiveAxiosLikeError(status: number) {
  return {
    isAxiosError: true,
    config: {
      headers: {
        Authorization: "Bearer SUPER_SECRET_JWT",
      },
      data: {
        email: "qa@example.test",
        password: "SUPER_SECRET_PASSWORD",
        currentPassword: "SUPER_SECRET_CURRENT_PASSWORD",
        newPassword: "SUPER_SECRET_NEW_PASSWORD",
      },
      url: "/reset-password?token=SUPER_SECRET_RESET_TOKEN",
    },
    request: { body: "SUPER_SECRET_REQUEST_SECRET" },
    response: {
      status,
      data: { secret: "SUPER_SECRET_RESPONSE_SECRET" },
    },
  };
}

function mockAuthSuccess(session: AuthenticatedSession = adminSession) {
  vi.mocked(api.get).mockImplementation(async (url) => {
    if (String(url) === "/auth/me") {
      return { data: session } as never;
    }

    throw new Error(`Unexpected endpoint ${String(url)}`);
  });
}

function renderShell(
  child = <div data-testid="protected-child">Protected child</div>,
) {
  return render(<AppShell>{child}</AppShell>);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

// Deterministic matchMedia events test state transitions, not CSS geometry.
function mockViewport(initialWidth = 1279) {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const media = {
    matches: initialWidth >= 1280,
    media: "(min-width: 80rem)",
    addEventListener: vi.fn(
      (_type: string, listener: EventListenerOrEventListenerObject) =>
        listeners.add(listener),
    ),
    removeEventListener: vi.fn(
      (_type: string, listener: EventListenerOrEventListenerObject) =>
        listeners.delete(listener),
    ),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      if (query !== media.media)
        throw new Error("Unexpected media query: " + query);
      return media as unknown as MediaQueryList;
    }),
  );
  return {
    media,
    listeners,
    resize(width: number) {
      const matches = width >= 1280;
      if (media.matches === matches) return;
      media.matches = matches;
      const event = new Event("change");
      for (const listener of [...listeners]) {
        if (typeof listener === "function") listener(event);
        else listener.handleEvent(event);
      }
    },
  };
}

describe("AppShell session gate", () => {
  let viewport: ReturnType<typeof mockViewport>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    viewport = mockViewport();
    clearAuthenticatedSessionCache();
    window.localStorage.clear();
    navigationMock.pathname = "/products";
    consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    clearAuthenticatedSessionCache();
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.style.overflow = "";
  });

  it.each(["ADMIN", "MANAGER", "SALES", "WAREHOUSE"] as const)(
    "logs out %s and clears protected content and cached session",
    async (role) => {
      window.localStorage.setItem("token", "valid-token");
      mockAuthSuccess({ ...adminSession, role });
      renderShell();
      await userEvent.click(
        await screen.findByRole("button", { name: "Cuenta de Admin Test" }),
      );
      await userEvent.click(
        await screen.findByRole("button", { name: "Cerrar sesión" }),
      );
      expect(window.localStorage.getItem("token")).toBeNull();
      expect(screen.queryByTestId("protected-child")).toBeNull();
      expect(screen.getByRole("status").textContent).toContain(
        "Redirigiendo al inicio de sesión...",
      );
      await waitFor(() =>
        expect(navigationMock.replace).toHaveBeenCalledWith("/login"),
      );
      expect(await loadAuthenticatedSession({ requireToken: true })).toBeNull();
      window.localStorage.setItem("token", "new-session");
      mockAuthSuccess(salesSession);
      expect(
        (await loadAuthenticatedSession({ requireToken: true }))?.role,
      ).toBe("SALES");
    },
  );

  it("keeps account actions outside the drawer and logs out through the header", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("token", "valid-token");
    mockAuthSuccess();
    renderShell();
    await user.click(
      await screen.findByRole("button", { name: "Cuenta de Admin Test" }),
    );
    expect(
      screen.getByRole("region", { name: "Opciones de cuenta" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Abrir navegación" }));
    const drawer = screen.getByRole("dialog");
    expect(screen.queryByRole("region")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Cuenta de Admin Test" }),
    ).toBeNull();
    expect(
      within(drawer).queryByRole("link", { name: "Cambiar contraseña" }),
    ).toBeNull();
    expect(
      within(drawer).queryByRole("button", { name: "Cerrar sesión" }),
    ).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Abrir navegación" }),
    );
    const account = screen.getByRole("button", {
      name: "Cuenta de Admin Test",
    });
    expect(account.getAttribute("aria-expanded")).toBe("false");
    await user.click(account);
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(window.localStorage.getItem("token")).toBeNull();
    expect(screen.queryByTestId("protected-child")).toBeNull();
    await waitFor(() =>
      expect(navigationMock.replace).toHaveBeenCalledWith("/login"),
    );
  });

  it("navigates to the existing password route and resets the disclosure on route changes without refetching session", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("token", "valid-token");
    mockAuthSuccess();
    const view = renderShell();
    await user.click(
      await screen.findByRole("button", { name: "Cuenta de Admin Test" }),
    );
    const link = screen.getByRole("link", { name: "Cambiar contraseña" });
    expect(link.getAttribute("href")).toBe("/change-password");
    link.addEventListener("click", (event) => event.preventDefault());
    await user.click(link);
    expect(screen.queryByRole("region")).toBeNull();
    await user.click(
      screen.getByRole("button", { name: "Cuenta de Admin Test" }),
    );
    navigationMock.pathname = "/change-password";
    view.rerender(
      <AppShell>
        <div data-testid="protected-child">Protected child</div>
      </AppShell>,
    );
    expect(
      within(screen.getByRole("banner")).getByText("Cambiar contraseña"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "Cuenta de Admin Test" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.getAllByRole("main")).toHaveLength(1);
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it("closes the mobile drawer at 1280 after opening at 1279, restores scroll and moves focus to visible content", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "scroll";
    window.localStorage.setItem("token", "valid-token");
    mockAuthSuccess();
    renderShell();
    await screen.findByRole("button", { name: /^Cuenta/ });
    const mobileTrigger = screen.getByRole("button", {
      name: "Abrir navegación",
    });
    await user.click(mobileTrigger);
    expect(document.activeElement).toBe(screen.getByRole("dialog"));
    expect(document.body.style.overflow).toBe("hidden");
    const hiddenTriggerFocus = vi.spyOn(mobileTrigger, "focus");

    act(() => viewport.resize(1280));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("scroll");
    expect(screen.getAllByRole("button", { name: /^Cuenta/ })).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(hiddenTriggerFocus).not.toHaveBeenCalled();
    expect(viewport.listeners.size).toBe(0);
    expect(viewport.media.removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("token")).toBe("valid-token");

    act(() => viewport.resize(1279));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Cuenta/ })).toHaveLength(1);
    expect(document.activeElement).toBe(screen.getByRole("main"));
    await user.click(screen.getByRole("button", { name: /^Cuenta/ }));
    expect(
      screen.getByRole("link", { name: "Cambiar contraseña" }),
    ).toBeTruthy();
    await user.click(mobileTrigger);
    expect(
      screen.queryByRole("region", { name: "Opciones de cuenta" }),
    ).toBeNull();
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(mobileTrigger);
    expect(document.body.style.overflow).toBe("scroll");
    document.body.style.overflow = "";
  });

  it("preserves focus already outside the drawer when entering desktop", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("token", "valid-token");
    mockAuthSuccess();
    renderShell(<input aria-label="Page input" />);
    await user.click(
      await screen.findByRole("button", { name: "Abrir navegación" }),
    );
    const input = screen.getByRole("textbox", { name: "Page input" });
    input.focus(); // Historical drawer focus-trap debt is not changed by this fix.
    act(() => viewport.resize(1280));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(document.body.style.overflow).toBe("");
  });

  it("removes the breakpoint listener and restores scroll when unmounted with the drawer open", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("token", "valid-token");
    mockAuthSuccess();
    const view = renderShell();
    await user.click(
      await screen.findByRole("button", { name: "Abrir navegación" }),
    );
    expect(viewport.listeners.size).toBe(1);
    view.unmount();
    expect(viewport.listeners.size).toBe(0);
    expect(document.body.style.overflow).toBe("");
    act(() => viewport.resize(1280));
    expect(document.body.style.overflow).toBe("");
  });

  it("handles a breakpoint change between the opening click and the drawer effect without focusing hidden controls", async () => {
    window.localStorage.setItem("token", "valid-token");
    mockAuthSuccess();
    renderShell();
    const mobileTrigger = await screen.findByRole("button", {
      name: "Abrir navegación",
    });
    mobileTrigger.focus();
    const hiddenTriggerFocus = vi.spyOn(mobileTrigger, "focus");
    act(() => {
      mobileTrigger.click();
      viewport.resize(1280);
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Cuenta de Admin Test" }),
    ).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("main"));
    expect(hiddenTriggerFocus).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("");
    expect(viewport.listeners.size).toBe(0);
  });

  it("does not restore a cleared session cache from an older request", async () => {
    const pending = deferred<{ data: AuthenticatedSession }>();
    vi.mocked(api.get).mockReturnValueOnce(pending.promise as never);
    const oldRequest = loadAuthenticatedSession();
    clearAuthenticatedSessionCache();
    pending.resolve({ data: adminSession });
    await oldRequest;
    mockAuthSuccess(salesSession);
    expect((await loadAuthenticatedSession())?.role).toBe("SALES");
  });

  it("redirects without calling auth/me or rendering protected children when no token exists", async () => {
    mockAuthSuccess();

    renderShell();

    await waitFor(() => {
      expect(navigationMock.replace).toHaveBeenCalledWith("/login");
    });

    expect(api.get).not.toHaveBeenCalled();
    expect(screen.queryByTestId("protected-child")).toBeNull();
    expect(screen.queryByRole("link", { name: "Usuarios" })).toBeNull();
  });

  it("withholds the shell and children while auth/me is pending", () => {
    const authRequest = deferred<{ data: AuthenticatedSession }>();
    window.localStorage.setItem("token", "valid-token");
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (String(url) === "/auth/me") {
        return authRequest.promise as never;
      }

      throw new Error(`Unexpected endpoint ${String(url)}`);
    });

    renderShell();

    expect(screen.getByRole("status").textContent).toContain(
      "Cargando sesión...",
    );
    expect(screen.queryByTestId("protected-child")).toBeNull();
    expect(screen.queryByRole("link", { name: "Usuarios" })).toBeNull();

    authRequest.resolve({ data: adminSession });
  });

  it("renders an ADMIN shell only after auth/me succeeds", async () => {
    window.localStorage.setItem("token", "valid-token");
    mockAuthSuccess();

    renderShell();

    expect(await screen.findByTestId("protected-child")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Usuarios" })).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith("/auth/me");
  });

  it("renders the role-aware SALES navigation after auth/me succeeds", async () => {
    window.localStorage.setItem("token", "valid-token");
    mockAuthSuccess(salesSession);

    renderShell();

    expect(await screen.findByTestId("protected-child")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ventas" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Usuarios" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Compras" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Equipos" })).toBeNull();
  });

  it("redirects on a structured 401 without rendering the protected child", async () => {
    window.localStorage.setItem("token", "expired-token");
    vi.mocked(api.get).mockRejectedValueOnce(axiosError(401));

    renderShell();

    await waitFor(() => {
      expect(navigationMock.replace).toHaveBeenCalledWith("/login");
    });

    expect(screen.queryByTestId("protected-child")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("preserves the session and does not redirect on a structured 403", async () => {
    window.localStorage.setItem("token", "valid-token");
    vi.mocked(api.get).mockRejectedValueOnce(axiosError(403));

    renderShell();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(navigationMock.replace).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("token")).toBe("valid-token");
    expect(screen.queryByTestId("protected-child")).toBeNull();
  });

  it("preserves the token on a network error and authenticates after an explicit retry", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("token", "valid-token");
    let requestCount = 0;
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (String(url) !== "/auth/me") {
        throw new Error(`Unexpected endpoint ${String(url)}`);
      }

      requestCount += 1;
      if (requestCount === 1) {
        throw new Error("Network unavailable");
      }

      return { data: adminSession } as never;
    });

    renderShell();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(window.localStorage.getItem("token")).toBe("valid-token");
    expect(navigationMock.replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("protected-child")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Reintentar" }));

    expect(await screen.findByTestId("protected-child")).toBeTruthy();
    expect(requestCount).toBe(2);
    expect(navigationMock.replace).not.toHaveBeenCalled();
  });

  it("preserves the token and blocks the shell on a structured 5xx", async () => {
    window.localStorage.setItem("token", "valid-token");
    vi.mocked(api.get).mockRejectedValueOnce(sensitiveAxiosLikeError(503));

    renderShell();

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(window.localStorage.getItem("token")).toBe("valid-token");
    expect(navigationMock.replace).not.toHaveBeenCalled();
    expect(screen.queryByTestId("protected-child")).toBeNull();

    const serializedConsoleArgs = JSON.stringify(consoleErrorSpy.mock.calls);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    expect(serializedConsoleArgs).not.toContain("SUPER_SECRET_JWT");
    expect(serializedConsoleArgs).not.toContain("SUPER_SECRET_PASSWORD");
    expect(serializedConsoleArgs).not.toContain(
      "SUPER_SECRET_CURRENT_PASSWORD",
    );
    expect(serializedConsoleArgs).not.toContain("SUPER_SECRET_NEW_PASSWORD");
    expect(serializedConsoleArgs).not.toContain("SUPER_SECRET_RESET_TOKEN");
    expect(serializedConsoleArgs).not.toContain("SUPER_SECRET_RESPONSE_SECRET");
  });

  it("does not fetch protected child data before auth bootstrap completes", async () => {
    const authRequest = deferred<{ data: AuthenticatedSession }>();
    let childRequestCount = 0;
    window.localStorage.setItem("token", "valid-token");
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (String(url) === "/auth/me") {
        return authRequest.promise as never;
      }

      if (String(url) === "/protected-child-data") {
        childRequestCount += 1;
        return { data: [] } as never;
      }

      throw new Error(`Unexpected endpoint ${String(url)}`);
    });

    function ProtectedChild() {
      useEffect(() => {
        void api.get("/protected-child-data");
      }, []);

      return <div data-testid="protected-child">Protected child</div>;
    }

    renderShell(<ProtectedChild />);

    expect(childRequestCount).toBe(0);
    expect(screen.queryByTestId("protected-child")).toBeNull();

    authRequest.resolve({ data: adminSession });

    expect(await screen.findByTestId("protected-child")).toBeTruthy();
    await waitFor(() => expect(childRequestCount).toBe(1));
  });

  it("does not flash ADMIN navigation while a SALES session is bootstrapping", async () => {
    const authRequest = deferred<{ data: AuthenticatedSession }>();
    window.localStorage.setItem("token", "valid-token");
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (String(url) === "/auth/me") {
        return authRequest.promise as never;
      }

      throw new Error(`Unexpected endpoint ${String(url)}`);
    });

    renderShell();

    expect(screen.queryByRole("link", { name: "Usuarios" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Compras" })).toBeNull();

    authRequest.resolve({ data: salesSession });

    expect(await screen.findByRole("link", { name: "Ventas" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Usuarios" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Compras" })).toBeNull();
  });
});
