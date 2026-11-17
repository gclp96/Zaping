import DateInput from '@/app/components/business/DateInput';
import { CircleCheck } from 'lucide-react';
import { useState } from 'react';

import Button from '@/app/components/ui/Button';
import ConfirmDialog from '@/app/components/ui/ConfirmDialog';
import Input from '@/app/components/ui/Input';
import Modal from '@/app/components/ui/Modal';

import ReceiptCaptureSummary from './ReceiptCaptureSummary';

import { hasOptionalReceiptTraceability } from '../receipt-traceability';

import type {
  ReceiptAuthority,
  CreatedPurchaseReceipt,
  PurchaseReceiptFieldErrors,
  PurchaseReceiptFormField,
  PurchaseReceiptFormItem,
} from '../types';

type PurchaseReceiptModalProps = {
  isOpen: boolean;

  purchase: {
    folio: string;
    supplier: {
      name: string;
    };
  } | null;

  receiptAuthority: ReceiptAuthority | null;
  receiptAuthorityError: string;
  onRetryAuthority: () => void;
  items: PurchaseReceiptFormItem[];
  notes: string;
  supplierDocumentType: string;
  supplierDocumentNumber: string;
  onSupplierDocumentTypeChange: (value: string) => void;
  onSupplierDocumentNumberChange: (value: string) => void;
  saving: boolean;
  error: string;
  fieldErrors?: PurchaseReceiptFieldErrors;
  createdReceipt: CreatedPurchaseReceipt | null;

  onClose: () => void;

  onItemChange: (
    purchaseItemId: string,
    field: PurchaseReceiptFormField,
    value: string,
  ) => void;

  onNotesChange: (value: string) => void;
  onSubmit: () => void;
  onViewReceipt: (receiptId: string) => void;
  onViewInventory: (receiptId: string, receiptFolio: string) => void;
};

type ReceiptLayout = 'desktop' | 'mobile';

function getReceiptFieldId(
  purchaseItemId: string,
  field: PurchaseReceiptFormField,
  layout: ReceiptLayout,
): string {
  return `receipt-${layout}-${field}-${purchaseItemId}`;
}

export default function PurchaseReceiptModal({
  isOpen,
  purchase,
  receiptAuthority,
  receiptAuthorityError,
  onRetryAuthority,
  items,
  notes,
  supplierDocumentType,
  supplierDocumentNumber,
  onSupplierDocumentTypeChange,
  onSupplierDocumentNumberChange,
  saving,
  error,
  fieldErrors = {},
  createdReceipt,
  onClose,
  onItemChange,
  onNotesChange,
  onSubmit,
  onViewReceipt,
  onViewInventory,
}: PurchaseReceiptModalProps) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const hasUnsavedChanges =
    items.some((item) =>
      item.quantityReceived.trim() !== '' ||
      item.lotNumber.trim() !== '' ||
      item.expirationDate.trim() !== '',
    ) ||
    notes.trim() !== '' ||
    supplierDocumentType !== '' ||
    supplierDocumentNumber.trim() !== '';

  function requestClose() {
    if (saving) return;
    if (process.env.NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE === 'true' &&
        !createdReceipt && purchase && hasUnsavedChanges) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  function discardAndClose() {
    setConfirmDiscard(false);
    onClose();
  }

  // Keep the diagnostic code in receiptAuthorityError; translate only its presentation.
  const authorityErrorMessage =
    receiptAuthorityError === 'CUTOVER_FROZEN'
      ? 'No es posible registrar recepciones mientras se realiza la transición del inventario. Contacta al administrador.'
      : receiptAuthorityError;
  const hasAssetItems = items.some(
    (item) => item.inventoryTracking === 'ASSET',
  );

  const workspaceEnabled =
    process.env.NEXT_PUBLIC_ZAPING_RECEIPTS_WORKSPACE === 'true' &&
    !createdReceipt;
  // RR-002 uses the same validated inputs and callbacks in both entrypoints.
  // Only presentation changes; the POST and permissions stay untouched.
  const actions = (
    <div
      className={
        workspaceEnabled
          ? 'flex flex-col-reverse justify-end gap-3 sm:flex-row'
          : 'sticky bottom-0 -mx-6 flex flex-col-reverse justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4 sm:flex-row'
      }
    >
      <Button
        variant="secondary"
        className="w-full sm:w-auto"
        disabled={saving}
        onClick={requestClose}
      >
        Cancelar
      </Button>
      <Button
        variant="success"
        className="w-full sm:w-auto"
        loading={saving}
        loadingText="Registrando..."
        disabled={saving || !receiptAuthority || items.length === 0}
        onClick={onSubmit}
      >
        Registrar recepción
      </Button>
    </div>
  );

  return (
    <>
    <Modal
      isOpen={isOpen}
      layout={workspaceEnabled ? 'workspace' : 'default'}
      footer={workspaceEnabled ? actions : undefined}
      onClose={requestClose}
      title={
        createdReceipt
          ? 'Recepción registrada correctamente'
          : purchase
            ? `Registrar recepción · ${purchase.folio}`
            : 'Registrar recepción'
      }
    >
      {createdReceipt ? (
        <div className="space-y-6 py-2">
          <div className="flex items-start gap-3">
            <CircleCheck
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-green-600"
              size={28}
            />

            <div>
              <p className="text-sm text-gray-500">Folio de recepción</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">
                {createdReceipt.folio}
              </p>
              <p className="mt-3 text-gray-600">
                La recepción quedó registrada y ya puedes consultar su
                trazabilidad.
              </p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={onClose}
            >
              Cerrar
            </Button>

            <Button
              className="w-full sm:w-auto"
              onClick={() => onViewReceipt(createdReceipt.id)}
            >
              Ver recepción
            </Button>

            <Button
              className="w-full sm:w-auto"
              onClick={() =>
                onViewInventory(createdReceipt.id, createdReceipt.folio)
              }
            >
              Ver en inventario
            </Button>
          </div>
        </div>
      ) : purchase ? (
        <div
          data-testid="receipt-capture-content"
          className={workspaceEnabled ? 'space-y-5' : 'space-y-6'}
        >
          <section
            data-testid="receipt-purchase-context"
            aria-label="Datos de la compra origen"
            className={
              workspaceEnabled
                ? 'rounded-xl border border-border bg-surface-subtle p-4 sm:p-5'
                : 'rounded-lg bg-gray-50 p-4'
            }
          >
            {workspaceEnabled ? (
              <div className="mb-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Compra origen
                </p>
                <p className="mt-1 break-words text-lg font-semibold text-text">
                  {purchase.folio}
                </p>
              </div>
            ) : null}
            <p className="text-sm text-gray-500">Proveedor</p>
            <p className="break-words font-semibold">
              {purchase.supplier.name}
            </p>
          </section>

          {!receiptAuthority ? (
            receiptAuthorityError ? (
              <div
                role="alert"
                className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
              >
                <p>{authorityErrorMessage}</p>
                <Button variant="secondary" onClick={onRetryAuthority}>
                  Reintentar verificación
                </Button>
              </div>
            ) : (
              <p role="status">Verificando disponibilidad de recepción...</p>
            )
          ) : null}
          {receiptAuthority === 'PHYSICAL' &&
          items.some((item) => item.inventoryTracking === 'QUANTITY') ? (
            <p className="text-sm text-gray-600">
              Para productos por cantidad, lote y caducidad son opcionales e
              independientes. Captúralos si el proveedor los informa.
            </p>
          ) : null}
          <section
            data-testid="receipt-item-capture-section"
            aria-label="Partidas pendientes de recibir"
            className={
              workspaceEnabled
                ? 'space-y-4 rounded-xl border border-border bg-white p-4 sm:p-5'
                : 'space-y-4'
            }
          >
            {workspaceEnabled ? (
              <div>
                <h3 className="text-lg font-semibold text-text">
                  Partidas pendientes
                </h3>
                <p className="mt-1 text-sm text-text-muted">
                  Captura únicamente la cantidad que recibes ahora. Pedido,
                  recibido y pendiente son datos de consulta.
                </p>
              </div>
            ) : null}
          {items.length === 0 ? (
            <div className="rounded-lg border border-gray-200 p-4">
              <p className="text-sm text-gray-600">
                Esta compra ya fue recibida completamente.
              </p>
            </div>
          ) : (
            <>
              {hasAssetItems ? (
                <div
                  role="note"
                  aria-label="Información sobre generación de equipos"
                  className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"
                >
                  <p className="font-semibold">Productos que generan equipos</p>
                  <p className="mt-1">
                    Esta recepción incluye productos ASSET. Al registrarla se
                    generarán equipos individuales para esas partidas.
                  </p>
                </div>
              ) : null}

              <div
                data-testid="receipt-desktop-items"
                className={
                  workspaceEnabled
                    ? 'hidden overflow-x-auto rounded-lg border border-gray-200 lg:block'
                    : 'hidden overflow-x-auto rounded-lg border border-gray-200 xl:block'
                }
              >
                <table
                  className={
                    workspaceEnabled
                      ? 'w-full min-w-[940px] text-sm'
                      : 'w-full min-w-[760px] text-sm'
                  }
                >
                  <caption className="sr-only">
                    Líneas pendientes de la recepción de la compra{' '}
                    {purchase.folio}
                  </caption>

                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="w-[27%] px-3 py-3 text-left">
                        Producto
                      </th>

                      <th scope="col" className="w-[9%] px-3 py-3 text-right">
                        Pedido
                      </th>

                      <th scope="col" className="w-[10%] px-3 py-3 text-right">
                        Recibido
                      </th>

                      <th scope="col" className="w-[10%] px-3 py-3 text-right">
                        Pendiente
                      </th>

                      <th scope="col" className="w-[16%] px-3 py-3 text-left">
                        Recibir ahora
                      </th>

                      <th scope="col" className="w-[15%] px-3 py-3 text-left">
                        Lote
                      </th>

                      <th scope="col" className="w-[13%] px-3 py-3 text-left">
                        Caducidad
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {items.map((item) => {
                      const itemErrors = fieldErrors[item.purchaseItemId];
                      const quantityId = getReceiptFieldId(
                        item.purchaseItemId,
                        'quantityReceived',
                        'desktop',
                      );
                      const lotId = getReceiptFieldId(
                        item.purchaseItemId,
                        'lotNumber',
                        'desktop',
                      );
                      const expirationId = getReceiptFieldId(
                        item.purchaseItemId,
                        'expirationDate',
                        'desktop',
                      );

                      return (
                        <tr
                          key={item.purchaseItemId}
                          className="border-t border-gray-200 align-top"
                        >
                          <td className="px-3 py-3">
                            <p className="font-medium">{item.name}</p>

                            <p className="text-xs text-gray-500">{item.sku}</p>

                            {item.inventoryTracking === 'ASSET' ? (
                              <p
                                className="mt-2 text-xs text-blue-800"
                                role="note"
                              >
                                Al registrar esta recepción se generarán equipos
                                individuales para esta partida.
                              </p>
                            ) : null}
                          </td>

                          <td className="px-3 py-3 text-right">
                            {item.orderedQuantity}
                          </td>

                          <td className="px-3 py-3 text-right">
                            {item.receivedQuantity}
                          </td>

                          <td className="px-3 py-3 text-right font-semibold">
                            {item.pendingQuantity}
                          </td>

                          <td className="px-3 py-3">
                            <Input
                              disabled={saving || !receiptAuthority}
                              id={quantityId}
                              label="Recibir ahora"
                              aria-label={`Cantidad recibida de ${item.name}`}
                              type="number"
                              min={1}
                              max={item.pendingQuantity}
                              step={1}
                              value={item.quantityReceived}
                              error={itemErrors?.quantityReceived}
                              onChange={(event) =>
                                onItemChange(
                                  item.purchaseItemId,
                                  'quantityReceived',
                                  event.target.value,
                                )
                              }
                            />
                          </td>

                          <td className="px-3 py-3">
                            {item.lotTracking === 'NONE' &&
                            !hasOptionalReceiptTraceability(
                              receiptAuthority,
                              item,
                            ) ? (
                              <span
                                aria-label="Lote: no aplica"
                                className="text-gray-500"
                              >
                                No aplica
                              </span>
                            ) : (
                              <Input
                                disabled={saving || !receiptAuthority}
                                id={lotId}
                                label={
                                  item.lotTracking === 'REQUIRED' &&
                                  !hasOptionalReceiptTraceability(
                                    receiptAuthority,
                                    item,
                                  )
                                    ? 'Lote'
                                    : 'Lote (opcional)'
                                }
                                aria-label={`Lote de ${item.name}`}
                                placeholder="Ej. LOTE-001"
                                required={
                                  item.lotTracking === 'REQUIRED' &&
                                  !hasOptionalReceiptTraceability(
                                    receiptAuthority,
                                    item,
                                  )
                                }
                                value={item.lotNumber}
                                error={itemErrors?.lotNumber}
                                helperText={
                                  item.lotTracking === 'REQUIRED' &&
                                  !hasOptionalReceiptTraceability(
                                    receiptAuthority,
                                    item,
                                  )
                                    ? 'Requerido para esta partida.'
                                    : 'Opcional.'
                                }
                                onChange={(event) =>
                                  onItemChange(
                                    item.purchaseItemId,
                                    'lotNumber',
                                    event.target.value,
                                  )
                                }
                              />
                            )}
                          </td>

                          <td className="px-3 py-3">
                            {item.lotTracking === 'NONE' &&
                            !hasOptionalReceiptTraceability(
                              receiptAuthority,
                              item,
                            ) ? (
                              <span
                                aria-label="Caducidad: no aplica"
                                className="text-gray-500"
                              >
                                No aplica
                              </span>
                            ) : (
                              <DateInput
                                disabled={saving || !receiptAuthority}
                                id={expirationId}
                                label="Caducidad (opcional)"
                                aria-label={`Caducidad de ${item.name}`}
                                value={item.expirationDate}
                                error={itemErrors?.expirationDate}
                                helperText={
                                  hasOptionalReceiptTraceability(
                                    receiptAuthority,
                                    item,
                                  )
                                    ? 'Opcional, incluso sin lote.'
                                    : 'Requiere número de lote.'
                                }
                                onValueChange={(value) =>
                                  onItemChange(
                                    item.purchaseItemId,
                                    'expirationDate',
                                    value,
                                  )
                                }
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div
                data-testid="receipt-mobile-items"
                className={
                  workspaceEnabled
                    ? 'space-y-4 lg:hidden'
                    : 'space-y-4 xl:hidden'
                }
              >
                {items.map((item) => {
                  const itemErrors = fieldErrors[item.purchaseItemId];
                  const identityId = `receipt-mobile-item-${item.purchaseItemId}`;
                  const quantityId = getReceiptFieldId(
                    item.purchaseItemId,
                    'quantityReceived',
                    'mobile',
                  );
                  const lotId = getReceiptFieldId(
                    item.purchaseItemId,
                    'lotNumber',
                    'mobile',
                  );
                  const expirationId = getReceiptFieldId(
                    item.purchaseItemId,
                    'expirationDate',
                    'mobile',
                  );

                  return (
                    <section
                      key={item.purchaseItemId}
                      aria-labelledby={identityId}
                      data-testid={identityId}
                      className="rounded-lg border border-gray-200 p-4"
                    >
                      <div>
                        <h3
                          id={identityId}
                          className="font-semibold text-gray-900"
                        >
                          {item.name}
                        </h3>
                        <p className="text-sm text-gray-500">{item.sku}</p>
                      </div>

                      <div className="mt-4 rounded-lg bg-gray-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Cantidades históricas
                        </p>

                        <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <dt className="text-gray-500">Pedido</dt>
                            <dd className="mt-1 font-semibold text-gray-900">
                              {item.orderedQuantity}
                            </dd>
                          </div>

                          <div>
                            <dt className="text-gray-500">Recibido</dt>
                            <dd className="mt-1 font-semibold text-gray-900">
                              {item.receivedQuantity}
                            </dd>
                          </div>

                          <div>
                            <dt className="text-gray-500">Pendiente</dt>
                            <dd className="mt-1 font-semibold text-gray-900">
                              {item.pendingQuantity}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
                        <Input
                          disabled={saving || !receiptAuthority}
                          id={quantityId}
                          label="Recibir ahora"
                          aria-label={`Cantidad recibida de ${item.name}`}
                          type="number"
                          min={1}
                          max={item.pendingQuantity}
                          step={1}
                          value={item.quantityReceived}
                          error={itemErrors?.quantityReceived}
                          helperText={`Máximo pendiente: ${item.pendingQuantity}.`}
                          onChange={(event) =>
                            onItemChange(
                              item.purchaseItemId,
                              'quantityReceived',
                              event.target.value,
                            )
                          }
                        />
                      </div>

                      {item.lotTracking === 'NONE' &&
                      !hasOptionalReceiptTraceability(
                        receiptAuthority,
                        item,
                      ) ? (
                        <p className="mt-4 text-sm text-gray-500">
                          Lote y caducidad: no aplica.
                        </p>
                      ) : (
                        <fieldset className="mt-4 space-y-4 rounded-lg border border-gray-200 p-3">
                          <legend className="px-1 text-sm font-semibold text-gray-700">
                            Trazabilidad de lote
                          </legend>

                          <Input
                            disabled={saving || !receiptAuthority}
                            id={lotId}
                            label={
                              item.lotTracking === 'REQUIRED' &&
                              !hasOptionalReceiptTraceability(
                                receiptAuthority,
                                item,
                              )
                                ? 'Lote'
                                : 'Lote (opcional)'
                            }
                            aria-label={`Lote de ${item.name}`}
                            placeholder="Ej. LOTE-001"
                            required={
                              item.lotTracking === 'REQUIRED' &&
                              !hasOptionalReceiptTraceability(
                                receiptAuthority,
                                item,
                              )
                            }
                            value={item.lotNumber}
                            error={itemErrors?.lotNumber}
                            helperText={
                              item.lotTracking === 'REQUIRED' &&
                              !hasOptionalReceiptTraceability(
                                receiptAuthority,
                                item,
                              )
                                ? 'Requerido para esta partida.'
                                : 'Opcional.'
                            }
                            onChange={(event) =>
                              onItemChange(
                                item.purchaseItemId,
                                'lotNumber',
                                event.target.value,
                              )
                            }
                          />

                          <DateInput
                            disabled={saving || !receiptAuthority}
                            id={expirationId}
                            label="Caducidad (opcional)"
                            aria-label={`Caducidad de ${item.name}`}
                            value={item.expirationDate}
                            error={itemErrors?.expirationDate}
                            helperText={
                              hasOptionalReceiptTraceability(
                                receiptAuthority,
                                item,
                              )
                                ? 'Opcional, incluso sin lote.'
                                : 'Requiere número de lote.'
                            }
                            onValueChange={(value) =>
                              onItemChange(
                                item.purchaseItemId,
                                'expirationDate',
                                value,
                              )
                            }
                          />
                        </fieldset>
                      )}

                      {item.inventoryTracking === 'ASSET' ? (
                        <p role="note" className="mt-4 text-sm text-blue-800">
                          Al registrar esta recepción se generarán equipos
                          individuales para esta partida.
                        </p>
                      ) : null}
                    </section>
                  );
                })}
              </div>
            </>
          )}
          </section>

          <section
            data-testid="receipt-supplier-document-section"
            aria-label="Documento y observaciones de la recepción"
            className={
              workspaceEnabled
                ? 'space-y-4 rounded-xl border border-border bg-white p-4 sm:p-5'
                : 'space-y-6'
            }
          >
            {workspaceEnabled ? (
              <div>
                <h3 className="text-lg font-semibold text-text">
                  Documento del proveedor y notas
                </h3>
                <p className="mt-1 text-sm text-text-muted">
                  Estos datos describen la recepción; no representan
                  documentos adjuntos.
                </p>
              </div>
            ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="receipt-supplier-document-type"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Documento del proveedor (opcional)
              </label>
              <select
                disabled={saving || !receiptAuthority}
                id="receipt-supplier-document-type"
                value={supplierDocumentType}
                onChange={(event) =>
                  onSupplierDocumentTypeChange(event.target.value)
                }
                className="w-full rounded-lg border border-gray-300 p-2 text-sm"
              >
                <option value="">Sin documento</option>
                <option value="FACTURA">Factura</option>
                <option value="REMISION">Remisión</option>
                <option value="NOTA_ENTREGA">Nota de entrega</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="receipt-supplier-document-number"
                className="mb-2 block text-sm font-medium text-gray-700"
              >
                Número del documento
              </label>
              <input
                disabled={saving || !receiptAuthority}
                id="receipt-supplier-document-number"
                maxLength={100}
                value={supplierDocumentNumber}
                onChange={(event) =>
                  onSupplierDocumentNumberChange(event.target.value)
                }
                placeholder="Ej. FAC-10293"
                className="w-full rounded-lg border border-gray-300 p-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="receipt-notes"
              className="mb-2 block text-sm font-medium text-gray-700"
            >
              Notas
            </label>

            <textarea
              disabled={saving || !receiptAuthority}
              id="receipt-notes"
              rows={3}
              maxLength={1000}
              value={notes}
              placeholder="Observaciones de la recepción..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              onChange={(event) => onNotesChange(event.target.value)}
            />
          </div>
          </section>

          {workspaceEnabled ? (
            <div
              data-testid="receipt-lower-area"
              className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)]"
            >
              <p className="min-w-0 text-sm text-text-muted lg:col-start-1">
                Los documentos se adjuntan después de registrar la recepción, desde su página de detalle.
              </p>
              <div className="min-w-0 lg:col-start-2">
                <ReceiptCaptureSummary items={items} />
              </div>
            </div>
          ) : null}

          {!workspaceEnabled ? (
            <p className="text-sm text-text-muted">
              Los documentos se adjuntan después de registrar la recepción, desde su página de detalle.
            </p>
          ) : null}
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          ) : null}

          {!workspaceEnabled ? actions : null}
        </div>
      ) : null}
    </Modal>
    <ConfirmDialog
      isOpen={isOpen && confirmDiscard && !saving && !createdReceipt}
      title="Descartar cambios de la recepción"
      message="Hay información capturada que todavía no se ha registrado. Si sales, se perderán las cantidades, la trazabilidad, las notas y los documentos del proveedor."
      confirmText="Descartar cambios"
      cancelText="Continuar captura"
      confirmVariant="danger"
      onClose={() => setConfirmDiscard(false)}
      onConfirm={discardAndClose}
    />
    </>
  );
}
