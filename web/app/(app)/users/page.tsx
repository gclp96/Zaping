"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { useAuthenticatedSession } from "@/app/auth-session";
import ForbiddenState from "@/app/components/ui/ForbiddenState";
import { paginateRows, stableSort } from "@/app/client-table.utils";
import Badge from "@/app/components/ui/Badge";
import Button from "@/app/components/ui/Button";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";
import DataTable, {
  DataTableToolbar,
  RowActionsMenu,
  type DataTableColumn,
  type DataTableRowAction,
  type DataTableSelectFilter,
  type SortState,
} from "@/app/components/ui/DataTable";
import Input from "@/app/components/ui/Input";
import Loading from "@/app/components/ui/Loading";
import Modal from "@/app/components/ui/Modal";
import Select from "@/app/components/ui/Select";
import PageContainer from "@/app/components/ui/layout/PageContainer";
import PageHeader from "@/app/components/ui/layout/PageHeader";
import Section from "@/app/components/ui/layout/Section";
import { api } from "@/services/api";
import { getApiErrorMessage, isForbiddenError } from "@/services/errors";

import type {
  CreateUserPayload,
  UpdateUserPayload,
  User,
  UserRole,
} from "./types";
import {
  getUserFullName,
  getUserRoleLabel,
  userMatchesSearch,
  userRoleOptions,
} from "./user-display";

type StatusFilter = "ALL" | "ACTIVE" | "INACTIVE";
type RoleFilter = "ALL" | UserRole;
type FormMode = "create" | "edit";

type UserFormValues = {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole | "";
  canAdjustPurchaseUnitCost: boolean;
  password: string;
  confirmPassword: string;
};

type UserFormErrors = Partial<Record<keyof UserFormValues, string>>;

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const userCollator = new Intl.Collator("es-MX", {
  numeric: true,
  sensitivity: "base",
});

const initialFormValues: UserFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  role: "",
  canAdjustPurchaseUnitCost: false,
  password: "",
  confirmPassword: "",
};

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function compareUsers(first: User, second: User, columnId: string) {
  if (columnId === "user") {
    return userCollator.compare(
      getUserFullName(first),
      getUserFullName(second),
    );
  }

  if (columnId === "email") {
    return userCollator.compare(first.email, second.email);
  }

  if (columnId === "role") {
    return userCollator.compare(
      getUserRoleLabel(first.role),
      getUserRoleLabel(second.role),
    );
  }

  if (columnId === "status") {
    return Number(first.isActive) - Number(second.isActive);
  }

  return 0;
}

export default function UsersPage() {
  const sessionState = useAuthenticatedSession();
  const [users, setUsers] = useState<User[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sorting, setSorting] = useState<SortState>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formValues, setFormValues] =
    useState<UserFormValues>(initialFormValues);
  const [formErrors, setFormErrors] = useState<UserFormErrors>({});
  const [formApiError, setFormApiError] = useState("");
  const [saving, setSaving] = useState(false);
  const [userToDeactivate, setUserToDeactivate] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivationError, setDeactivationError] = useState("");
  const [reactivatingUserId, setReactivatingUserId] = useState<string | null>(
    null,
  );
  const [actionError, setActionError] = useState("");

  const currentUser =
    sessionState.status === "success" ? sessionState.user : null;
  const currentUserIsAdmin = currentUser?.role === "ADMIN";
  const sessionForbidsAccess =
    sessionState.status === "success" && !currentUserIsAdmin;

  async function loadUsers() {
    try {
      setPageLoading(true);
      setPageError("");
      setForbidden(false);

      const response = await api.get<User[]>("/users");
      setUsers(response.data);
      setPageIndex(0);
    } catch (error: unknown) {
      if (isForbiddenError(error)) {
        setForbidden(true);
        setUsers([]);
        return;
      }

      setPageError(
        getApiErrorMessage(error, "No fue posible cargar los usuarios."),
      );
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    if (sessionState.status === "loading") {
      return;
    }

    if (sessionState.status === "success" && currentUser?.role) {
      if (!currentUserIsAdmin) {
        return;
      }
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadUsers();
  }, [currentUser?.role, currentUserIsAdmin, sessionState.status]);

  function resetFilters() {
    setSearch("");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
    setPageIndex(0);
  }

  function resetForm() {
    setFormValues(initialFormValues);
    setFormErrors({});
    setFormApiError("");
  }

  function openCreateModal() {
    setFormMode("create");
    setEditingUser(null);
    resetForm();
    setFormOpen(true);
  }

  function openEditModal(user: User) {
    setFormMode("edit");
    setEditingUser(user);
    setFormValues({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role,
      canAdjustPurchaseUnitCost: Boolean(user.canAdjustPurchaseUnitCost),
      password: "",
      confirmPassword: "",
    });
    setFormErrors({});
    setFormApiError("");
    setFormOpen(true);
  }

  function closeFormModal() {
    if (saving) {
      return;
    }

    setFormOpen(false);
    setEditingUser(null);
    resetForm();
  }

  function updateFormValue(field: keyof UserFormValues, value: string) {
    setFormValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }));
    setFormErrors((currentErrors) => ({
      ...currentErrors,
      [field]: undefined,
    }));
    setFormApiError("");
  }

  function validateForm() {
    const nextErrors: UserFormErrors = {};
    const firstName = formValues.firstName.trim();
    const lastName = formValues.lastName.trim();
    const email = formValues.email.trim();

    if (!firstName) nextErrors.firstName = "El nombre es obligatorio.";
    if (!lastName) nextErrors.lastName = "El apellido es obligatorio.";
    if (!email) {
      nextErrors.email = "El email es obligatorio.";
    } else if (!isValidEmail(email)) {
      nextErrors.email = "Ingresa un email válido.";
    }
    if (!formValues.role) nextErrors.role = "Selecciona un rol.";

    if (formMode === "create") {
      if (!formValues.password) {
        nextErrors.password = "La contraseña inicial es obligatoria.";
      } else if (formValues.password.length < 8) {
        nextErrors.password = "La contraseña debe tener al menos 8 caracteres.";
      }

      if (formValues.confirmPassword !== formValues.password) {
        nextErrors.confirmPassword = "Las contraseñas no coinciden.";
      }
    }

    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmitUser() {
    if (saving || !validateForm()) {
      return;
    }

    try {
      setSaving(true);
      setFormApiError("");

      if (formMode === "create") {
        const payload: CreateUserPayload = {
          firstName: formValues.firstName.trim(),
          lastName: formValues.lastName.trim(),
          email: formValues.email.trim(),
          role: formValues.role as UserRole,
          canAdjustPurchaseUnitCost: formValues.role === 'WAREHOUSE' && formValues.canAdjustPurchaseUnitCost,
          password: formValues.password,
        };

        await api.post("/users", payload);
      } else if (editingUser) {
        const payload: UpdateUserPayload = {
          firstName: formValues.firstName.trim(),
          lastName: formValues.lastName.trim(),
          email: formValues.email.trim(),
          role: formValues.role as UserRole,
          canAdjustPurchaseUnitCost: formValues.role === 'WAREHOUSE' && formValues.canAdjustPurchaseUnitCost,
        };

        await api.patch(`/users/${editingUser.id}`, payload);
      }

      setFormOpen(false);
      setEditingUser(null);
      resetForm();
      await loadUsers();
    } catch (error: unknown) {
      setFormApiError(
        getApiErrorMessage(error, "No fue posible guardar el usuario."),
      );
    } finally {
      setSaving(false);
    }
  }

  function openDeactivateDialog(user: User) {
    setUserToDeactivate(user);
    setDeactivationError("");
  }

  function closeDeactivateDialog() {
    if (deactivating) {
      return;
    }

    setUserToDeactivate(null);
    setDeactivationError("");
  }

  async function handleDeactivateUser() {
    if (!userToDeactivate || deactivating) {
      return;
    }

    try {
      setDeactivating(true);
      setDeactivationError("");

      await api.patch(`/users/${userToDeactivate.id}`, {
        isActive: false,
      });
      await loadUsers();
      setUserToDeactivate(null);
    } catch (error: unknown) {
      setDeactivationError(
        getApiErrorMessage(error, "No fue posible desactivar el usuario."),
      );
    } finally {
      setDeactivating(false);
    }
  }

  async function handleReactivateUser(user: User) {
    if (reactivatingUserId) {
      return;
    }

    try {
      setReactivatingUserId(user.id);
      setActionError("");

      await api.patch(`/users/${user.id}`, {
        isActive: true,
      });
      await loadUsers();
    } catch (error: unknown) {
      setActionError(
        getApiErrorMessage(error, "No fue posible reactivar el usuario."),
      );
    } finally {
      setReactivatingUserId(null);
    }
  }

  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        if (!userMatchesSearch(user, search)) {
          return false;
        }

        if (roleFilter !== "ALL" && user.role !== roleFilter) {
          return false;
        }

        if (statusFilter === "ACTIVE" && !user.isActive) {
          return false;
        }

        if (statusFilter === "INACTIVE" && user.isActive) {
          return false;
        }

        return true;
      }),
    [roleFilter, search, statusFilter, users],
  );

  const sortedUsers = useMemo(() => {
    if (!sorting) {
      return filteredUsers;
    }

    return stableSort(
      filteredUsers,
      (first, second) => compareUsers(first, second, sorting.columnId),
      sorting.direction,
    );
  }, [filteredUsers, sorting]);

  const paginatedUsers = useMemo(
    () => paginateRows(sortedUsers, pageIndex, pageSize),
    [pageIndex, pageSize, sortedUsers],
  );

  const isFiltered = Boolean(
    search.trim() || roleFilter !== "ALL" || statusFilter !== "ALL",
  );
  const resetDisabled = !isFiltered;

  const userFilters: DataTableSelectFilter[] = [
    {
      id: "role",
      label: "Rol",
      value: roleFilter === "ALL" ? "" : roleFilter,
      options: userRoleOptions,
      placeholder: "Todos los roles",
      onChange: (value) => {
        setRoleFilter(value ? (value as UserRole) : "ALL");
        setPageIndex(0);
      },
    },
    {
      id: "status",
      label: "Estado",
      value: statusFilter === "ALL" ? "" : statusFilter,
      options: [
        { value: "ACTIVE", label: "Activos" },
        { value: "INACTIVE", label: "Inactivos" },
      ],
      placeholder: "Todos",
      onChange: (value) => {
        setStatusFilter(value ? (value as StatusFilter) : "ALL");
        setPageIndex(0);
      },
    },
  ];

  const userColumns: DataTableColumn<User>[] = [
    {
      id: "user",
      header: "Usuario",
      sortable: true,
      priority: "primary",
      minWidth: 120,
      cell: (user) => {
        const isCurrentUser = currentUser?.id === user.id;

        return (
          <div className="min-w-0 max-w-32 sm:max-w-none">
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-words font-medium text-text">
                {getUserFullName(user)}
              </span>
              {isCurrentUser ? <Badge color="blue">Tú</Badge> : null}
            </div>
            <span className="block break-all text-xs text-text-muted">
              {user.email}
            </span>
          </div>
        );
      },
    },
    {
      id: "email",
      header: "Email",
      sortable: true,
      priority: "secondary",
      minWidth: 220,
      cell: (user) => user.email,
    },
    {
      id: "role",
      header: "Rol",
      sortable: true,
      priority: "secondary",
      minWidth: 150,
      cell: (user) => getUserRoleLabel(user.role),
    },
    {
      id: "status",
      header: "Estado",
      sortable: true,
      priority: "primary",
      minWidth: 72,
      cell: (user) => (
        <Badge color={user.isActive ? "green" : "gray"}>
          {user.isActive ? "Activo" : "Inactivo"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Acciones",
      priority: "primary",
      align: "end",
      minWidth: 44,
      cell: (user) => {
        const actions: DataTableRowAction<User>[] = [
          {
            id: "edit",
            label: "Editar",
            onSelect: openEditModal,
          },
          user.isActive
            ? {
                id: "deactivate",
                label: "Desactivar",
                variant: "destructive",
                disabled: currentUser?.id === user.id,
                onSelect: openDeactivateDialog,
              }
            : {
                id: "reactivate",
                label:
                  reactivatingUserId === user.id
                    ? "Reactivando..."
                    : "Reactivar",
                disabled: reactivatingUserId === user.id,
                onSelect: (selectedUser) =>
                  void handleReactivateUser(selectedUser),
              },
        ];

        return (
          <RowActionsMenu
            row={user}
            label={`Acciones de usuario ${getUserFullName(user)}`}
            actions={actions}
          />
        );
      },
    },
  ];

  if (forbidden || sessionForbidsAccess) {
    return (
      <PageContainer>
        <PageHeader title="Usuarios" />
        <ForbiddenState />
      </PageContainer>
    );
  }

  return (
    <>
      <PageContainer>
        <PageHeader
          title="Usuarios"
          description="Administra el acceso del equipo a la operación."
          action={
            currentUserIsAdmin ? (
              <Button type="button" onClick={openCreateModal}>
                <Plus aria-hidden="true" size={18} />
                Nuevo usuario
              </Button>
            ) : null
          }
        />

        {actionError ? (
          <div
            role="alert"
            className="mb-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{actionError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActionError("")}
            >
              Cerrar mensaje
            </Button>
          </div>
        ) : null}

        {pageLoading ? (
          <Loading message="Cargando usuarios..." />
        ) : pageError ? (
          <Section>
            <div
              role="alert"
              className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 sm:flex-row sm:items-center sm:justify-between"
            >
              <span>{pageError}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadUsers()}
              >
                Reintentar
              </Button>
            </div>
          </Section>
        ) : (
          <Section>
            <DataTable
              caption="Administración de usuarios"
              rows={paginatedUsers}
              columns={userColumns}
              getRowId={(user) => user.id}
              sorting={{ state: sorting, onChange: setSorting }}
              toolbar={
                users.length > 0 ? (
                  <DataTableToolbar
                    search={{
                      value: search,
                      label: "Buscar usuarios",
                      placeholder: "Buscar usuarios...",
                      onChange: (value) => {
                        setSearch(value);
                        setPageIndex(0);
                      },
                    }}
                    filters={userFilters}
                    onReset={resetFilters}
                    resetDisabled={resetDisabled}
                  />
                ) : undefined
              }
              pagination={
                users.length > 0
                  ? {
                      pageIndex,
                      pageSize,
                      totalRows: sortedUsers.length,
                      pageSizeOptions: PAGE_SIZE_OPTIONS,
                      onPageChange: setPageIndex,
                      onPageSizeChange: (nextPageSize) => {
                        setPageSize(nextPageSize);
                        setPageIndex(0);
                      },
                    }
                  : undefined
              }
              emptyState={{
                title: "No hay usuarios registrados",
                description:
                  "Crea el primer usuario interno para administrar el acceso del equipo.",
              }}
              filteredEmptyState={{
                title: "Sin usuarios coincidentes",
                description:
                  "No encontramos usuarios con la búsqueda y filtros seleccionados.",
              }}
              isFiltered={isFiltered}
            />
          </Section>
        )}
      </PageContainer>

      <Modal
        isOpen={formOpen}
        title={formMode === "create" ? "Nuevo usuario" : "Editar usuario"}
        dismissible={!saving}
        onClose={closeFormModal}
      >
        <form
          noValidate
          autoComplete={formMode === "create" ? "off" : "on"}
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmitUser();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Nombre"
              value={formValues.firstName}
              required
              autoComplete={formMode === "create" ? "off" : "given-name"}
              error={formErrors.firstName}
              disabled={saving}
              onChange={(event) =>
                updateFormValue("firstName", event.target.value)
              }
            />
            <Input
              label="Apellido"
              value={formValues.lastName}
              required
              autoComplete={formMode === "create" ? "off" : "family-name"}
              error={formErrors.lastName}
              disabled={saving}
              onChange={(event) =>
                updateFormValue("lastName", event.target.value)
              }
            />
            <Input
              label="Email"
              type="email"
              value={formValues.email}
              required
              autoComplete={formMode === "create" ? "off" : "email"}
              error={formErrors.email}
              disabled={saving}
              onChange={(event) => updateFormValue("email", event.target.value)}
            />
            <Select
              label="Rol"
              value={formValues.role}
              options={userRoleOptions}
              required
              error={formErrors.role}
              disabled={saving}
              onChange={(event) => updateFormValue("role", event.target.value)}
            />
            {formValues.role === 'WAREHOUSE' ? (
              <label className="flex items-start gap-3 rounded-lg border border-border p-3 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={formValues.canAdjustPurchaseUnitCost}
                  disabled={saving}
                  onChange={(event) => setFormValues((values) => ({
                    ...values,
                    canAdjustPurchaseUnitCost: event.target.checked,
                  }))}
                />
                <span className="text-sm">
                  <span className="block font-medium text-text">Responsable de Compras: permitir ajustar costo unitario</span>
                  <span className="mt-1 block text-text-muted">Autorización individual para negociar precios en órdenes de compra. No permite aprobar ni cancelar órdenes.</span>
                </span>
              </label>
            ) : null}
            {formMode === "create" ? (
              <>
                <Input
                  label="Contraseña inicial"
                  type="password"
                  value={formValues.password}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  helperText="Define una contraseña inicial para el usuario."
                  error={formErrors.password}
                  disabled={saving}
                  onChange={(event) =>
                    updateFormValue("password", event.target.value)
                  }
                />
                <Input
                  label="Confirmar contraseña"
                  type="password"
                  value={formValues.confirmPassword}
                  required
                  autoComplete="new-password"
                  error={formErrors.confirmPassword}
                  disabled={saving}
                  onChange={(event) =>
                    updateFormValue("confirmPassword", event.target.value)
                  }
                />
              </>
            ) : null}
          </div>

          {formMode === "create" ? (
            <p className="text-sm text-text-muted">
              Comparte la contraseña inicial de forma segura. No se enviará por
              correo automáticamente.
            </p>
          ) : null}

          {formApiError ? (
            <p role="alert" className="text-sm text-red-700">
              {formApiError}
            </p>
          ) : null}

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={closeFormModal}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={saving} loadingText="Guardando...">
              {formMode === "create" ? "Crear usuario" : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={userToDeactivate !== null}
        title="Desactivar usuario"
        message={
          <div className="space-y-3">
            <p>
              ¿Desactivar a{" "}
              <span className="font-semibold text-gray-900">
                {userToDeactivate ? getUserFullName(userToDeactivate) : ""}
              </span>
              ?
            </p>
            <p className="text-sm text-gray-600">
              El usuario no podrá autenticarse y perderá acceso inmediatamente,
              incluso si tenía una sesión previa.
            </p>
            {deactivationError ? (
              <p role="alert" className="text-sm text-red-700">
                {deactivationError}
              </p>
            ) : null}
          </div>
        }
        confirmText="Desactivar"
        loadingText="Desactivando..."
        confirmVariant="danger"
        loading={deactivating}
        onClose={closeDeactivateDialog}
        onConfirm={() => void handleDeactivateUser()}
      />
    </>
  );
}
