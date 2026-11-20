'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';

import { useAuthenticatedSession } from '@/app/auth-session';
import {
  canManageSuppliers,
  hasRole,
  WAREHOUSE_ROLES,
} from '@/app/erp-role-access';
import Button from '@/app/components/ui/Button';
import ConfirmDialog from '@/app/components/ui/ConfirmDialog';
import DataTable, {
  DataTableToolbar,
  type DataTableColumn,
  type SortState,
} from '@/app/components/ui/DataTable';
import Input from '@/app/components/ui/Input';
import Loading from '@/app/components/ui/Loading';
import Modal from '@/app/components/ui/Modal';
import PageContainer from '@/app/components/ui/layout/PageContainer';
import PageHeader from '@/app/components/ui/layout/PageHeader';
import Section from '@/app/components/ui/layout/Section';
import ForbiddenState from '@/app/components/ui/ForbiddenState';
import { paginateRows, stableSort } from '@/app/client-table.utils';
import { api } from '@/services/api';
import { getApiErrorMessage, isForbiddenError } from '@/services/errors';

type Supplier = {
  id: string;
  name: string;
  legalName?: string | null;
  rfc?: string | null;
  fiscalAddress?: string | null;
  supplierCode?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  contactName?: string | null;
  notes?: string | null;
};

type SupplierFormErrors = {
  name?: string;
  email?: string;
  rfc?: string;
};

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

const supplierCollator = new Intl.Collator('es-MX', {
  numeric: true,
  sensitivity: 'base',
});

function normalizeOptionalValue(value: string): string | undefined {
  const trimmedValue = value.trim();
  return trimmedValue || undefined;
}

function supplierMatchesSearch(supplier: Supplier, search: string): boolean {
  const normalizedSearch = search.trim().toLocaleLowerCase('es-MX');

  if (!normalizedSearch) {
    return true;
  }

  return [
    supplier.name,
    supplier.legalName,
    supplier.rfc,
    supplier.supplierCode,
    supplier.fiscalAddress,
    supplier.contactName,
    supplier.email,
    supplier.phone,
    supplier.address,
  ].some((value) =>
    value?.toLocaleLowerCase('es-MX').includes(normalizedSearch),
  );
}

function compareSuppliers(
  first: Supplier,
  second: Supplier,
  columnId: string,
) {
  const firstValue =
    columnId === 'name'
      ? first.name
      : columnId === 'contactName'
        ? first.contactName || ''
        : columnId === 'email'
          ? first.email || ''
          : columnId === 'phone'
            ? first.phone || ''
            : '';
  const secondValue =
    columnId === 'name'
      ? second.name
      : columnId === 'contactName'
        ? second.contactName || ''
        : columnId === 'email'
          ? second.email || ''
          : columnId === 'phone'
            ? second.phone || ''
            : '';

  return supplierCollator.compare(firstValue, secondValue);
}

export default function SuppliersPage() {
  const sessionState = useAuthenticatedSession();
  const currentUserRole =
    sessionState.status === 'success'
      ? sessionState.user?.role ?? null
      : null;
  const canWrite = canManageSuppliers(currentUserRole);
  const sessionForbidsAccess = Boolean(
    sessionState.status === 'success' &&
      currentUserRole &&
      !hasRole(currentUserRole, WAREHOUSE_ROLES),
  );
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formErrors, setFormErrors] = useState<SupplierFormErrors>({});
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [rfc, setRfc] = useState('');
  const [fiscalAddress, setFiscalAddress] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [contactName, setContactName] = useState('');
  const [notes, setNotes] = useState('');
  const [supplierToDeactivate, setSupplierToDeactivate] =
    useState<Supplier | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivationError, setDeactivationError] = useState('');
  const [sorting, setSorting] = useState<SortState>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const filteredSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplierMatchesSearch(supplier, search)),
    [search, suppliers],
  );

  async function loadSuppliers() {
    try {
      setPageLoading(true);
      setPageError('');

      const response = await api.get<Supplier[]>('/suppliers');
      setSuppliers(response.data);
      setPageIndex(0);
    } catch (error: unknown) {
      if (isForbiddenError(error)) {
        setForbidden(true);
        setSuppliers([]);
        return;
      }
      setPageError(
        getApiErrorMessage(error, 'No fue posible cargar los proveedores.'),
      );
    } finally {
      setPageLoading(false);
    }
  }

  useEffect(() => {
    if (sessionState.status === 'loading') {
      return;
    }

    if (
      sessionState.status === 'success' &&
      currentUserRole &&
      !hasRole(currentUserRole, WAREHOUSE_ROLES)
    ) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSuppliers();
  }, [currentUserRole, sessionState.status]);

  function resetSupplierForm() {
    setName('');
    setLegalName('');
    setRfc('');
    setFiscalAddress('');
    setSupplierCode('');
    setEmail('');
    setPhone('');
    setAddress('');
    setContactName('');
    setNotes('');
    setFormErrors({});
    setFormError('');
  }

  function openCreateModal() {
    setEditingSupplier(null);
    resetSupplierForm();
    setFormOpen(true);
  }

  function openEditModal(supplier: Supplier) {
    setEditingSupplier(supplier);
    setName(supplier.name);
    setLegalName(supplier.legalName || '');
    setRfc(supplier.rfc || '');
    setFiscalAddress(supplier.fiscalAddress || '');
    setSupplierCode(supplier.supplierCode || '');
    setEmail(supplier.email || '');
    setPhone(supplier.phone || '');
    setAddress(supplier.address || '');
    setContactName(supplier.contactName || '');
    setNotes(supplier.notes || '');
    setFormErrors({});
    setFormError('');
    setFormOpen(true);
  }

  function closeSupplierForm() {
    if (saving) {
      return;
    }

    setFormOpen(false);
    setEditingSupplier(null);
    resetSupplierForm();
  }

  async function handleSaveSupplier() {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const normalizedRfc = rfc.trim().toUpperCase();
    const nextErrors: SupplierFormErrors = {};

    setFormError('');

    if (!trimmedName) {
      nextErrors.name = 'El nombre del proveedor es obligatorio.';
    }

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'Ingresa un correo electrónico válido.';
    }

    if (normalizedRfc && !/^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(normalizedRfc)) {
      nextErrors.rfc = 'Ingresa un RFC válido de 12 o 13 caracteres.';
    }

    setFormErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    const payload = {
      name: trimmedName,
      ...((normalizeOptionalValue(legalName) ?? null) !==
        (editingSupplier?.legalName ?? null) && {
        legalName: normalizeOptionalValue(legalName) ?? null,
      }),
      ...((normalizedRfc || null) !== (editingSupplier?.rfc ?? null) && {
        rfc: normalizedRfc || null,
      }),
      ...((normalizeOptionalValue(fiscalAddress) ?? null) !==
        (editingSupplier?.fiscalAddress ?? null) && {
        fiscalAddress: normalizeOptionalValue(fiscalAddress) ?? null,
      }),
      ...(editingSupplier &&
        normalizeOptionalValue(supplierCode) !==
          (editingSupplier.supplierCode ?? undefined) && {
          supplierCode: normalizeOptionalValue(supplierCode) ?? null,
        }),
      email: normalizeOptionalValue(email),
      phone: normalizeOptionalValue(phone),
      address: normalizeOptionalValue(address),
      contactName: normalizeOptionalValue(contactName),
      notes: normalizeOptionalValue(notes),
    };

    try {
      setSaving(true);

      if (editingSupplier) {
        await api.patch(`/suppliers/${editingSupplier.id}`, payload);
      } else {
        await api.post('/suppliers', payload);
      }

      await loadSuppliers();
      setFormOpen(false);
      setEditingSupplier(null);
      resetSupplierForm();
    } catch (error: unknown) {
      setFormError(
        getApiErrorMessage(
          error,
          editingSupplier
            ? 'No fue posible actualizar el proveedor.'
            : 'No fue posible registrar el proveedor.',
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  function openDeactivateDialog(supplier: Supplier) {
    setSupplierToDeactivate(supplier);
    setDeactivationError('');
  }

  function closeDeactivateDialog() {
    if (deactivating) {
      return;
    }

    setSupplierToDeactivate(null);
    setDeactivationError('');
  }

  async function handleDeactivateSupplier() {
    if (!supplierToDeactivate || deactivating) {
      return;
    }

    try {
      setDeactivating(true);
      setDeactivationError('');

      await api.delete(`/suppliers/${supplierToDeactivate.id}`);
      await loadSuppliers();

      setSupplierToDeactivate(null);
    } catch (error: unknown) {
      setDeactivationError(
        getApiErrorMessage(error, 'No fue posible desactivar el proveedor.'),
      );
    } finally {
      setDeactivating(false);
    }
  }

  const isFiltered = Boolean(search.trim());

  const sortedSuppliers = useMemo(() => {
    if (!sorting) {
      return filteredSuppliers;
    }

    return stableSort(
      filteredSuppliers,
      (first, second) =>
        compareSuppliers(first, second, sorting.columnId),
      sorting.direction,
    );
  }, [filteredSuppliers, sorting]);

  const paginatedSuppliers = useMemo(() => {
    return paginateRows(sortedSuppliers, pageIndex, pageSize);
  }, [pageIndex, pageSize, sortedSuppliers]);

  const supplierColumns: DataTableColumn<Supplier>[] = [
    {
      id: 'name',
      header: 'Proveedor',
      cell: (supplier) => supplier.name,
      sortable: true,
      priority: 'primary',
      minWidth: 190,
    },
    {
      id: 'contactName',
      header: 'Contacto',
      cell: (supplier) => supplier.contactName || 'Sin contacto',
      sortable: true,
      priority: 'secondary',
      minWidth: 170,
    },
    {
      id: 'email',
      header: 'Email',
      cell: (supplier) => supplier.email || 'Sin email',
      sortable: true,
      priority: 'secondary',
      minWidth: 220,
    },
    {
      id: 'phone',
      header: 'Teléfono',
      cell: (supplier) => supplier.phone || 'Sin teléfono',
      sortable: true,
      priority: 'tertiary',
      minWidth: 150,
    },
    {
      id: 'address',
      header: 'Dirección',
      cell: (supplier) => supplier.address || 'Sin dirección',
      priority: 'tertiary',
      minWidth: 220,
    },
  ];

  return (
    <>
      <PageContainer>
        <PageHeader
          title="Proveedores"
          description="Administra los proveedores disponibles para nuevas compras."
          action={canWrite ? (
            <Button type="button" onClick={openCreateModal}>
              <Plus aria-hidden="true" size={18} />
              Nuevo proveedor
            </Button>
          ) : undefined}
        />

        {forbidden || sessionForbidsAccess ? (
          <ForbiddenState />
        ) : pageLoading ? (
          <Loading message="Cargando proveedores..." />
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
                onClick={() => void loadSuppliers()}
              >
                Reintentar
              </Button>
            </div>
          </Section>
        ) : (
          <Section>
            <DataTable
              caption="Catálogo de proveedores"
              rows={paginatedSuppliers}
              columns={supplierColumns}
              getRowId={(supplier) => supplier.id}
              sorting={{
                state: sorting,
                onChange: setSorting,
              }}
              toolbar={
                suppliers.length > 0 ? (
                  <DataTableToolbar
                    search={{
                      value: search,
                      label: 'Buscar proveedores',
                      placeholder: 'Nombre, contacto, email, teléfono o dirección',
                      onChange: (value) => {
                        setSearch(value);
                        setPageIndex(0);
                      },
                    }}
                    actions={
                      isFiltered ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearch('');
                            setPageIndex(0);
                          }}
                        >
                          Limpiar búsqueda
                        </Button>
                      ) : null
                    }
                  />
                ) : undefined
              }
              pagination={
                suppliers.length > 0
                  ? {
                      pageIndex,
                      pageSize,
                      totalRows: sortedSuppliers.length,
                      pageSizeOptions: PAGE_SIZE_OPTIONS,
                      onPageChange: setPageIndex,
                      onPageSizeChange: (nextPageSize) => {
                        setPageSize(nextPageSize);
                        setPageIndex(0);
                      },
                    }
                  : undefined
              }
              rowActions={canWrite ? {
                label: (supplier) => `Acciones del proveedor ${supplier.name}`,
                actions: [
                  {
                    id: 'edit',
                    label: 'Editar',
                    onSelect: openEditModal,
                  },
                  {
                    id: 'deactivate',
                    label: 'Desactivar',
                    variant: 'destructive',
                    onSelect: openDeactivateDialog,
                  },
                ],
              } : undefined}
              emptyState={{
                title: 'Sin proveedores activos',
                description: 'Registra un proveedor para comenzar a usarlo en compras.',
              }}
              filteredEmptyState={{
                title: 'Sin proveedores coincidentes',
                description: 'No encontramos proveedores con esa búsqueda.',
              }}
              isFiltered={isFiltered}
            />
          </Section>
        )}
      </PageContainer>

      <Modal
        isOpen={formOpen}
        onClose={closeSupplierForm}
        title={editingSupplier ? 'Editar proveedor' : 'Nuevo proveedor'}
      >
        <form
          aria-label={editingSupplier ? 'Editar proveedor' : 'Nuevo proveedor'}
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSaveSupplier();
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Nombre"
              value={name}
              required
              disabled={saving}
              error={formErrors.name}
              onChange={(event) => {
                setName(event.target.value);
                setFormErrors((current) => ({ ...current, name: undefined }));
              }}
            />
            <Input
              label="Razón social"
              value={legalName}
              disabled={saving}
              onChange={(event) => setLegalName(event.target.value)}
            />
            <Input
              label="RFC"
              value={rfc}
              disabled={saving}
              error={formErrors.rfc}
              onChange={(event) => {
                setRfc(event.target.value.toUpperCase());
                setFormErrors((current) => ({ ...current, rfc: undefined }));
              }}
            />
            <Input
              label="Código de proveedor"
              value={editingSupplier ? supplierCode : 'Automático al registrar'}
              disabled={saving || !editingSupplier}
              inputMode="numeric"
              maxLength={12}
              helperText={
                editingSupplier
                  ? 'Para reemplazar un código anterior, escribe una clave de 4 a 12 dígitos.'
                  : 'Consecutivo por empresa: 0001, 0002, 0003...'
              }
              onChange={(event) => setSupplierCode(event.target.value)}
            />
            <Input
              label="Nombre de contacto"
              value={contactName}
              disabled={saving}
              onChange={(event) => setContactName(event.target.value)}
            />
            <Input
              label="Email"
              type="email"
              value={email}
              disabled={saving}
              error={formErrors.email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFormErrors((current) => ({ ...current, email: undefined }));
              }}
            />
            <Input
              label="Teléfono"
              type="tel"
              value={phone}
              disabled={saving}
              onChange={(event) => setPhone(event.target.value)}
            />
          </div>

          <Input
            label="Dirección"
            value={address}
            disabled={saving}
            onChange={(event) => setAddress(event.target.value)}
          />
          <Input
            label="Domicilio fiscal completo"
            value={fiscalAddress}
            disabled={saving}
            onChange={(event) => setFiscalAddress(event.target.value)}
          />

          <div className="flex flex-col gap-2">
            <label
              htmlFor="supplier-notes"
              className="text-sm font-medium text-gray-700"
            >
              Notas
            </label>
            <textarea
              id="supplier-notes"
              value={notes}
              rows={3}
              disabled={saving}
              className="w-full resize-none rounded-lg border border-gray-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-100"
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          {formError ? (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {formError}
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={closeSupplierForm}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={saving}
              loadingText={editingSupplier ? 'Actualizando...' : 'Registrando...'}
              disabled={saving}
            >
              {editingSupplier ? 'Guardar cambios' : 'Registrar proveedor'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={supplierToDeactivate !== null}
        title="Desactivar proveedor"
        message={
          <div className="space-y-3">
            <p>
              ¿Desactivar a{' '}
              <span className="font-semibold text-gray-900">
                {supplierToDeactivate?.name}
              </span>
              ?
            </p>
            <p className="text-sm text-gray-600">
              El proveedor dejará de aparecer en las operaciones nuevas. Su
              historial se conservará.
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
        onConfirm={() => void handleDeactivateSupplier()}
      />
    </>
  );
}
