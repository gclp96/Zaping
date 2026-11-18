'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Plus, Search } from 'lucide-react';

import { useAuthenticatedSession } from '@/app/auth-session';
import { canManageCustomers, hasRole, COMMERCIAL_ROLES } from '@/app/erp-role-access';
import CustomerFormModal from '@/app/components/business/CustomerForm';
import Button from '@/app/components/ui/Button';
import ConfirmDialog from '@/app/components/ui/ConfirmDialog';
import DataTable, {
  type DataTableColumn,
  type SortState,
} from '@/app/components/ui/DataTable';
import Loading from '@/app/components/ui/Loading';
import Input from '@/app/components/ui/Input';
import Select from '@/app/components/ui/Select';
import {
  CUSTOMER_TYPE_OPTIONS,
  customerLocationKey,
  customerLocationLabel,
  customerTypeLabel,
  resolveCustomerType,
} from './customer-classification';
import PageContainer from '@/app/components/ui/layout/PageContainer';
import PageHeader from '@/app/components/ui/layout/PageHeader';
import Section from '@/app/components/ui/layout/Section';
import ForbiddenState from '@/app/components/ui/ForbiddenState';
import { paginateRows, stableSort } from '@/app/client-table.utils';
import { api } from '@/services/api';
import { getApiErrorMessage, isForbiddenError } from '@/services/errors';

type Customer = {
  id: string;
  name: string;
  type: string;
  email: string;
  phone: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  countryCode?: string | null;
  contactName?: string | null;
  notes?: string | null;
};

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

const customerCollator = new Intl.Collator('es-MX', {
  numeric: true,
  sensitivity: 'base',
});

function normalizeCustomerSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-MX')
    .trim();
}

function customerMatchesFilters(
  customer: Customer,
  search: string,
  typeFilter: string,
  locationFilter: string,
): boolean {
  const matchesName = normalizeCustomerSearch(customer.name).includes(
    normalizeCustomerSearch(search),
  );
  const matchesType =
    !typeFilter ||
    (typeFilter === '__UNCLASSIFIED__'
      ? !resolveCustomerType(customer.type)
      : resolveCustomerType(customer.type) === typeFilter);
  const matchesLocation =
    !locationFilter || customerLocationKey(customer) === locationFilter;

  return matchesName && matchesType && matchesLocation;
}

function compareCustomers(
  first: Customer,
  second: Customer,
  columnId: string,
) {
  const firstValue =
    columnId === 'name'
      ? first.name
      : columnId === 'type'
        ? customerTypeLabel(first.type)
        : columnId === 'location'
          ? customerLocationLabel(first)
          : '';
  const secondValue =
    columnId === 'name'
      ? second.name
      : columnId === 'type'
        ? customerTypeLabel(second.type)
        : columnId === 'location'
          ? customerLocationLabel(second)
          : '';
  return customerCollator.compare(firstValue, secondValue);
}

export default function CustomersPage() {
  const sessionState = useAuthenticatedSession();
  const currentUserRole =
    sessionState.status === 'success'
      ? sessionState.user?.role ?? null
      : null;
  const canWrite = canManageCustomers(currentUserRole);
  const sessionForbidsAccess = Boolean(
    sessionState.status === 'success' &&
      currentUserRole &&
      !hasRole(currentUserRole, COMMERCIAL_ROLES),
  );
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerToDeactivate, setCustomerToDeactivate] =
    useState<Customer | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivationError, setDeactivationError] = useState('');
  const [sorting, setSorting] = useState<SortState>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const locationOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const customer of customers) {
      options.set(customerLocationKey(customer), customerLocationLabel(customer));
    }
    return [...options.entries()]
      .sort((left, right) => customerCollator.compare(left[1], right[1]))
      .map(([value, label]) => ({ value, label }));
  }, [customers]);

  const filteredCustomers = useMemo(
    () =>
      customers.filter((customer) =>
        customerMatchesFilters(customer, search, typeFilter, locationFilter),
      ),
    [customers, search, typeFilter, locationFilter],
  );

  async function loadCustomers() {
    try {
      setPageLoading(true);
      setPageError('');

      const response = await api.get<Customer[]>('/customers');
      setCustomers(response.data);
      setPageIndex(0);
    } catch (error: unknown) {
      if (isForbiddenError(error)) {
        setForbidden(true);
        setCustomers([]);
        return;
      }
      setPageError(
        getApiErrorMessage(error, 'No fue posible cargar los clientes.'),
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
      !hasRole(currentUserRole, COMMERCIAL_ROLES)
    ) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCustomers();
  }, [currentUserRole, sessionState.status]);

  function openCreateModal() {
    setEditingCustomer(null);
    setFormOpen(true);
  }

  function closeFormModal() {
    setFormOpen(false);
    setEditingCustomer(null);
  }

  function openEditModal(customer: Customer) {
    setEditingCustomer(customer);
    setFormOpen(true);
  }

  function openDeactivateDialog(customer: Customer) {
    setCustomerToDeactivate(customer);
    setDeactivationError('');
  }

  function closeDeactivateDialog() {
    if (deactivating) {
      return;
    }

    setCustomerToDeactivate(null);
    setDeactivationError('');
  }

  async function handleDeactivateCustomer() {
    if (!customerToDeactivate || deactivating) {
      return;
    }

    try {
      setDeactivating(true);
      setDeactivationError('');

      await api.delete(`/customers/${customerToDeactivate.id}`);
      await loadCustomers();

      setCustomerToDeactivate(null);
    } catch (error: unknown) {
      setDeactivationError(
        getApiErrorMessage(error, 'No fue posible desactivar el cliente.'),
      );
    } finally {
      setDeactivating(false);
    }
  }

  const isFiltered = Boolean(search.trim() || typeFilter || locationFilter);

  const sortedCustomers = useMemo(() => {
    if (!sorting) {
      return filteredCustomers;
    }

    return stableSort(
      filteredCustomers,
      (first, second) =>
        compareCustomers(first, second, sorting.columnId),
      sorting.direction,
    );
  }, [filteredCustomers, sorting]);

  const paginatedCustomers = useMemo(() => {
    return paginateRows(sortedCustomers, pageIndex, pageSize);
  }, [pageIndex, pageSize, sortedCustomers]);

  const customerColumns: DataTableColumn<Customer>[] = [
    {
      id: 'name',
      header: 'Cliente',
      cell: (customer) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Building2 aria-hidden="true" size={19} />
          </span>
          <div className="min-w-0">
            <p className="break-words font-semibold text-text">
              <Link
                href={'/customers/' + encodeURIComponent(customer.id)}
                className="hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                aria-label={'Ver ficha de ' + customer.name}
              >
                {customer.name}
              </Link>
            </p>
            {customer.contactName?.trim() ? (
              <p className="mt-0.5 truncate text-xs text-text-muted">
                Contacto: {customer.contactName}
              </p>
            ) : null}
          </div>
        </div>
      ),
      sortable: true,
      priority: 'primary',
      minWidth: 220,
    },
    {
      id: 'type',
      header: 'Tipo',
      cell: (customer) => (
        <span
          className="inline-flex max-w-full items-center rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-xs font-medium text-text-secondary"
          aria-label={
            resolveCustomerType(customer.type)
              ? undefined
              : 'Tipo sin clasificar'
          }
        >
          <span className="truncate">{customerTypeLabel(customer.type)}</span>
        </span>
      ),
      sortable: true,
      priority: 'secondary',
      minWidth: 160,
    },
    {
      id: 'location',
      header: 'Ubicación',
      cell: (customer) => (
        <span
          className={
            customerLocationKey(customer) === '__UNLOCATED__'
              ? 'text-text-muted'
              : 'text-text'
          }
          aria-label={
            customerLocationKey(customer) === '__UNLOCATED__'
              ? 'Ubicación sin registrar'
              : undefined
          }
        >
          {customerLocationLabel(customer)}
        </span>
      ),
      sortable: true,
      priority: 'secondary',
      minWidth: 200,
    },
  ];

  return (
    <>
      <PageContainer>
        <PageHeader
          title="Clientes"
          description="Administra los clientes disponibles para nuevas operaciones."
          action={canWrite ? (
            <Button type="button" onClick={openCreateModal}>
              <Plus aria-hidden="true" size={18} />
              Nuevo cliente
            </Button>
          ) : undefined}
        />

        {forbidden || sessionForbidsAccess ? (
          <ForbiddenState />
        ) : pageLoading ? (
          <Loading message="Cargando clientes..." />
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
                onClick={() => void loadCustomers()}
              >
                Reintentar
              </Button>
            </div>
          </Section>
        ) : (
          <Section>
            <DataTable
              caption="Catálogo de clientes"
              rows={paginatedCustomers}
              columns={customerColumns}
              getRowId={(customer) => customer.id}
              sorting={{
                state: sorting,
                onChange: setSorting,
              }}
              toolbar={
                <div
                  role="group"
                  aria-label="Herramientas de clientes"
                  className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-4 py-3 lg:flex-row lg:items-end lg:justify-between"
                >
                  <div className="flex min-h-10 shrink-0 items-center gap-2 lg:self-center">
                    <h2 className="text-base font-semibold text-text">
                      Clientes activos
                    </h2>
                    <span className="rounded-full bg-primary-subtle px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">
                      {customers.length}
                    </span>
                  </div>
                  {customers.length > 0 ? (
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end lg:justify-end">
                      <div className="w-full min-w-0 sm:w-80 xl:w-[28rem]">
                        <Input
                          type="search"
                          label="Buscar clientes"
                          value={search}
                          placeholder="Nombre, tipo, correo, teléfono o contacto"
                          startAdornment={<Search aria-hidden="true" size={17} />}
                          onChange={(event) => {
                            setSearch(event.target.value);
                            setPageIndex(0);
                          }}
                        />
                      </div>
                      {isFiltered ? (
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          <span
                            role="status"
                            aria-live="polite"
                            className="text-xs font-medium tabular-nums text-text-secondary"
                          >
                            {sortedCustomers.length}{' '}
                            {sortedCustomers.length === 1
                              ? 'coincidencia'
                              : 'coincidencias'}
                          </span>
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
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              }
              pagination={
                customers.length > 0
                  ? {
                      pageIndex,
                      pageSize,
                      totalRows: sortedCustomers.length,
                      compact: sortedCustomers.length <= pageSize,
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
                label: (customer) => `Acciones del cliente ${customer.name}`,
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
                title: 'Sin clientes activos',
                description:
                  'Registra un cliente para comenzar a usarlo en cotizaciones y ventas.',
              }}
              filteredEmptyState={{
                title: 'Sin clientes coincidentes',
                description: 'No encontramos clientes con esa búsqueda.',
              }}
              isFiltered={isFiltered}
            />
          </Section>
        )}
      </PageContainer>

      <CustomerFormModal
        isOpen={formOpen}
        customer={editingCustomer}
        onClose={closeFormModal}
        onSaved={loadCustomers}
      />

      <ConfirmDialog
        isOpen={customerToDeactivate !== null}
        title="Desactivar cliente"
        message={
          <div className="space-y-3">
            <p>
              ¿Desactivar a{' '}
              <span className="font-semibold text-gray-900">
                {customerToDeactivate?.name}
              </span>
              ?
            </p>
            <p className="text-sm text-gray-600">
              El cliente dejará de aparecer en las operaciones nuevas. Su
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
        onConfirm={() => void handleDeactivateCustomer()}
      />
    </>
  );
}
