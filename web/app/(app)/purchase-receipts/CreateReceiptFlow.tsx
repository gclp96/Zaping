'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import Button from '@/app/components/ui/Button';
import Input from '@/app/components/ui/Input';
import Modal from '@/app/components/ui/Modal';
import { api } from '@/services/api';
import { getApiErrorMessage } from '@/services/errors';
import PurchaseReceiptModal from '../purchases/components/PurchaseReceiptModal';
import { usePurchaseReceipts } from '../purchases/hooks/usePurchaseReceipts';
import { usePurchaseReceiptPreparation } from '../purchases/hooks/usePurchaseReceiptPreparation';
import { canRegisterPurchaseReceipt } from '../purchases/purchase-status';
import type { Purchase } from '../purchases/types';
import { getPurchaseReceiptInventoryHref } from './receipt-navigation';

function validPurchase(purchase: Purchase): boolean {
  return Boolean(
    purchase && typeof purchase.id === 'string' && purchase.id &&
    typeof purchase.folio === 'string' && purchase.folio &&
    typeof purchase.supplier?.name === 'string' &&
    Array.isArray(purchase.items) && purchase.items.length > 0 &&
    purchase.items.every((item) => item && typeof item.id === 'string' &&
      typeof item.productId === 'string' && Number.isInteger(item.quantity) &&
      item.quantity > 0 && item.product?.id === item.productId &&
      typeof item.product.sku === 'string' && typeof item.product.name === 'string' &&
      ['QUANTITY', 'ASSET', 'SERIALIZED'].includes(item.product.inventoryTracking) &&
      ['NONE', 'OPTIONAL', 'REQUIRED'].includes(item.product.lotTracking)),
  );
}

export default function CreateReceiptFlow({ enabled, onReceiptCreated }: {
  enabled: boolean;
  onReceiptCreated: () => Promise<void>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const version = useRef(0);
  const mounted = useRef(true);
  const opened = useRef(false);
  const inFlight = useRef<string | null>(null);
  const launcher = useRef<HTMLSpanElement>(null);
  const wasOpen = useRef(false);
  const { preparePurchaseForReceipt } = usePurchaseReceiptPreparation();
  const receipt = usePurchaseReceipts({
    purchaseReceipts: [],
    receiptHistoryReady: false,
    onReceiptCreated,
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      version.current += 1;
    };
  }, []);

  useEffect(() => {
    if (wasOpen.current && !open) launcher.current?.querySelector('button')?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!enabled) version.current += 1;
  }, [enabled]);

  function current(attempt: number) {
    return mounted.current && opened.current && version.current === attempt;
  }

  async function loadPurchases() {
    if (!enabled) return;
    const attempt = ++version.current;
    setLoading(true);
    setError('');
    setPurchases([]);
    try {
      const { data } = await api.get<Purchase[]>('/purchases');
      if (!current(attempt)) return;
      if (!Array.isArray(data) || data.some((purchase) =>
        !purchase || typeof purchase.id !== 'string' || typeof purchase.status !== 'string')) {
        throw new Error('La lista de compras está incompleta. Vuelve a intentarlo.');
      }
      const eligible = data.filter((purchase) => canRegisterPurchaseReceipt(purchase.status));
      if (eligible.some((purchase) => !validPurchase(purchase))) {
        throw new Error('La lista de compras está incompleta. Vuelve a intentarlo.');
      }
      setPurchases(eligible.filter((purchase) =>
        !(Number.isFinite(purchase.receiptProgress?.pendingUnits) &&
          purchase.receiptProgress.pendingUnits <= 0),
      ));
    } catch (cause) {
      if (current(attempt)) setError(getApiErrorMessage(cause, 'No fue posible cargar las compras.'));
    } finally {
      if (current(attempt)) setLoading(false);
    }
  }

  function start() {
    if (!enabled || opened.current) return;
    opened.current = true;
    setOpen(true);
    setSearch('');
    setSelectedId(null);
    void loadPurchases();
  }

  function close() {
    if (receipt.receiptSaving) return;
    opened.current = false;
    version.current += 1;
    inFlight.current = null;
    setOpen(false);
    setPreparingId(null);
    setSelectedId(null);
    setError('');
    receipt.closeReceiptModal();
  }

  async function selectPurchase(id: string) {
    if (!enabled || inFlight.current === id) return;
    const attempt = ++version.current;
    inFlight.current = id;
    setPreparingId(id);
    setSelectedId(id);
    setError('');
    receipt.closeReceiptModal();
    try {
      const { data: purchase } = await api.get<Purchase>(`/purchases/${encodeURIComponent(id)}`);
      if (!current(attempt)) return;
      if (!validPurchase(purchase) || purchase.id !== id) {
        throw new Error('El detalle de la compra está incompleto o no corresponde a la selección.');
      }
      if (!canRegisterPurchaseReceipt(purchase.status)) {
        throw new Error('La compra ya no admite recepciones. Actualiza la lista.');
      }
      const result = await preparePurchaseForReceipt(purchase);
      if (!current(attempt)) return;
      if (result.stale || result.receiptsError || result.movementsError) {
        throw new Error('No pudimos verificar el historial y los movimientos de la compra. Reintenta antes de recibir.');
      }
      const itemIds = new Set(purchase.items.map((item) => item.id));
      const productIds = new Set(purchase.items.map((item) => item.productId));
      const receipts = result.purchaseReceipts;
      if (!Array.isArray(receipts) || !Array.isArray(result.inventoryMovements) ||
        receipts.some((previous) => !previous || previous.purchaseId !== id ||
          typeof previous.id !== 'string' || !Array.isArray(previous.items) || previous.items.length === 0 ||
          previous.items.some((item) => !item || !itemIds.has(item.purchaseItemId) ||
            !Number.isInteger(item.quantityReceived) || item.quantityReceived < 0)) ||
        new Set(receipts.map((previous) => previous.id)).size !== receipts.length ||
        result.inventoryMovements.some((movement) => !movement ||
          !productIds.has(movement.productId) || !Number.isFinite(movement.quantity))) {
        throw new Error('La evidencia de la compra está incompleta o es incompatible.');
      }
      // The existing hook alone calculates pending quantities from verified history.
      if (!receipt.openReceiptModal(purchase, { verifiedPurchaseReceipts: receipts })) {
        throw new Error('No fue posible preparar la recepción.');
      }
    } catch (cause) {
      if (current(attempt)) setError(getApiErrorMessage(cause, 'No fue posible verificar la compra.'));
    } finally {
      if (current(attempt)) {
        inFlight.current = null;
        setPreparingId(null);
      }
    }
  }

  const captureReady = Boolean(receipt.purchaseToReceive && receipt.receiptFormItems.length > 0);
  const noPending = Boolean(receipt.purchaseToReceive && !captureReady && !receipt.createdReceipt);
  const candidates = purchases.filter((purchase) =>
    `${purchase.folio} ${purchase.supplier.name}`.toLocaleLowerCase('es-MX')
      .includes(search.trim().toLocaleLowerCase('es-MX')),
  );

  function viewReceipt(id: string) {
    close();
    router.push(`/purchase-receipts/${encodeURIComponent(id)}`);
  }

  return (
    <>
      {enabled ? <span ref={launcher} className="inline-flex">
        <Button onClick={start}><Plus aria-hidden="true" size={18} />Registrar recepción</Button>
      </span> : null}
      <Modal isOpen={enabled && open && !captureReady && !receipt.createdReceipt} onClose={close}
        title="Seleccionar orden de compra"
        description="Selecciona una compra. Verificaremos su detalle, recepciones y movimientos antes de continuar.">
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Las cantidades se verifican al seleccionar la orden.</p>
          {loading ? <p role="status">Cargando compras...</p> : null}
          {error ? <div role="alert" className="space-y-3 rounded-lg bg-red-50 p-4 text-red-800">
            <p>{error}</p>
            <Button variant="outline" onClick={() => selectedId ? void selectPurchase(selectedId) : void loadPurchases()}>
              Reintentar verificación
            </Button>
          </div> : null}
          {noPending ? <p role="alert">La compra no tiene cantidades pendientes verificadas.</p> : null}
          {!loading ? <>
            <Input label="Buscar OC por folio o proveedor" type="search" value={search}
              onChange={(event) => setSearch(event.target.value)} />
            {candidates.length === 0 && !error ? <p>No hay órdenes de compra elegibles que coincidan.</p> : null}
            <ul className="space-y-3">
              {candidates.map((purchase) => <li key={purchase.id}
                className="flex flex-col gap-3 rounded-xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-semibold text-blue-800">{purchase.folio}</p>
                  <p className="break-words text-sm">{purchase.supplier.name}</p>
                  <p className="text-sm text-text-muted">{Number.isFinite(purchase.receiptProgress?.pendingUnits)
                    ? `Pendientes estimados: ${purchase.receiptProgress.pendingUnits} unidades`
                    : 'Pendientes por verificar'}</p>
                </div>
                <Button variant="outline" loading={preparingId === purchase.id} loadingText="Verificando..."
                  aria-label={`Seleccionar ${purchase.folio}`} onClick={() => void selectPurchase(purchase.id)}>
                  Seleccionar<span className="sr-only"> {purchase.folio}</span>
                </Button>
              </li>)}
            </ul>
          </> : null}
          <div className="flex flex-wrap items-center gap-3">
            {!loading ? <Button variant="outline" disabled={Boolean(preparingId)} onClick={() => {
              receipt.closeReceiptModal(); setSelectedId(null); void loadPurchases();
            }}>Actualizar</Button> : null}
            <Button variant="secondary" onClick={close}>Cerrar</Button>
          </div>
        </div>
      </Modal>
      <PurchaseReceiptModal
        isOpen={enabled && open && (captureReady || receipt.createdReceipt !== null)}
        purchase={receipt.purchaseToReceive} receiptAuthority={receipt.receiptAuthority}
        receiptAuthorityError={receipt.receiptAuthorityError} onRetryAuthority={receipt.retryReceiptAuthority}
        items={receipt.receiptFormItems} notes={receipt.receiptNotes}
        supplierDocumentType={receipt.supplierDocumentType} supplierDocumentNumber={receipt.supplierDocumentNumber}
        onSupplierDocumentTypeChange={receipt.setSupplierDocumentType}
        onSupplierDocumentNumberChange={receipt.setSupplierDocumentNumber}
        saving={receipt.receiptSaving} error={receipt.receiptFormError} fieldErrors={receipt.receiptFieldErrors}
        createdReceipt={receipt.createdReceipt} onClose={close}
        onItemChange={receipt.handleReceiptItemChange} onNotesChange={receipt.handleReceiptNotesChange}
        onSubmit={() => { if (enabled) void receipt.handleCreateReceipt(); }} onViewReceipt={viewReceipt}
        onViewInventory={(id, folio) => { close(); router.push(getPurchaseReceiptInventoryHref(id, folio)); }}
      />
      <Modal isOpen={!enabled && open && receipt.createdReceipt !== null} onClose={close}
        title="Recepción confirmada">
        <div className="space-y-4">
          <p>La API confirmó el registro. No tienes permiso para consultar el historial actualizado.</p>
          <p className="text-xl font-semibold">{receipt.createdReceipt?.folio}</p>
          <Button variant="secondary" onClick={close}>Cerrar</Button>
        </div>
      </Modal>
    </>
  );
}
