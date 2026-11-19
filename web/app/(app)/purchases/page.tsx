'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, RotateCcw, Search } from 'lucide-react';

import { paginateRows, stableSort } from '@/app/client-table.utils';
import { useAuthenticatedSession } from '@/app/auth-session';
import {
  canApprovePurchases,
  canEditPurchases,
  hasRole,
  WAREHOUSE_ROLES,
} from '@/app/erp-role-access';
import { api } from '@/services/api';
import { getApiErrorMessage, isForbiddenError } from '@/services/errors';
import {
  canRegisterPurchaseReceipt,
  getPurchaseStatusDescriptor,
} from './purchase-status';
import {
  formatPurchaseDate,
  getOperationalDateKey,
  isValidTimeZone,
} from './purchase-date';

import StatusBadge from '@/app/components/business/StatusBadge';
import ReceiptFilesPreview from '@/app/components/files/ReceiptFilesPreview';
import PurchaseReceiptModal from './components/PurchaseReceiptModal';
import PurchaseQuickDetailPanel from './components/PurchaseQuickDetailPanel';
import PurchaseFormModal from './components/PurchaseFormModal';
import { usePurchaseReceipts } from './hooks/usePurchaseReceipts';
import { getPurchaseReceiptInventoryHref } from '../purchase-receipts/receipt-navigation';
import { usePurchaseForm } from './hooks/usePurchaseForm';
import { usePurchaseReceiptPreparation } from './hooks/usePurchaseReceiptPreparation';
import { usePurchaseActions } from './hooks/usePurchaseActions';

import type {
  Product,
  Purchase,
  PurchaseStatus,
  Supplier,
} from './types';

import Button from '@/app/components/ui/Button';
import ConfirmDialog from '@/app/components/ui/ConfirmDialog';
import DataTable, {
  RowActionsMenu,
  type DataTableColumn,
  type DataTableRowAction,
  type DataTableSelectFilter,
  type SortState,
} from '@/app/components/ui/DataTable';
import EmptyState from '@/app/components/ui/EmptyState';
import Input from '@/app/components/ui/Input';
import Loading from '@/app/components/ui/Loading';
import Select from '@/app/components/ui/Select';

import PageContainer from '@/app/components/ui/layout/PageContainer';
import PageHeader from '@/app/components/ui/layout/PageHeader';
import Section from '@/app/components/ui/layout/Section';
import ForbiddenState from '@/app/components/ui/ForbiddenState';

type StatusFilter = 'ALL' | PurchaseStatus;

type CompanyTimezoneState =
  | { status: 'loading' }
  | { status: 'success'; value: string }
  | { status: 'error'; message: string };

type DirectReceiveState =
  | {
      purchase: Purchase;
      status: 'loading';
    }
  | {
      purchase: Purchase;
      status: 'error';
      message: string;
    }
  | null;

const receiptHistoryUnavailableMessage =
  'No pudimos verificar las recepciones anteriores. Vuelve a intentarlo antes de registrar una nueva recepción.';
const purchaseDetailUnavailableMessage =
  'No pudimos preparar el detalle de la compra. Vuelve a intentarlo antes de registrar una nueva recepción.';
const timezoneUnavailableMessage =
  'No fue posible habilitar el filtro por fecha.';

const statusFilterOptions: Array<{
  value: StatusFilter;
  label: string;
}> = [
  { value: 'ALL', label: 'Todos' },
  { value: 'DRAFT', label: getPurchaseStatusDescriptor('DRAFT').label },
  {
    value: 'CONFIRMED',
    label: getPurchaseStatusDescriptor('CONFIRMED').label,
  },
  {
    value: 'PARTIALLY_RECEIVED',
    label: getPurchaseStatusDescriptor('PARTIALLY_RECEIVED').label,
  },
  {
    value: 'RECEIVED',
    label: getPurchaseStatusDescriptor('RECEIVED').label,
  },
  {
    value: 'CANCELLED',
    label: getPurchaseStatusDescriptor('CANCELLED').label,
  },
];

const moneyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const purchaseCollator = new Intl.Collator('es-MX', {
  numeric: true,
  sensitivity: 'base',
});

function formatMoney(value: number): string {
  return moneyFormatter.format(value);
}

export default function PurchasesPage() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <h1 className="sr-only">Compras</h1>
          <Loading message="Cargando compras..." />
        </PageContainer>
      }
    >
      <PurchasesPageContent />
    </Suspense>
  );
}

function purchaseMatchesSearch(
  purchase: Purchase,
  search: string,
): boolean {
  const normalizedSearch = search.trim().toLocaleLowerCase('es-MX');

  if (!normalizedSearch) {
    return true;
  }

  const values = [
    purchase.folio,
    purchase.supplier.name,
    purchase.supplier.contactName,
    purchase.supplier.email,
    ...purchase.items.flatMap((item) => [
      item.product.sku,
      item.product.name,
    ]),
  ];

  return values.some((value) =>
    value?.toLocaleLowerCase('es-MX').includes(normalizedSearch),
  );
}

function comparePurchases(
  first: Purchase,
  second: Purchase,
  columnId: string,
): number {
  if (columnId === 'date') {
    return (
      new Date(first.createdAt).getTime() -
      new Date(second.createdAt).getTime()
    );
  }

  if (columnId === 'items') {
    return first.items.length - second.items.length;
  }

  if (columnId === 'total') {
    return first.total - second.total;
  }

  if (columnId === 'folio') {
    return purchaseCollator.compare(first.folio, second.folio);
  }

  if (columnId === 'supplier') {
    return purchaseCollator.compare(
      first.supplier.name,
      second.supplier.name,
    );
  }

  if (columnId === 'status') {
    return purchaseCollator.compare(
      getPurchaseStatusDescriptor(first.status).label,
      getPurchaseStatusDescriptor(second.status).label,
    );
  }

  return 0;
}

function PurchasesPageContent() {
  // PUR-UX-01B: presentation-only flag. Authorization remains server-owned.
  const purchasesWorkspaceEnabled =
    process.env.NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE === 'true';

const router = useRouter();
const searchParams = useSearchParams();
const sessionState = useAuthenticatedSession();
const currentUserRole =
  sessionState.status === 'success'
    ? sessionState.user?.role ?? null
    : null;
const canEdit = canEditPurchases(currentUserRole);
const canApprove = canApprovePurchases(currentUserRole);
const sessionForbidsAccess = Boolean(
  sessionState.status === 'success' &&
    currentUserRole &&
    !hasRole(currentUserRole, WAREHOUSE_ROLES),
);
const legacyPurchaseId = searchParams.get('purchaseId')?.trim() || '';
const dateRangeMessageId = useId();

const [ purchases, setPurchases ] = useState<Purchase[]>([]);
const [ suppliers, setSuppliers ] = useState<Supplier[]>([]);
const [ products, setProducts ] = useState<Product[]>([]);

const [ pageLoading, setPageLoading ] = useState(true);
const [ pageError, setPageError ] = useState('');
const [forbidden, setForbidden] = useState(false);
const [search, setSearch] = useState('');
const [statusFilter, setStatusFilter] =
  useState<StatusFilter>('ALL');
const [supplierFilter, setSupplierFilter] = useState('ALL');
const [dateFrom, setDateFrom] = useState('');
const [dateTo, setDateTo] = useState('');
const [companyTimezoneState, setCompanyTimezoneState] =
  useState<CompanyTimezoneState>({ status: 'loading' });
const [sorting, setSorting] = useState<SortState>(null);
const [pageIndex, setPageIndex] = useState(0);
const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
const [quickDetailOpen, setQuickDetailOpen] = useState(false);
const [quickDetailGeneration, setQuickDetailGeneration] = useState(0);
const [directReceiveState, setDirectReceiveState] =
  useState<DirectReceiveState>(null);
const [localAttachmentCount, setLocalAttachmentCount] = useState(0);
const directReceiveRequestId = useRef(0);
const directReceiveInFlight = useRef(false);
const authenticatedCompanyTimezone =
  sessionState.status === 'success'
    ? sessionState.user.companyTimezone
    : null;

const companyTimezone =
  companyTimezoneState.status === 'success'
    ? companyTimezoneState.value
    : null;
const hasDateRange = Boolean(dateFrom || dateTo);
const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);
const dateRangeUnavailable =
  hasDateRange && companyTimezoneState.status !== 'success';
const dateInputsDisabled = companyTimezoneState.status !== 'success';
const dateRangeMessage = dateRangeInvalid
  ? 'La fecha Desde no puede ser posterior a Hasta.'
  : companyTimezoneState.status === 'loading'
    ? 'Cargando zona horaria de la empresa...'
    : companyTimezoneState.status === 'error'
      ? companyTimezoneState.message
      : '';

async function loadPurchases() {
    const response = await api.get<Purchase[]>('/purchases');
    setPurchases(response.data);
    setPageIndex(0);
  }

const loadCompanyTimezone = useCallback(async () => {
  try {
    setCompanyTimezoneState({ status: 'loading' });

    if (sessionState.status !== 'success') {
      setCompanyTimezoneState({
        status: 'error',
        message: timezoneUnavailableMessage,
      });
      return;
    }

    const timezone = authenticatedCompanyTimezone?.trim() ?? '';

    if (!isValidTimeZone(timezone)) {
      setCompanyTimezoneState({
        status: 'error',
        message: timezoneUnavailableMessage,
      });
      return;
    }

    setCompanyTimezoneState({ status: 'success', value: timezone });
  } catch {

    setCompanyTimezoneState({
      status: 'error',
      message: timezoneUnavailableMessage,
    });
  }
}, [authenticatedCompanyTimezone, sessionState.status]);

const {
  purchaseToApprove,
  purchaseToCancel,

  approving,
  cancelling,
  downloadingPurchaseId,
  actionError,

  openApproveDialog,
  closeApproveDialog,

  openCancelDialog,
  closeCancelDialog,

  clearActionError,

  handleApprovePurchase,
  handleCancelPurchase,
  handleDownloadPdf,
} = usePurchaseActions({
  onPurchaseChanged: loadPurchases,
});

const supplierFilterOptions = useMemo(() => {
  const suppliersById = new Map(
    purchases.map((purchase) => [
      purchase.supplier.id,
      purchase.supplier,
    ]),
  );

  return [...suppliersById.values()].sort((first, second) =>
    first.name.localeCompare(second.name, 'es-MX'),
  );
}, [purchases]);

const filteredPurchases = useMemo(
  () =>
    purchases.filter((purchase) => {
      if (statusFilter !== 'ALL' && purchase.status !== statusFilter) {
        return false;
      }

      if (
        supplierFilter !== 'ALL' &&
        purchase.supplier.id !== supplierFilter
      ) {
        return false;
      }

      if (!purchaseMatchesSearch(purchase, search)) {
        return false;
      }

      if (
        !hasDateRange ||
        dateRangeInvalid ||
        !companyTimezone
      ) {
        return true;
      }

      const purchaseDateKey = getOperationalDateKey(
        purchase.createdAt,
        companyTimezone,
      );

      if (!purchaseDateKey) {
        return false;
      }

      if (dateFrom && purchaseDateKey < dateFrom) {
        return false;
      }

      if (dateTo && purchaseDateKey > dateTo) {
        return false;
      }

      return true;
    }),
  [
    companyTimezone,
    dateFrom,
    dateRangeInvalid,
    dateTo,
    hasDateRange,
    purchases,
    search,
    statusFilter,
    supplierFilter,
  ],
);

const {
  preparePurchaseForReceipt,
} = usePurchaseReceiptPreparation();

  //propiedades del formulario
const {
  openModal,
  saving,
  purchaseToEdit,
  hasUnsavedChanges,

  supplierId,
  selectedProductId,
  quantity,
  items,

  supplierError,
  productError,
  quantityError,
  itemQuantityErrors,
  itemUnitCostDrafts,
  itemUnitCostErrors,
  itemsError,

  subtotal,
  iva,
  total,

  openCreateModal,
  openEditModal,
  closeCreateModal,

  handleSupplierChange,
  handleSelectedProductChange,
  handleFormQuantityChange,

  handleAddProduct,
  handleItemQuantityChange,
  handleItemUnitCostChange,
  handleRemoveItem,
  handleCreatePurchase,
} = usePurchaseForm({
  products,
  onPurchaseSaved: loadPurchases,
  canAdjustUnitCost: canApprove,
});

  //propiedades de recepcion
const {
  purchaseToReceive,
  receiptAuthority,
  receiptAuthorityError,
  retryReceiptAuthority,
  receiptFormItems,
  receiptNotes,
  supplierDocumentType,
  supplierDocumentNumber,
  setSupplierDocumentType,
  setSupplierDocumentNumber,
  receiptSaving,
  receiptFormError,
  receiptFieldErrors,
  createdReceipt,
  openReceiptModal,
  closeReceiptModal,
  handleReceiptItemChange,
  handleReceiptNotesChange,
  handleCreateReceipt,
} = usePurchaseReceipts({
    purchaseReceipts: [],
    receiptHistoryReady: false,
    onReceiptCreated: loadPurchases,
  });

  async function handleDirectReceive(purchase: Purchase) {
    if (directReceiveInFlight.current) {
      return;
    }

    directReceiveInFlight.current = true;
    const requestId = directReceiveRequestId.current + 1;
    directReceiveRequestId.current = requestId;
    setDirectReceiveState({
      purchase,
      status: 'loading',
    });

    try {
      const result = await preparePurchaseForReceipt(purchase);

      if (requestId !== directReceiveRequestId.current) {
        return;
      }

      if (result.stale) {
        setDirectReceiveState({
          purchase,
          status: 'error',
          message: purchaseDetailUnavailableMessage,
        });
        return;
      }

      if (result.receiptsError) {
        setDirectReceiveState({
          purchase,
          status: 'error',
          message: receiptHistoryUnavailableMessage,
        });
        return;
      }

      if (result.movementsError) {
        setDirectReceiveState({
          purchase,
          status: 'error',
          message: purchaseDetailUnavailableMessage,
        });
        return;
      }

      if (
        openReceiptModal(purchase, {
          verifiedPurchaseReceipts: result.purchaseReceipts,
        })
      ) {
        setDirectReceiveState(null);
        return;
      }

      setDirectReceiveState({
        purchase,
        status: 'error',
        message: receiptHistoryUnavailableMessage,
      });
    } catch {

      if (requestId === directReceiveRequestId.current) {
        setDirectReceiveState({
          purchase,
          status: 'error',
          message: purchaseDetailUnavailableMessage,
        });
      }
    } finally {
      directReceiveInFlight.current = false;
    }
  }

function closeReceiptWithPreview() {
  if (receiptSaving) return;
  setLocalAttachmentCount(0);
  closeReceiptModal();
}

function handleViewCreatedReceipt(receiptId: string) {
  closeReceiptWithPreview();
  router.push(`/purchase-receipts/${encodeURIComponent(receiptId)}`);
}

function handleViewCreatedReceiptInventory(
  receiptId: string,
  receiptFolio: string,
) {
  closeReceiptWithPreview();
  router.push(getPurchaseReceiptInventoryHref(receiptId, receiptFolio));
}

async function loadPageData() {
    try {
      setPageLoading(true);
      setPageError('');

      const [
        purchasesResponse,
        suppliersResponse,
        productsResponse,
      ] = await Promise.all([
        api.get<Purchase[]>('/purchases'),
        api.get<Supplier[]>('/suppliers'),
        api.get<Product[]>('/products'),
      ]);

      setPurchases(purchasesResponse.data);
      setSuppliers(suppliersResponse.data);
      setProducts(productsResponse.data);
      setPageIndex(0);
    } catch (error: unknown) {

      if (isForbiddenError(error)) {
        setForbidden(true);
        setPurchases([]);
        return;
      }

      setPageError(
        getApiErrorMessage(
          error,
          'No fue posible cargar la información de compras.',
        ),
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
    void loadPageData();
    void loadCompanyTimezone();
  }, [currentUserRole, loadCompanyTimezone, sessionState.status]);

  useEffect(() => {
    if (legacyPurchaseId) {
      router.replace(`/purchases/${encodeURIComponent(legacyPurchaseId)}`);
    }
  }, [legacyPurchaseId, router]);

  function clearFilters() {
    setSearch('');
    setStatusFilter('ALL');
    setSupplierFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setPageIndex(0);
  }

  function formatDate(value: string): string {
    if (companyTimezoneState.status === 'loading') {
      return 'Cargando fecha...';
    }

    if (!companyTimezone) {
      return 'Fecha no disponible';
    }

    return formatPurchaseDate(value, companyTimezone) ?? 'Fecha no disponible';
  }

  function handleDateFromChange(value: string) {
    setDateFrom(value);
    setPageIndex(0);
  }

  function handleDateToChange(value: string) {
    setDateTo(value);
    setPageIndex(0);
  }

  function renderPurchasesToolbar() {
    const resetDisabled = !Boolean(
      search.trim() ||
        statusFilter !== 'ALL' ||
        supplierFilter !== 'ALL' ||
        hasDateRange,
    );

    const toolbarActions = (
      <div className="flex flex-wrap items-center gap-2">
        {companyTimezoneState.status === 'error' ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadCompanyTimezone()}
          >
            Reintentar zona horaria
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={resetDisabled}
          onClick={clearFilters}
        >
          <RotateCcw aria-hidden="true" size={16} />
          Limpiar filtros
        </Button>
      </div>
    );

    return (
      <div
        role="group"
        aria-label="Controles de tabla"
        className={purchasesWorkspaceEnabled
          ? 'space-y-3 rounded-xl border border-border bg-surface p-3 shadow-sm sm:p-4'
          : 'space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5'}
      >
        {purchasesWorkspaceEnabled ? (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-text">
                Historial de compras
              </h2>
              <p className="text-sm text-text-muted">
                {filteredPurchases.length} de {purchases.length} órdenes
              </p>
            </div>
            {toolbarActions}
          </div>
        ) : null}

        <div className={purchasesWorkspaceEnabled
            ? 'grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6'
            : 'grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-6'}>
          <Input
            label={purchasesWorkspaceEnabled ? 'Buscar por folio, proveedor o SKU' : 'Buscar compras'}
            type="search"
            value={search}
            placeholder="Folio, proveedor o producto"
            helperText="También puedes buscar por contacto, email o SKU."
            startAdornment={<Search size={17} />}
            containerClassName="sm:col-span-2"
            onChange={(event) => {
              setSearch(event.target.value);
              setPageIndex(0);
            }}
          />

          {purchasesTableFilters.map((filter) => (
            <Select
              key={filter.id}
              label={filter.label}
              value={filter.value}
              options={[...filter.options]}
              placeholder={filter.placeholder ?? 'Todas las opciones'}
              onChange={(event) => filter.onChange(event.target.value)}
            />
          ))}

          <Input
            label="Desde"
            type="date"
            value={dateFrom}
            disabled={dateInputsDisabled}
            className={
              dateRangeInvalid ? 'border-red-500 focus:ring-red-500' : ''
            }
            aria-describedby={
              dateRangeMessage ? dateRangeMessageId : undefined
            }
            aria-invalid={dateRangeInvalid}
            onChange={(event) => handleDateFromChange(event.target.value)}
          />

          <Input
            label="Hasta"
            type="date"
            value={dateTo}
            disabled={dateInputsDisabled}
            aria-describedby={
              dateRangeMessage ? dateRangeMessageId : undefined
            }
            aria-invalid={dateRangeInvalid}
            onChange={(event) => handleDateToChange(event.target.value)}
          />
        </div>

        {!purchasesWorkspaceEnabled ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-sm text-text-muted">
              {filteredPurchases.length} de {purchases.length} órdenes
            </p>
            {toolbarActions}
          </div>
        ) : null}

        {dateRangeMessage ? (
          <p
            id={dateRangeMessageId}
            role={
              dateRangeInvalid || dateRangeUnavailable ? 'alert' : undefined
            }
            className={[
              'text-sm',
              dateRangeInvalid || dateRangeUnavailable
                ? 'text-red-600'
                : 'text-gray-500',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {dateRangeMessage}
          </p>
        ) : null}
      </div>
    );
  }

  const actionErrorHasDialog = Boolean(purchaseToApprove || purchaseToCancel);

  const sortedPurchases = useMemo(() => {
    if (!sorting) {
      return filteredPurchases;
    }

    return stableSort(
      filteredPurchases,
      (first, second) =>
        comparePurchases(first, second, sorting.columnId),
      sorting.direction,
    );
  }, [filteredPurchases, sorting]);

  const paginatedPurchases = useMemo(
    () => paginateRows(sortedPurchases, pageIndex, pageSize),
    [pageIndex, pageSize, sortedPurchases],
  );

  const purchasesTableFilters: DataTableSelectFilter[] = [
    {
      id: 'status',
      label: 'Estado',
      value: statusFilter === 'ALL' ? '' : statusFilter,
      options: statusFilterOptions.filter(
        (option) => option.value !== 'ALL',
      ),
      placeholder: 'Todos',
      onChange: (value) => {
        setStatusFilter(value ? (value as PurchaseStatus) : 'ALL');
        setPageIndex(0);
      },
    },
    {
      id: 'supplier',
      label: 'Proveedor',
      value: supplierFilter === 'ALL' ? '' : supplierFilter,
      options: supplierFilterOptions.map((supplierOption) => ({
        value: supplierOption.id,
        label: supplierOption.name,
      })),
      placeholder: 'Todos los proveedores',
      onChange: (value) => {
        setSupplierFilter(value || 'ALL');
        setPageIndex(0);
      },
    },
  ];

  const purchaseColumns: DataTableColumn<Purchase>[] = [
    {
      id: 'folio',
      header: 'Folio',
      sortable: true,
      priority: 'primary',
      minWidth: 110,
      cell: (purchase) => (
        <div className="space-y-2">
          {purchasesWorkspaceEnabled ? (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={quickDetailOpen && selectedPurchaseId === purchase.id}
              aria-label={`Abrir detalle de compra ${purchase.folio}`}
              className="inline-block rounded-sm text-left font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
              onClick={() => {
                clearActionError();
                setSelectedPurchaseId(purchase.id);
                setQuickDetailGeneration((version) => version + 1);
                setQuickDetailOpen(true);
              }}
            >
              {purchase.folio}
            </button>
          ) : (
            <Link
              href={`/purchases/${encodeURIComponent(purchase.id)}`}
              className="inline-block rounded-sm font-semibold text-blue-700 underline decoration-blue-200 underline-offset-4 hover:text-blue-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
            >
              {purchase.folio}
            </Link>
          )}
          {purchase.status !== 'DRAFT' && purchase.status !== 'CANCELLED' ? (
            <p className="text-xs text-text-muted sm:hidden">
              Recepción: {purchase.receiptProgress.receivedUnits} de{' '}
              {purchase.receiptProgress.orderedUnits} uds.
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'supplier',
      header: 'Proveedor',
      sortable: true,
      priority: 'primary',
      minWidth: 140,
      cell: (purchase) => (
        <span className="block max-w-56 break-words font-medium">
          {purchase.supplier.name}
        </span>
      ),
    },
    {
      id: 'date',
      header: 'Fecha',
      sortable: true,
      priority: 'secondary',
      minWidth: 110,
      cell: (purchase) => formatDate(purchase.createdAt),
    },
    {
      id: 'items',
      header: 'Partidas',
      sortable: true,
      priority: 'tertiary',
      minWidth: 80,
      cell: (purchase) => purchase.items.length,
    },
    {
      id: 'receiptProgress',
      header: 'Recepción',
      priority: 'secondary',
      minWidth: 150,
      cell: (purchase) => {
        if (purchase.status === 'DRAFT') {
          return (
            <span className="text-sm text-text-muted">
              Pendiente de aprobación
            </span>
          );
        }

        if (purchase.status === 'CANCELLED') {
          return <span className="text-sm text-text-muted">No aplica</span>;
        }

        return (
          <div
            aria-label={`Progreso de recepción: ${purchase.receiptProgress.completedLines} de ${purchase.receiptProgress.orderedLines} partidas`}
            className="flex min-w-32 flex-col gap-1.5 tabular-nums"
          >
            <span className="font-medium">
              {purchase.receiptProgress.completedLines} /{' '}
              {purchase.receiptProgress.orderedLines} partidas
            </span>
            <span className="text-xs text-text-muted">
              {purchase.receiptProgress.receivedUnits} /{' '}
              {purchase.receiptProgress.orderedUnits} uds.
            </span>
            {purchase.receiptProgress.orderedUnits > 0 ? (
              <progress
                aria-label={`Unidades recibidas de ${purchase.folio}`}
                max={purchase.receiptProgress.orderedUnits}
                value={purchase.receiptProgress.receivedUnits}
                className="h-1.5 w-full accent-blue-600"
              />
            ) : null}
          </div>
        );
      },
    },
    {
      id: 'total',
      header: 'Total',
      align: 'end',
      sortable: true,
      priority: 'secondary',
      minWidth: 110,
      cell: (purchase) => (
        <span className="whitespace-nowrap font-semibold tabular-nums">
          {formatMoney(purchase.total)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Estado',
      sortable: true,
      priority: 'primary',
      minWidth: 155,
      cell: (purchase) => {
        const statusDescriptor =
          getPurchaseStatusDescriptor(purchase.status);

        return (
          <StatusBadge
            label={statusDescriptor.label}
            tone={statusDescriptor.tone}
            ariaLabel={`Estado de la compra: ${statusDescriptor.label}`}
            className="max-w-36 [white-space:normal]"
          />
        );
      },
    },
    {
      id: 'actions',
      header: 'Acciones',
      align: 'end',
      priority: 'primary',
      minWidth: 180,
      cell: (purchase) => {
        const rowActions: DataTableRowAction<Purchase>[] = [
          ...(canEdit && canApprove && purchase.status === 'DRAFT'
            ? [
                {
                  id: 'edit',
                  label: 'Editar',
                  onSelect: (selectedPurchase: Purchase) =>
                    openEditModal(selectedPurchase),
                },
              ]
            : []),
          {
            id: 'download-pdf',
            label:
              downloadingPurchaseId === purchase.id
                ? 'Descargando PDF...'
                : 'Descargar PDF',
            disabled: downloadingPurchaseId === purchase.id,
            onSelect: (selectedPurchase) =>
              void handleDownloadPdf(selectedPurchase),
          },
          ...(canApprove && purchase.status === 'DRAFT'
            ? [
                {
                  id: 'cancel',
                  label: 'Cancelar',
                  variant: 'destructive' as const,
                  onSelect: (selectedPurchase: Purchase) =>
                    openCancelDialog(selectedPurchase),
                },
              ]
            : []),
        ];

        return (
          <div className="relative flex flex-wrap items-center justify-end gap-2">
            {purchase.status === 'DRAFT' && canApprove ? (
              <Button
                variant="success"
                size="sm"
                className="min-w-24"
                onClick={() => openApproveDialog(purchase)}
              >
                Aprobar
              </Button>
            ) : null}

            {purchase.status === 'DRAFT' && canEdit && !canApprove ? (
              <Button
                variant="outline"
                size="sm"
                className="min-w-24"
                onClick={() => openEditModal(purchase)}
              >
                Editar
              </Button>
            ) : null}

            {canEdit && canRegisterPurchaseReceipt(purchase.status) ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 min-w-0 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                aria-describedby={`receive-purchase-${purchase.id}`}
                loading={
                  directReceiveState?.status === 'loading' &&
                  directReceiveState.purchase.id === purchase.id
                }
                loadingText="Preparando..."
                disabled={directReceiveState?.status === 'loading'}
                onClick={() => void handleDirectReceive(purchase)}
              >
                Recibir
              </Button>
            ) : null}

            {canEdit && canRegisterPurchaseReceipt(purchase.status) ? (
              <span id={`receive-purchase-${purchase.id}`} className="sr-only">
                Registrar recepción de la compra {purchase.folio}
              </span>
            ) : null}

            <div className="inline-flex [&>div>button]:border-transparent [&>div>button]:bg-transparent [&>div>button]:hover:bg-surface-subtle">
              <RowActionsMenu
                row={purchase}
                label={`Acciones de compra ${purchase.folio}`}
                actions={rowActions}
              />
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <>
      {/* Página de compras */}
      <PageContainer
        size={purchasesWorkspaceEnabled ? 'wide' : 'default'}
        className={purchasesWorkspaceEnabled ? '[&>*+*]:mt-4' : undefined}
      >
        <div className={purchasesWorkspaceEnabled
          ? 'min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm sm:p-5 [&>div]:mb-0 [&_h1]:text-2xl [&_p]:mt-1'
          : 'rounded-xl border border-border border-t-4 border-t-blue-600 bg-surface p-5 sm:p-6 [&>div]:mb-0'}>
          <PageHeader
            title="Compras"
            description={purchasesWorkspaceEnabled
              ? 'Registra órdenes de compra y da seguimiento a recepciones parciales o completas.'
              : 'Administra órdenes de compra y da seguimiento a sus recepciones.'}
            action={canEdit ? (
              <Button className="w-full sm:w-auto" onClick={openCreateModal}>
                <Plus aria-hidden="true" size={18} />
                Nueva compra
              </Button>
            ) : undefined}
          />
        </div>

        {actionError && !actionErrorHasDialog && !quickDetailOpen ? (
          <div
            role="alert"
            className="mb-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{actionError}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearActionError}
            >
              Cerrar mensaje
            </Button>
          </div>
        ) : null}

        {directReceiveState?.status === 'error' ? (
          <div
            role="alert"
            className="mb-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700 sm:flex-row sm:items-center sm:justify-between"
          >
            <span>{directReceiveState.message}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void handleDirectReceive(directReceiveState.purchase)
              }
            >
              Reintentar recepción
            </Button>
          </div>
        ) : null}

        {forbidden || sessionForbidsAccess ? (
          <ForbiddenState />
        ) : pageLoading ? (
          <Loading message="Cargando compras..." />
        ) : pageError ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700"
          >
            <p>{pageError}</p>

            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void loadPageData()}
            >
              Reintentar
            </Button>
          </div>
        ) : purchases.length === 0 ? (
          <EmptyState
            title="No hay compras registradas"
            description="Comienza creando tu primera orden de compra."
            action={
              canEdit ? (
                <Button type="button" onClick={openCreateModal}>
                  Nueva compra
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Section>
            <p className="text-sm text-text-muted sm:hidden">
              Desliza la tabla para ver el estado y las acciones de cada compra.
            </p>
            <DataTable
              caption="Listado de compras"
              rows={paginatedPurchases}
              columns={purchaseColumns}
              getRowId={(purchase) => purchase.id}
              getRowClassName={purchasesWorkspaceEnabled
                ? (purchase) => quickDetailOpen && selectedPurchaseId === purchase.id ? 'bg-blue-50' : ''
                : undefined}
              sorting={{
                state: sorting,
                onChange: setSorting,
              }}
              toolbar={renderPurchasesToolbar()}
              pagination={{
                pageIndex,
                pageSize,
                totalRows: sortedPurchases.length,
                pageSizeOptions: PAGE_SIZE_OPTIONS,
                onPageChange: setPageIndex,
                onPageSizeChange: (nextPageSize) => {
                  setPageSize(nextPageSize);
                  setPageIndex(0);
                },
              }}
              emptyState={{
                title: 'No hay compras registradas',
                description: 'Comienza creando tu primera orden de compra.',
              }}
              filteredEmptyState={{
                title: 'No se encontraron compras',
                description:
                  'No hay compras que coincidan con la búsqueda y los filtros seleccionados.',
              }}
              isFiltered={Boolean(
                search.trim() ||
                  statusFilter !== 'ALL' ||
                  supplierFilter !== 'ALL' ||
                  hasDateRange,
              )}
            />
          </Section>
        )}
      </PageContainer>

      {/* PUR-UX-01C: read-only contextual detail, behind the workspace flag. */}
      {purchasesWorkspaceEnabled && selectedPurchaseId && !forbidden && !sessionForbidsAccess ? (
        <PurchaseQuickDetailPanel
          key={`${selectedPurchaseId}-${quickDetailGeneration}`}
          purchaseId={selectedPurchaseId}
          isOpen={quickDetailOpen}
          onClose={() => setQuickDetailOpen(false)}
          formatDate={formatDate}
          formatMoney={formatMoney}
          canEdit={canEdit}
          canApprove={canApprove}
          onEdit={openEditModal}
          onApprove={openApproveDialog}
          onCancel={openCancelDialog}
          onReceive={(purchase) => { void handleDirectReceive(purchase); }}
          onDownloadPdf={(purchase) => { void handleDownloadPdf(purchase); }}
          downloadingPurchaseId={downloadingPurchaseId}
          actionError={actionError}
          onClearActionError={clearActionError}
        />
      ) : null}

      {/* Crear compra */}
      <PurchaseFormModal
        isOpen={openModal}
        editing={purchaseToEdit !== null}
        saving={saving}
        hasUnsavedChanges={hasUnsavedChanges}
        suppliers={suppliers}
        products={products}
        supplierId={supplierId}
        selectedProductId={selectedProductId}
        quantity={quantity}
        items={items}
        supplierError={supplierError}
        productError={productError}
        quantityError={quantityError}
        itemQuantityErrors={itemQuantityErrors}
        itemUnitCostDrafts={itemUnitCostDrafts}
        itemUnitCostErrors={itemUnitCostErrors}
        canAdjustUnitCost={canApprove}
        itemsError={itemsError}
        subtotal={subtotal}
        iva={iva}
        total={total}
        formatMoney={formatMoney}
        onClose={closeCreateModal}
        onSubmit={() => void handleCreatePurchase()}
        onAddProduct={handleAddProduct}
        onRemoveItem={handleRemoveItem}
        onSupplierChange={handleSupplierChange}
        onSelectedProductChange={
          handleSelectedProductChange
        }
        onQuantityChange={handleFormQuantityChange}
        onItemQuantityChange={
          handleItemQuantityChange
        }
        onItemUnitCostChange={handleItemUnitCostChange}
        />
      <PurchaseReceiptModal
        isOpen={purchaseToReceive !== null || createdReceipt !== null}
        purchase={purchaseToReceive}
        receiptAuthority={receiptAuthority}
        receiptAuthorityError={receiptAuthorityError}
        onRetryAuthority={retryReceiptAuthority}
        items={receiptFormItems}
        notes={receiptNotes}
        supplierDocumentType={supplierDocumentType}
        supplierDocumentNumber={supplierDocumentNumber}
        onSupplierDocumentTypeChange={setSupplierDocumentType}
        onSupplierDocumentNumberChange={setSupplierDocumentNumber}
        saving={receiptSaving}
        error={receiptFormError}
        fieldErrors={receiptFieldErrors}
        createdReceipt={createdReceipt}
        onClose={closeReceiptWithPreview}
        pendingAttachmentCount={localAttachmentCount}
        attachmentPreview={process.env.NEXT_PUBLIC_ZAPING_FILES_RECEIPTS_UI === 'true' && purchaseToReceive && !createdReceipt ? (
          <ReceiptFilesPreview key={purchaseToReceive.id} mode="registration" receiptFolio={purchaseToReceive.folio} onSelectionCountChange={setLocalAttachmentCount} />
        ) : null}
        onItemChange={handleReceiptItemChange}
        onNotesChange={handleReceiptNotesChange}
        onSubmit={() => { if (localAttachmentCount === 0) void handleCreateReceipt(); }}
        onViewReceipt={handleViewCreatedReceipt}
        onViewInventory={handleViewCreatedReceiptInventory}
      />

      <ConfirmDialog
          isOpen={purchaseToApprove !== null}
          title="Aprobar compra"
          message={
            <div className="space-y-3">
              <p>
                ¿Seguro que deseas aprobar la compra{' '}
                <span className="font-semibold">
                  {purchaseToApprove?.folio}
                </span>
                ? La compra quedará confirmada y podrá
                recibir mercancía. El inventario no
                cambiará hasta registrar una recepción.
              </p>
              {actionError ? (
                <p role="alert" className="text-sm text-red-700">
                  {actionError}
                </p>
              ) : null}
            </div>
          }
          confirmText="Aprobar"
          loadingText="Aprobando..."
          confirmVariant="success"
          loading={approving}
          onClose={closeApproveDialog}
          onConfirm={() =>
            void handleApprovePurchase()
          }
        />
      <ConfirmDialog
        isOpen={purchaseToCancel !== null}
        title="Cancelar compra"
        message={
          <div className="space-y-3">
            <p>
              ¿Seguro que deseas cancelar la compra{' '}
              <span className="font-semibold">
                {purchaseToCancel?.folio}
              </span>
              ? La compra permanecerá registrada, pero
              ya no podrá aprobarse.
            </p>
            {actionError ? (
              <p role="alert" className="text-sm text-red-700">
                {actionError}
              </p>
            ) : null}
          </div>
        }
        confirmText="Cancelar compra"
        loadingText="Cancelando..."
        confirmVariant="danger"
        loading={cancelling}
        onClose={closeCancelDialog}
        onConfirm={() =>
          void handleCancelPurchase()
        }
      />
    </>
  );
}
