import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearAuthenticatedSessionCache,
  type AuthenticatedSession,
} from "@/app/auth-session";
import { api } from "@/services/api";

import UsersPage from "./page";
import type { User, UserRole } from "./types";

vi.mock("@/services/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

const adminSession: AuthenticatedSession = {
  id: "admin-1",
  companyId: "company-1",
  email: "ana@zaping.test",
  firstName: "Ana",
  lastName: "Admin",
  role: "ADMIN",
  companyTimezone: "America/Hermosillo",
  companyName: 'QA Company',
};

const users: User[] = [
  {
    id: "admin-1",
    companyId: "company-1",
    email: "ana@zaping.test",
    firstName: "Ana",
    lastName: "Admin",
    role: "ADMIN",
    isActive: true,
    createdAt: "2026-08-30T10:00:00.000Z",
    updatedAt: "2026-08-30T10:00:00.000Z",
  },
  {
    id: "manager-1",
    companyId: "company-1",
    email: "mario@zaping.test",
    firstName: "Mario",
    lastName: "Gerente",
    role: "MANAGER",
    isActive: true,
    createdAt: "2026-08-30T10:00:00.000Z",
    updatedAt: "2026-08-30T10:00:00.000Z",
  },
  {
    id: "sales-1",
    companyId: "company-1",
    email: "sofia@zaping.test",
    firstName: "Sofia",
    lastName: "Ventas",
    role: "SALES",
    isActive: false,
    createdAt: "2026-08-30T10:00:00.000Z",
    updatedAt: "2026-08-30T10:00:00.000Z",
  },
  {
    id: "warehouse-1",
    companyId: "company-1",
    email: "walter@zaping.test",
    firstName: "Walter",
    lastName: "Almacen",
    role: "WAREHOUSE",
    isActive: true,
    createdAt: "2026-08-30T10:00:00.000Z",
    updatedAt: "2026-08-30T10:00:00.000Z",
  },
];

function forbiddenError() {
  return {
    isAxiosError: true,
    response: {
      status: 403,
      data: { message: "Forbidden resource" },
    },
  };
}

function apiError(message: string) {
  return {
    isAxiosError: true,
    message,
    response: {
      status: 400,
      data: { message },
    },
  };
}

function configureApiMocks({
  session = adminSession,
  usersData = users,
  usersError = null,
}: {
  session?: AuthenticatedSession;
  usersData?: User[];
  usersError?: unknown;
} = {}) {
  let currentUsers = [...usersData];

  vi.mocked(api.get).mockImplementation(async (url) => {
    const endpoint = String(url);

    if (endpoint === "/auth/me") {
      return { data: session } as never;
    }

    if (endpoint === "/users") {
      if (usersError) {
        throw usersError;
      }

      return { data: currentUsers } as never;
    }

    return { data: [] } as never;
  });

  vi.mocked(api.post).mockImplementation(async (_url, payload) => {
    const body = payload as {
      firstName: string;
      lastName: string;
      email: string;
      role: UserRole;
    };
    const createdUser: User = {
      id: "created-user",
      companyId: "company-1",
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      role: body.role,
      isActive: true,
      createdAt: "2026-08-31T10:00:00.000Z",
      updatedAt: "2026-08-31T10:00:00.000Z",
    };

    currentUsers = [...currentUsers, createdUser];

    return { data: createdUser } as never;
  });

  vi.mocked(api.patch).mockImplementation(async (url, payload) => {
    const endpoint = String(url);
    const userId = endpoint.split("/").at(-1);
    const body = payload as Partial<User>;

    currentUsers = currentUsers.map((user) =>
      user.id === userId ? { ...user, ...body } : user,
    );

    return {
      data: currentUsers.find((user) => user.id === userId),
    } as never;
  });
}

async function renderUsersPage() {
  render(<UsersPage />);
  await screen.findByText("Ana Admin");
}

async function openActionsMenu(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  const row = screen.getByText(name).closest("tr");
  expect(row).toBeTruthy();

  await user.click(
    within(row as HTMLTableRowElement).getByRole("button", {
      name: `Acciones de usuario ${name}`,
    }),
  );
}

function getDialog() {
  return screen.getByRole("dialog");
}

async function fillCreateForm(
  user: ReturnType<typeof userEvent.setup>,
  role: UserRole = "SALES",
) {
  const dialog = getDialog();

  await user.type(
    within(dialog).getByRole("textbox", { name: "Nombre" }),
    "Laura",
  );
  await user.type(
    within(dialog).getByRole("textbox", { name: "Apellido" }),
    "Ventas",
  );
  await user.type(
    within(dialog).getByRole("textbox", { name: "Email" }),
    "laura@zaping.test",
  );
  await user.selectOptions(
    within(dialog).getByRole("combobox", { name: "Rol" }),
    role,
  );
  await user.type(
    within(dialog).getByLabelText(/Contraseña inicial/),
    "secure-password",
  );
  await user.type(
    within(dialog).getByLabelText(/Confirmar contraseña/),
    "secure-password",
  );
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  clearAuthenticatedSessionCache();
  configureApiMocks();
  consoleErrorSpy = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  cleanup();
  clearAuthenticatedSessionCache();
});

describe("UsersPage", () => {
  it("loads users for ADMIN and renders only safe user fields", async () => {
    await renderUsersPage();

    expect(api.get).toHaveBeenCalledWith("/auth/me");
    expect(api.get).toHaveBeenCalledWith("/users");
    expect(screen.getByText("Usuarios")).toBeTruthy();
    expect(screen.getAllByText("Administrador").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Activo").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Inactivo").length).toBeGreaterThan(0);
    expect(screen.queryByText("company-1")).toBeNull();
    expect(screen.queryByText("passwordHash")).toBeNull();
  });

  it("searches by full name and email", async () => {
    const user = userEvent.setup();

    await renderUsersPage();
    const search = screen.getByRole("searchbox", {
      name: "Buscar usuarios",
    });

    await user.type(search, "Mario Gerente");
    expect(screen.getByText("Mario Gerente")).toBeTruthy();
    expect(screen.queryByText("Sofia Ventas")).toBeNull();

    await user.clear(search);
    await user.type(search, "sofia@zaping.test");
    expect(screen.getByText("Sofia Ventas")).toBeTruthy();
    expect(screen.queryByText("Mario Gerente")).toBeNull();
  });

  it("filters by role, status, combined filters, and clears filters", async () => {
    const user = userEvent.setup();

    await renderUsersPage();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Rol" }),
      "SALES",
    );
    expect(screen.getByText("Sofia Ventas")).toBeTruthy();
    expect(screen.queryByText("Mario Gerente")).toBeNull();

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Estado" }),
      "INACTIVE",
    );
    expect(screen.getByText("Sofia Ventas")).toBeTruthy();

    await user.type(
      screen.getByRole("searchbox", { name: "Buscar usuarios" }),
      "sin resultado",
    );
    expect(await screen.findByText("Sin usuarios coincidentes")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(screen.getByText("Ana Admin")).toBeTruthy();
    expect(screen.getByText("Walter Almacen")).toBeTruthy();
  });

  it("sorts and paginates with the shared DataTable controls", async () => {
    const user = userEvent.setup();

    await renderUsersPage();
    await user.click(screen.getByRole("button", { name: "Usuario" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Filas por página" }),
      "10",
    );

    expect(
      screen.getByRole("navigation", { name: "Paginación de tabla" }),
    ).toBeTruthy();
  });

  it("keeps Users table primary columns visible and secondary columns responsive", async () => {
    await renderUsersPage();

    const userHeader = screen.getByRole("columnheader", { name: "Usuario" });
    const statusHeader = screen.getByRole("columnheader", { name: "Estado" });
    const actionsHeader = screen.getByRole("columnheader", {
      name: "Acciones",
    });
    const emailHeader = screen.getByRole("columnheader", { name: "Email" });
    const roleHeader = screen.getByRole("columnheader", { name: "Rol" });

    expect(userHeader.classList.contains("hidden")).toBe(false);
    expect(statusHeader.classList.contains("hidden")).toBe(false);
    expect(actionsHeader.classList.contains("hidden")).toBe(false);
    expect(userHeader.style.minWidth).toBe("120px");
    expect(statusHeader.style.minWidth).toBe("72px");
    expect(actionsHeader.style.minWidth).toBe("44px");
    expect(emailHeader.classList.contains("hidden")).toBe(true);
    expect(emailHeader.classList.contains("sm:table-cell")).toBe(true);
    expect(roleHeader.classList.contains("hidden")).toBe(true);
    expect(roleHeader.classList.contains("sm:table-cell")).toBe(true);
  });

  it("shows loading, generic API error with retry, and empty states", async () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => undefined));
    const loadingRender = render(<UsersPage />);
    expect(screen.getByText("Cargando usuarios...")).toBeTruthy();
    loadingRender.unmount();

    cleanup();
    clearAuthenticatedSessionCache();
    configureApiMocks({ usersError: apiError("API unavailable") });
    render(<UsersPage />);
    expect(await screen.findByText("API unavailable")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(api.get).toHaveBeenCalledWith("/users");

    cleanup();
    clearAuthenticatedSessionCache();
    configureApiMocks({ usersData: [] });
    render(<UsersPage />);
    expect(await screen.findByText("No hay usuarios registrados")).toBeTruthy();
  });

  it("shows Sin permisos on direct 403 access without table or new user action", async () => {
    configureApiMocks({ usersError: forbiddenError() });

    render(<UsersPage />);

    expect(await screen.findByText("Sin permisos")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Nuevo usuario" })).toBeNull();
  });

  it("opens create modal and validates required fields, short password, and mismatch", async () => {
    const user = userEvent.setup();

    await renderUsersPage();
    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));
    const dialog = getDialog();

    expect(within(dialog).getByText("El nombre es obligatorio.")).toBeTruthy();
    expect(
      within(dialog).getByText("El apellido es obligatorio."),
    ).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/Contraseña inicial/), {
      target: { value: "1234567" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Confirmar contraseña/), {
      target: { value: "7654321" },
    });
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(
      within(dialog).getByText(
        "La contraseña debe tener al menos 8 caracteres.",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("Las contraseñas no coinciden."),
    ).toBeTruthy();
  });

  it("opens create modal with empty values and new-password semantics", async () => {
    const user = userEvent.setup();

    await renderUsersPage();
    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));

    const dialog = getDialog();
    const firstNameInput = within(dialog).getByRole("textbox", {
      name: "Nombre",
    }) as HTMLInputElement;
    const lastNameInput = within(dialog).getByRole("textbox", {
      name: "Apellido",
    }) as HTMLInputElement;
    const emailInput = within(dialog).getByRole("textbox", {
      name: "Email",
    }) as HTMLInputElement;
    const roleSelect = within(dialog).getByRole("combobox", {
      name: "Rol",
    }) as HTMLSelectElement;
    const passwordInput = within(dialog).getByLabelText(
      /Contraseña inicial/,
    ) as HTMLInputElement;
    const confirmPasswordInput = within(dialog).getByLabelText(
      /Confirmar contraseña/,
    ) as HTMLInputElement;

    expect(firstNameInput.value).toBe("");
    expect(lastNameInput.value).toBe("");
    expect(emailInput.value).toBe("");
    expect(roleSelect.value).toBe("");
    expect(passwordInput.value).toBe("");
    expect(confirmPasswordInput.value).toBe("");
    expect(firstNameInput.autocomplete).toBe("off");
    expect(lastNameInput.autocomplete).toBe("off");
    expect(emailInput.autocomplete).toBe("off");
    expect(passwordInput.autocomplete).toBe("new-password");
    expect(confirmPasswordInput.autocomplete).toBe("new-password");
  });

  it("resets create form values after closing and reopening the modal", async () => {
    const user = userEvent.setup();

    await renderUsersPage();
    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    await fillCreateForm(user, "ADMIN");
    await user.click(
      within(getDialog()).getByRole("button", { name: "Cancelar" }),
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));

    const dialog = getDialog();
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: "Nombre",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: "Apellido",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: "Email",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(
      (
        within(dialog).getByRole("combobox", {
          name: "Rol",
        }) as HTMLSelectElement
      ).value,
    ).toBe("");
    expect(
      (within(dialog).getByLabelText(/Contraseña inicial/) as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      (within(dialog).getByLabelText(/Confirmar contraseña/) as HTMLInputElement)
        .value,
    ).toBe("");
  });

  it("creates a user with the approved payload and refetches users", async () => {
    const user = userEvent.setup();

    await renderUsersPage();
    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    await fillCreateForm(user, "MANAGER");
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/users", {
        firstName: "Laura",
        lastName: "Ventas",
        email: "laura@zaping.test",
        role: "MANAGER",
        canAdjustPurchaseUnitCost: false,
        password: "secure-password",
      });
    });
    expect(api.post).not.toHaveBeenCalledWith(
      "/users",
      expect.objectContaining({
        companyId: expect.any(String),
        confirmPassword: expect.any(String),
      }),
    );
    expect(await screen.findByText("Laura Ventas")).toBeTruthy();
  });

  it("shows create API errors inside the modal", async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValueOnce(
      apiError("Ya existe un usuario con ese correo"),
    );

    await renderUsersPage();
    await user.click(screen.getByRole("button", { name: "Nuevo usuario" }));
    await fillCreateForm(user);
    await user.click(screen.getByRole("button", { name: "Crear usuario" }));

    expect(
      await screen.findByText("Ya existe un usuario con ese correo"),
    ).toBeTruthy();
  });

  it("edits a user without password fields and sends only allowed values", async () => {
    const user = userEvent.setup();

    await renderUsersPage();
    await openActionsMenu(user, "Mario Gerente");
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));

    expect(
      screen.getByRole("heading", { name: "Editar usuario" }),
    ).toBeTruthy();
    const dialog = getDialog();
    expect(within(dialog).queryByLabelText(/Contraseña inicial/)).toBeNull();
    expect(within(dialog).queryByLabelText(/Confirmar contraseña/)).toBeNull();

    const nameInput = within(dialog).getByRole("textbox", { name: "Nombre" });
    await user.clear(nameInput);
    await user.type(nameInput, "Marco");
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: "Rol" }),
      "WAREHOUSE",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Guardar cambios" }),
    );

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/users/manager-1", {
        firstName: "Marco",
        lastName: "Gerente",
        email: "mario@zaping.test",
        role: "WAREHOUSE",
        canAdjustPurchaseUnitCost: false,
      });
    });
    expect(await screen.findByText("Marco Gerente")).toBeTruthy();
  });

  it("allows an ADMIN to delegate purchase cost editing to a warehouse buyer", async () => {
    const user = userEvent.setup();
    await renderUsersPage();
    await openActionsMenu(user, "Walter Almacen");
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
    const dialog = getDialog();
    const control = within(dialog).getByRole("checkbox", { name: /Responsable de Compras: permitir ajustar costo unitario/i });
    expect((control as HTMLInputElement).checked).toBe(false);
    await user.click(control);
    await user.click(within(dialog).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/users/warehouse-1", expect.objectContaining({
        role: "WAREHOUSE",
        canAdjustPurchaseUnitCost: true,
      }));
    });
  });

  it("shows edit API errors without closing the modal", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockRejectedValueOnce(apiError("Update failed"));

    await renderUsersPage();
    await openActionsMenu(user, "Mario Gerente");
    await user.click(screen.getByRole("menuitem", { name: "Editar" }));
    await user.click(
      within(getDialog()).getByRole("button", { name: "Guardar cambios" }),
    );

    expect(await screen.findByText("Update failed")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Editar usuario" }),
    ).toBeTruthy();
  });

  it("deactivates through confirmation and supports cancellation", async () => {
    const user = userEvent.setup();

    await renderUsersPage();
    await openActionsMenu(user, "Mario Gerente");
    await user.click(
      screen.getByRole("menuitem", {
        name: "Acción destructiva: Desactivar",
      }),
    );
    expect(
      screen.getByRole("heading", { name: "Desactivar usuario" }),
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(api.patch).not.toHaveBeenCalled();

    await openActionsMenu(user, "Mario Gerente");
    await user.click(
      screen.getByRole("menuitem", {
        name: "Acción destructiva: Desactivar",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Desactivar" }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/users/manager-1", {
        isActive: false,
      });
    });
  });

  it("shows last-admin and self-deactivation backend errors", async () => {
    const user = userEvent.setup();
    vi.mocked(api.patch).mockRejectedValueOnce(
      apiError("La empresa debe conservar al menos un ADMIN activo"),
    );

    await renderUsersPage();
    await openActionsMenu(user, "Mario Gerente");
    await user.click(
      screen.getByRole("menuitem", {
        name: "Acción destructiva: Desactivar",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Desactivar" }));

    expect(
      await screen.findByText(
        "La empresa debe conservar al menos un ADMIN activo",
      ),
    ).toBeTruthy();

    vi.mocked(api.patch).mockRejectedValueOnce(
      apiError("No puedes desactivar tu propio usuario"),
    );
    await user.click(screen.getByRole("button", { name: "Desactivar" }));

    expect(
      await screen.findByText("No puedes desactivar tu propio usuario"),
    ).toBeTruthy();
  });

  it("reactivates inactive users and shows backend errors", async () => {
    const user = userEvent.setup();

    await renderUsersPage();
    await openActionsMenu(user, "Sofia Ventas");
    await user.click(screen.getByRole("menuitem", { name: "Reactivar" }));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith("/users/sales-1", {
        isActive: true,
      });
    });

    cleanup();
    clearAuthenticatedSessionCache();
    configureApiMocks();
    render(<UsersPage />);
    await screen.findByText("Sofia Ventas");

    vi.mocked(api.patch).mockRejectedValueOnce(apiError("Reactivation failed"));
    await openActionsMenu(user, "Sofia Ventas");
    await user.click(screen.getByRole("menuitem", { name: "Reactivar" }));

    expect(await screen.findByText("Reactivation failed")).toBeTruthy();
  });

  it("marks the current user row and disables self-deactivation in the menu", async () => {
    const user = userEvent.setup();

    await renderUsersPage();
    expect(screen.getByText("Tú")).toBeTruthy();

    await openActionsMenu(user, "Ana Admin");
    expect(
      (
        screen.getByRole("menuitem", {
          name: "Acción destructiva: Desactivar",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
