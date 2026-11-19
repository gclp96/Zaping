'use client';

import axios from 'axios';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useAuthenticatedSession } from '@/app/auth-session';
import {
  canApprovePurchases,
  canEditPurchases,
  hasRole,
  WAREHOUSE_ROLES,
} from '@/app/erp-role-access';
import StatusBadge from '@/app/components/business/StatusBadge';
import Button from '@/app/components/ui/Button';
import ConfirmDialog from '@/app/components/ui/ConfirmDialog';
import Loading from '@/app/components/ui/Loading';
import PageContainer from '@/app/components/ui/layout/PageContainer';
import PageHeader from '@/app/components/ui/layout/PageHeader';
import Section from '@/app/components/ui/layout/Section';
import ForbiddenState from '@/app/components/ui/ForbiddenState';
import { api } from '@/services/api';
import { getApiErrorMessage, isForbiddenError } from '@/services/errors';

import PurchaseFormModal from '../components/PurchaseFormModal';
import PurchaseInventoryMovements from '../components/PurchaseInventoryMovements';
import PurchaseReceiptModal from '../components/PurchaseReceiptModal';
import PurchaseReceiptsHistory from '../components/PurchaseReceiptsHistory';
import { getPurchaseReceiptInventoryHref } from '../../purchase-receipts/receipt-navigation';
import { usePurchaseActions } from '../hooks/usePurchaseActions';
import { usePurchaseForm } from '../hooks/usePurchaseForm';
import { usePurchaseReceipts } from '../hooks/usePurchaseReceipts';
import {
  canRegisterPurchaseReceipt,
  getPurchaseStatusDescriptor,
} from '../purchase-status';
import type {
  InventoryMovement,
  Product,
  Purchase,
  PurchaseReceipt,
  Supplier,
} from '../types';

type ResourceStatus = 'idle' | 'loading' | 'success' | 'error';

const moneyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

const backLink = (
  <Link
    href="/purchases"
    className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 font-medium text-text-secondary transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
  >
    <ArrowLeft aria-hidden="true" size={18} />
    Volver a compras
  </Link>
);

function formatMoney(value: number): string {
  return moneyFormatter.format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(new Date(value));
}

function isNotFoundError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}

function buildReceivedByPurchaseItem(receipts: PurchaseReceipt[]) {
  const receivedByPurchaseItem = new Map<string, number>();

  for (const receipt of receipts) {
    for (const item of receipt.items) {
      const previousQuantity =
        receivedByPurchaseItem.get(item.purchaseItemId) ?? 0;

      receivedByPurchaseItem.set(
        item.purchaseItemId,
        previousQuantity + Math.max(item.quantityReceived, 0),
      );
    }
  }

  return receivedByPurchaseItem;
}

function usePurchase360(purchaseId: string) {
  const sessionState = useAuthenticatedSession();
  const currentUserRole =
    sessionState.status === 'success'
      ? sessionState.user?.role ?? null
      : null;
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [baseLoading, setBaseLoading] = useState(true);
  const [baseError, setBaseError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptsError, setReceiptsError] = useState('');
  const [receiptHistoryStatus, setReceiptHistoryStatus] =
    useState<ResourceStatus>('idle');

  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [movementsError, setMovementsError] = useState('');

  const requestVersion = useRef(0);

  const loadReceipts = useCallback(async () => {
    setReceiptsLoading(true);
    setReceiptsError('');
    setReceiptHistoryStatus('loading');

    try {
      const response = await api.get<PurchaseReceipt[]>(
        `/purchase-receipts/purchase/${purchaseId}`,
      );
      setReceipts(response.data);
      setReceiptHistoryStatus('success');
    } catch (error: unknown) {
      setReceipts([]);
      setReceiptsError(
        getApiErrorMessage(
          error,
          'No fue posible cargar las recepciones de la compra.',
        ),
      );
      setReceiptHistoryStatus('error');
    } finally {
      setReceiptsLoading(false);
    }
  }, [purchaseId]);

  const loadMovements = useCallback(async () => {
    setMovementsLoading(true);
    setMovementsError('');

    try {
      const response = await api.get<InventoryMovement[]>(
        `/purchases/${purchaseId}/inventory-movements`,
      );
      setMovements(response.data);
    } catch (error: unknown) {
      setMovements([]);
      setMovementsError(
        getApiErrorMessage(
          error,
          'No fue posible cargar los movimientos de inventario.',
        ),
      );
    } finally {
      setMovementsLoading(false);
    }
  }, [purchaseId]);

  const loadRelatedResources = useCallback(async () => {
    await Promise.allSettled([loadReceipts(), loadMovements()]);
  }, [loadMovements, loadReceipts]);

  const loadPurchase = useCallback(async () => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;

    setBaseLoading(true);
    setBaseError('');
    setNotFound(false);
    setForbidden(false);
    setPurchase(null);
    setReceipts([]);
    setMovements([]);
    setReceiptsError('');
    setMovementsError('');
    setReceiptHistoryStatus('idle');

    try {
      const response = await api.get<Purchase>(`/purchases/${purchaseId}`);

      if (version !== requestVersion.current) {
        return;
      }

      setPurchase(response.data);
      setBaseLoading(false);
      await loadRelatedResources();
    } catch (error: unknown) {
      if (version !== requestVersion.current) {
        return;
      }

      setNotFound(isNotFoundError(error));
      setForbidden(isForbiddenError(error));
      setBaseError(
        isNotFoundError(error) || isForbiddenError(error)
          ? 'Compra no encontrada'
          : getApiErrorMessage(error, 'No pudimos cargar la compra.'),
      );
      setBaseLoading(false);
    }
  }, [loadRelatedResources, purchaseId]);

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
    void loadPurchase();
  }, [currentUserRole, loadPurchase, sessionState.status]);

  return {
    purchase,
    baseLoading,
    baseError,
    notFound,
    forbidden,
    currentUserRole,
    delegatedCostEditing: sessionState.status === 'success' &&
      sessionState.user.canAdjustPurchaseUnitCost === true,
    receipts,
    receiptsLoading,
    receiptsError,
    receiptHistoryStatus,
    movements,
    movementsLoading,
    movementsError,
    loadPurchase,
    loadReceipts,
    loadMovements,
    loadRelatedResources,
  };
}

export default function Purchase360Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const {
    purchase,
    baseLoading,
    baseError,
    notFound,
    forbidden,
    receipts,
    receiptsLoading,
    receiptsError,
    receiptHistoryStatus,
    movements,
    movementsLoading,
    movementsError,
    loadPurchase,
    loadReceipts,
    loadMovements,
    currentUserRole,
    delegatedCostEditing,
  } = usePurchase360(id);
  const canEdit = canEditPurchases(currentUserRole);
  const canApprove = canApprovePurchases(currentUserRole);
  const canAdjustUnitCost = canApprove || delegatedCostEditing;
  const sessionForbidsAccess = Boolean(
    currentUserRole && !hasRole(currentUserRole, WAREHOUSE_ROLES),
  );

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [catalogError, setCatalogError] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(false);

  const receivedByPurchaseItem = useMemo(
    () =>
      receiptHistoryStatus === 'success'
        ? buildReceivedByPurchaseItem(receipts)
        : new Map<string, number>(),
    [receiptHistoryStatus, receipts],
  );

  const reloadPurchase360 = useCallback(async () => {
    await loadPurchase();
  }, [loadPurchase]);

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
    onPurchaseChanged: reloadPurchase360,
  });

  const {
    openModal,
    saving,
    purchaseToEdit,
    hasUnsavedChanges,
    supplierId,
    commercial,
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
    openEditModal,
    closeCreateModal,
    handleSupplierChange,
    handleCommercialChange,
    handleSelectedProductChange,
    handleFormQuantityChange,
    handleAddProduct,
    handleItemQuantityChange,
    handleItemUnitCostChange,
    handleRemoveItem,
    handleCreatePurchase,
  } = usePurchaseForm({
    products,
    onPurchaseSaved: reloadPurchase360,
    canAdjustUnitCost,
  });

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
    purchaseReceipts: receipts,
    receiptHistoryReady: receiptHistoryStatus === 'success',
    onReceiptCreated: reloadPurchase360,
  });

  async function ensureCatalogsLoaded() {
    if (suppliers.length > 0 && products.length > 0) {
      return true;
    }

    try {
      setCatalogLoading(true);
      setCatalogError('');

      const [suppliersResponse, productsResponse] = await Promise.all([
        api.get<Supplier[]>('/suppliers'),
        api.get<Product[]>('/products'),
      ]);

      setSuppliers(suppliersResponse.data);
      setProducts(productsResponse.data);
      return true;
    } catch (error: unknown) {
      setCatalogError(
        getApiErrorMessage(
          error,
          'No fue posible preparar la edición de la compra.',
        ),
      );
      return false;
    } finally {
      setCatalogLoading(false);
    }
  }

  async function handleEditPurchase(currentPurchase: Purchase) {
    const catalogsReady = await ensureCatalogsLoaded();

    if (catalogsReady) {
      openEditModal(currentPurchase);
    }
  }

  function handleReceivePurchase(currentPurchase: Purchase) {
    if (receiptHistoryStatus !== 'success') {
      return;
    }

    openReceiptModal(currentPurchase);
  }

  function handleViewCreatedReceipt(receiptId: string) {
    closeReceiptModal();
    router.push(`/purchase-receipts/${encodeURIComponent(receiptId)}`);
  }

  function handleViewCreatedReceiptInventory(
    receiptId: string,
    receiptFolio: string,
  ) {
    closeReceiptModal();
    router.push(getPurchaseReceiptInventoryHref(receiptId, receiptFolio));
  }

  if (baseLoading) {
    return (
      <PageContainer size="wide">
        <PageHeader title="Compra" action={backLink} />
        <Loading message="Cargando compra..." />
      </PageContainer>
    );
  }

  if (baseError || !purchase) {
    if (forbidden || sessionForbidsAccess) {
      return (
        <PageContainer size="wide">
          <PageHeader title="Compra" action={backLink} />
          <ForbiddenState />
        </PageContainer>
      );
    }

    return (
      <PageContainer size="wide">
        <PageHeader title="Compra" action={backLink} />
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 sm:flex-row sm:items-center sm:justify-between"
        >
          <span>
            {notFound ? 'Compra no encontrada' : baseError}
          </span>

          <div className="flex flex-col gap-2 sm:flex-row">
            {!notFound ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadPurchase()}
              >
                Reintentar
              </Button>
            ) : null}

            {backLink}
          </div>
        </div>
      </PageContainer>
    );
  }

  const statusDescriptor = getPurchaseStatusDescriptor(purchase.status);
  const canReceive =
    canEdit &&
    canRegisterPurchaseReceipt(purchase.status) &&
    receiptHistoryStatus === 'success';
  const receiveBlocked =
    canEdit &&
    canRegisterPurchaseReceipt(purchase.status) &&
    receiptHistoryStatus !== 'success';

  return (
    <>
      <PageContainer size="wide">
        <div className="space-y-4 rounded-xl border border-border border-t-4 border-t-blue-600 bg-surface p-5 sm:p-6 [&>div:first-child]:mb-0 [&>div:first-child]:flex-col [&>div:first-child]:items-stretch">
          <PageHeader
            title={`Compra ${purchase.folio}`}
            description={`Proveedor: ${purchase.supplier.name}`}
            action={
              <>
                {purchase.status === 'DRAFT' && (canApprove || canEdit) ? (
                  <>
                    {canApprove ? (
                      <Button
                        variant="success"
                        onClick={() => openApproveDialog(purchase)}
                      >
                        Aprobar
                      </Button>
                    ) : null}

                    {canEdit ? (
                      <Button
                        variant="outline"
                        loading={catalogLoading}
                        loadingText="Preparando..."
                        onClick={() => void handleEditPurchase(purchase)}
                      >
                        Editar
                      </Button>
                    ) : null}

                    {canApprove ? (
                      <Button
                        variant="danger"
                        onClick={() => openCancelDialog(purchase)}
                      >
                        Cancelar
                      </Button>
                    ) : null}
                  </>
                ) : null}

                {canReceive || receiveBlocked ? (
                  <Button
                    variant="success"
                    disabled={!canReceive}
                    onClick={() => handleReceivePurchase(purchase)}
                  >
                    Registrar recepción
                  </Button>
                ) : null}

                <Button
                  variant="outline"
                  loading={downloadingPurchaseId === purchase.id}
                  loadingText="Descargando..."
                  onClick={() => void handleDownloadPdf(purchase)}
                >
                  Descargar PDF
                </Button>

                {backLink}
              </>
            }
          />

          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge
              label={statusDescriptor.label}
              tone={statusDescriptor.tone}
              ariaLabel={`Estado de la compra: ${statusDescriptor.label}`}
            />

            {receiveBlocked ? (
              <span className="text-sm text-gray-500">
                Verifica las recepciones antes de registrar una nueva.
              </span>
            ) : null}
          </div>
        </div>

        {actionError || catalogError ? (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{actionError || catalogError}</span>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  clearActionError();
                  setCatalogError('');
                }}
              >
                Cerrar mensaje
              </Button>
            </div>
          </div>
        ) : null}

        <Section title="Resumen">
          <dl className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5">
              <dt className="text-sm text-gray-500">Proveedor</dt>
              <dd className="mt-2 break-words font-semibold text-text">
                {purchase.supplier.name}
              </dd>
            </div>

            <div className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5">
              <dt className="text-sm text-gray-500">Fecha</dt>
              <dd className="mt-1 font-medium text-gray-900">
                {formatDate(purchase.createdAt)}
              </dd>
            </div>

            <div className="min-w-0 rounded-xl border border-border bg-surface p-4 sm:p-5">
              <dt className="text-sm text-gray-500">Recepción</dt>
              <dd className="mt-1 font-medium text-gray-900">
                {purchase.status === 'DRAFT'
                  ? 'Pendiente de aprobación'
                  : purchase.status === 'CANCELLED'
                    ? 'No aplica'
                    : receiptHistoryStatus !== 'success'
                      ? receiptsLoading ? 'Verificando recepciones...' : 'Recepción sin verificar'
                      : `${purchase.receiptProgress.completedLines} / ${purchase.receiptProgress.orderedLines} partidas`}
              </dd>
              {purchase.status !== 'DRAFT' &&
              purchase.status !== 'CANCELLED' &&
              receiptHistoryStatus === 'success' ? (
                <dd className="mt-2 text-sm tabular-nums text-text-secondary">
                  {purchase.receiptProgress.receivedUnits} /{' '}
                  {purchase.receiptProgress.orderedUnits} uds. ·{' '}
                  {purchase.receiptProgress.pendingUnits} pendientes
                </dd>
              ) : null}
            </div>

            <div className="min-w-0 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:p-5">
              <dt className="text-sm text-gray-500">Total</dt>
              <dd className="mt-2 break-words text-2xl font-semibold tabular-nums text-blue-900">
                {formatMoney(purchase.total)}
              </dd>
            </div>
          </dl>
        </Section>

        <Section title="Partidas">
          <p className="text-sm text-text-muted sm:hidden">Desliza la tabla para consultar cantidades e importes.</p>
          <div
            role="region"
            aria-label="Partidas desplazables"
            tabIndex={0}
            className="overflow-x-auto rounded-xl border border-border bg-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600"
          >
            <table className="w-full min-w-[760px] text-sm tabular-nums">
              <caption className="sr-only">
                Partidas de la compra {purchase.folio}
              </caption>
              <thead className="bg-surface-subtle text-text-secondary">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left">
                    SKU
                  </th>
                  <th scope="col" className="px-3 py-2 text-left">
                    Producto
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Pedido
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Recibido
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Pendiente
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Costo
                  </th>
                  <th scope="col" className="px-3 py-2 text-right">
                    Subtotal
                  </th>
                </tr>
              </thead>

              <tbody>
                {purchase.items.map((item) => {
                  const receivedQuantity =
                    receivedByPurchaseItem.get(item.id) ?? 0;
                  const pendingQuantity = Math.max(
                    item.quantity - receivedQuantity,
                    0,
                  );
                  const progressAvailable =
                    receiptHistoryStatus === 'success';

                  return (
                    <tr key={item.id} className="border-t border-border hover:bg-surface-subtle">
                      <td className="px-3 py-4 text-xs font-medium text-text-muted">{item.product.sku}</td>
                      <td className="min-w-48 px-3 py-4 font-semibold text-text">
                        {item.product.name}
                      </td>
                      <td className="px-3 py-4 text-right font-medium">
                        {item.quantity}
                      </td>
                      <td className="bg-blue-50/50 px-3 py-4 text-right font-semibold text-blue-900">
                        {progressAvailable ? receivedQuantity : '—'}
                      </td>
                      <td className="px-3 py-4 text-right font-semibold">
                        {progressAvailable ? pendingQuantity : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-right">
                        {formatMoney(item.price)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-right font-semibold">
                        {formatMoney(item.subtotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Resumen financiero">
          <dl className="ml-auto w-full max-w-xl space-y-4 rounded-xl border border-border bg-surface p-5 text-sm tabular-nums sm:p-6">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">Subtotal</dt>
              <dd className="font-medium text-gray-900">
                {formatMoney(purchase.subtotal)}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">IVA (16%)</dt>
              <dd className="font-medium text-gray-900">
                {formatMoney(purchase.iva)}
              </dd>
            </div>

            <div className="flex flex-wrap justify-between gap-4 border-t border-blue-200 pt-4 text-xl font-semibold text-blue-900">
              <dt>Total</dt>
              <dd>{formatMoney(purchase.total)}</dd>
            </div>
          </dl>
        </Section>

        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <Section title="Recepciones">
            <PurchaseReceiptsHistory
              receipts={receipts}
              loading={receiptsLoading}
              error={receiptsError}
              onRetry={() => void loadReceipts()}
              formatDate={formatDate}
              formatMoney={formatMoney}
            />
          </Section>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 sm:p-6">
          <Section title="Trazabilidad">
            <PurchaseInventoryMovements
              movements={movements}
              loading={movementsLoading}
              error={movementsError}
              onRetry={() => void loadMovements()}
              formatDate={formatDate}
              formatMoney={formatMoney}
            />
          </Section>
        </div>
      </PageContainer>

      <PurchaseFormModal
        isOpen={openModal}
        editing={purchaseToEdit !== null}
        saving={saving}
        hasUnsavedChanges={hasUnsavedChanges}
        suppliers={suppliers}
        products={products}
        supplierId={supplierId}
        commercial={commercial}
        selectedProductId={selectedProductId}
        quantity={quantity}
        items={items}
        supplierError={supplierError}
        productError={productError}
        quantityError={quantityError}
        itemQuantityErrors={itemQuantityErrors}
        itemUnitCostDrafts={itemUnitCostDrafts}
        itemUnitCostErrors={itemUnitCostErrors}
        canAdjustUnitCost={canAdjustUnitCost}
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
        onCommercialChange={handleCommercialChange}
        onSelectedProductChange={handleSelectedProductChange}
        onQuantityChange={handleFormQuantityChange}
        onItemQuantityChange={handleItemQuantityChange}
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
        onClose={closeReceiptModal}
        onItemChange={handleReceiptItemChange}
        onNotesChange={handleReceiptNotesChange}
        onSubmit={() => void handleCreateReceipt()}
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
              ? La compra quedará confirmada y podrá recibir mercancía.
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
        onConfirm={() => void handleApprovePurchase()}
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
              ? La compra permanecerá registrada, pero ya no podrá aprobarse.
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
        onConfirm={() => void handleCancelPurchase()}
      />
    </>
  );
}
