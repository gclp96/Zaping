import { useState } from 'react';

import ProductSelector from '@/app/components/business/ProductSelector';
import MoneyInput from '@/app/components/business/MoneyInput';
import SupplierSelector from '@/app/components/business/SupplierSelector';

import Button from '@/app/components/ui/Button';
import ConfirmDialog from '@/app/components/ui/ConfirmDialog';
import Input from '@/app/components/ui/Input';
import Modal from '@/app/components/ui/Modal';

import type {
  Product,
  PurchaseFormItem,
  PurchaseCommercialForm,
  PurchaseCommercialFormField,
  Supplier,
} from '../types';

type PurchaseFormModalProps = {
  isOpen: boolean;
  editing: boolean;
  saving: boolean;
  hasUnsavedChanges: boolean;

  suppliers: Supplier[];
  products: Product[];

  supplierId: string;
  commercial: PurchaseCommercialForm;
  selectedProductId: string;
  quantity: string;
  items: PurchaseFormItem[];

  supplierError: string;
  productError: string;
  quantityError: string;
  itemQuantityErrors: Record<string, string>;
  itemUnitCostDrafts?: Record<string, string>;
  itemUnitCostErrors?: Record<string, string>;
  itemDiscountDrafts?: Record<string, string>;
  itemDiscountErrors?: Record<string, string>;
  canAdjustUnitCost?: boolean;
  itemsError: string;

  subtotal: number;
  iva: number;
  total: number;

  formatMoney: (value: number) => string;

  onClose: () => void;
  onSubmit: () => void;
  onAddProduct: () => void;
  onRemoveItem: (productId: string) => void;

  onSupplierChange: (value: string) => void;
  onCommercialChange: (field: PurchaseCommercialFormField, value: string) => void;
  onSelectedProductChange: (value: string) => void;
  onQuantityChange: (value: string) => void;
  onItemQuantityChange: (
    productId: string,
    value: string,
  ) => void;
  onItemUnitCostChange?: (productId: string, value: string) => void;
  onItemDiscountChange?: (productId: string, value: string) => void;
};

function getItemSubtotal(item: PurchaseFormItem): number {
  const parsedQuantity = Number(item.quantity);

  return Number.isFinite(parsedQuantity)
    ? parsedQuantity * item.unitCost
    : 0;
}

export default function PurchaseFormModal({
  isOpen,
  editing,
  saving,
  hasUnsavedChanges,
  suppliers,
  products,
  supplierId,
  commercial,
  selectedProductId,
  quantity,
  items,
  supplierError,
  productError,
  quantityError,
  itemQuantityErrors,
  itemUnitCostDrafts = {},
  itemUnitCostErrors = {},
  itemDiscountDrafts = {},
  itemDiscountErrors = {},
  canAdjustUnitCost = false,
  itemsError,
  subtotal,
  iva,
  total,
  formatMoney,
  onClose,
  onSubmit,
  onAddProduct,
  onRemoveItem,
  onSupplierChange,
  onCommercialChange,
  onSelectedProductChange,
  onQuantityChange,
  onItemQuantityChange,
  onItemUnitCostChange,
  onItemDiscountChange,
}: PurchaseFormModalProps) {
  // PUR-UX-02C: create and DRAFT edit use the same visual workspace.
  // Edit eligibility and POST/PATCH behavior stay in the purchase hook.
  const workspaceEnabled =
    process.env.NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE === 'true';
  const supplierName =
    suppliers.find((supplier) => supplier.id === supplierId)?.name ??
    'Sin seleccionar';
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // usePurchaseForm compares editing values against the original DRAFT;
  // preloaded products alone must not trigger a discard confirmation.
  function requestClose() {
    if (saving) return;

    if (workspaceEnabled && hasUnsavedChanges) {
      setConfirmDiscard(true);
      return;
    }

    onClose();
  }

  function discardAndClose() {
    if (saving) return;
    setConfirmDiscard(false);
    onClose();
  }

  const actions = (
    <footer
      data-testid="purchase-form-footer"
      className={
        workspaceEnabled
          ? 'w-full'
          : 'sticky bottom-0 z-10 -mx-6 mt-6 border-t border-gray-200 bg-white/95 px-6 pb-2 pt-4 shadow-[0_-4px_12px_rgba(15,23,42,0.08)] backdrop-blur'
      }
    >
      {itemsError ? (
        <p role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {itemsError}
        </p>
      ) : null}
      <div className={workspaceEnabled
        ? 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'
        : ''}>
        {workspaceEnabled && items.length > 0 ? (
          <p className="flex items-baseline gap-2 text-sm text-text-muted">
            Total de la compra
            <strong className="text-lg font-semibold text-text tabular-nums">
              {formatMoney(total)}
            </strong>
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          className="w-full sm:w-auto"
          onClick={requestClose}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          loading={saving}
          loadingText={editing ? 'Guardando cambios...' : 'Guardando...'}
          disabled={saving || !supplierId || items.length === 0 || Object.keys(itemUnitCostErrors).length > 0 || Object.keys(itemDiscountErrors).length > 0}
          className="w-full sm:min-w-40 sm:w-auto"
          onClick={onSubmit}
        >
          {editing ? 'Guardar cambios' : 'Crear compra'}
        </Button>
        </div>
      </div>
    </footer>
  );

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={requestClose}
      dismissible={!saving}
      title={editing ? 'Editar compra' : 'Nueva compra'}
      layout={workspaceEnabled ? 'workspace' : 'default'}
      footer={workspaceEnabled ? actions : undefined}
    >
      <div
        data-testid="purchase-form-content"
        className={workspaceEnabled ? 'space-y-3 pb-1' : 'space-y-6 pb-2'}
      >
        <section
          aria-labelledby="purchase-form-details-heading"
          data-testid="purchase-form-details"
          className={
            workspaceEnabled
              ? 'space-y-3 rounded-xl border border-border bg-surface-subtle p-3 sm:p-4'
              : 'space-y-4'
          }
        >
          <h3
            id="purchase-form-details-heading"
            className={
              workspaceEnabled
                ? 'text-sm font-semibold uppercase tracking-wide text-text-muted'
                : 'text-sm font-semibold uppercase tracking-wide text-gray-500'
            }
          >
            {workspaceEnabled ? 'Proveedor de la compra' : 'Datos de la compra'}
          </h3>

          <SupplierSelector
            options={suppliers}
            value={supplierId}
            onChange={onSupplierChange}
            searchable={workspaceEnabled}
            required
            error={supplierError}
            helperText="Proveedor que surtirá la orden de compra."
          />
        </section>

        <section
          aria-labelledby="purchase-commercial-heading"
          className="rounded-xl border border-border bg-white p-3 sm:p-4"
        >
          <h3
            id="purchase-commercial-heading"
            className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted"
          >
            Condiciones comerciales
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Condiciones de pago"
              placeholder="Ej. Crédito a 30 días"
              value={commercial.paymentTerms}
              disabled={saving}
              onChange={(event) => onCommercialChange('paymentTerms', event.target.value)}
            />
            <Input
              label="Método de pago"
              placeholder="Ej. Transferencia electrónica"
              value={commercial.paymentMethod}
              disabled={saving}
              onChange={(event) => onCommercialChange('paymentMethod', event.target.value)}
            />
            <Input
              label="Fecha de pago"
              type="date"
              value={commercial.paymentDueDate}
              disabled={saving}
              onChange={(event) => onCommercialChange('paymentDueDate', event.target.value)}
            />
            <Input
              label="Fecha comprometida de entrega"
              type="date"
              value={commercial.expectedDeliveryDate}
              disabled={saving}
              onChange={(event) => onCommercialChange('expectedDeliveryDate', event.target.value)}
            />
            <Input
              label="Comprador"
              placeholder="Responsable de la compra"
              value={commercial.buyerName}
              disabled={saving}
              onChange={(event) => onCommercialChange('buyerName', event.target.value)}
            />
          </div>
        </section>

        <section
          aria-labelledby="purchase-form-add-item-heading"
          data-testid="purchase-form-add-item"
          className={
            workspaceEnabled
              ? 'rounded-xl border border-border bg-white p-3 sm:p-4'
              : 'rounded-lg border border-gray-200 bg-gray-50/60 p-4 sm:p-5'
          }
        >
          <div className={workspaceEnabled ? 'mb-3' : 'mb-4'}>
            <h3
              id="purchase-form-add-item-heading"
              className="font-semibold text-gray-900"
            >
              {workspaceEnabled ? 'Agregar productos' : 'Agregar partida'}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Selecciona un producto y define la cantidad inicial.
            </p>
          </div>

          <div className={workspaceEnabled ? 'space-y-3' : 'space-y-4'}>
            <ProductSelector
              options={products}
              value={selectedProductId}
              excludedProductIds={items.map(
                (item) => item.productId,
              )}
              priceMode="cost"
              collapseSearchOnSelection={workspaceEnabled}
              onChange={onSelectedProductChange}
              error={productError}
              helperText={workspaceEnabled ? undefined : 'Busca por nombre, SKU, código de barras, marca o categoría.'}
            />

            <div className={workspaceEnabled
              ? 'grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'
              : 'grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end'}>
              <Input
                label="Cantidad"
                type="number"
                min={1}
                step={1}
                value={quantity}
                error={quantityError}
                onChange={(event) =>
                  onQuantityChange(event.target.value)
                }
              />

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={onAddProduct}
              >
                Agregar producto
              </Button>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="purchase-form-items-heading"
          data-testid="purchase-form-items"
          className={
            workspaceEnabled
              ? 'space-y-2 rounded-xl border border-border bg-white p-3 sm:p-4'
              : 'space-y-3'
          }
        >
          <div className="flex items-baseline justify-between gap-4">
            <h3
              id="purchase-form-items-heading"
              className="font-semibold text-gray-900"
            >
              {workspaceEnabled ? 'Partidas de la compra' : 'Partidas'}
            </h3>
            {items.length > 0 ? (
              <span className="text-sm text-gray-500">
                {items.length} {items.length === 1 ? 'partida' : 'partidas'}
              </span>
            ) : null}
          </div>

          {workspaceEnabled ? (
            <p className="text-sm text-text-muted">
              {editing
                ? 'Revisa los productos, las cantidades y los costos antes de guardar los cambios.'
                : 'Revisa los productos, sus cantidades y costos antes de crear la orden.'}
            </p>
          ) : null}
          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              Todavía no se han agregado productos. Selecciona un producto
              arriba y agrégalo para comenzar la compra.
            </div>
          ) : (
            <>
              <div
                data-testid="purchase-form-items-table"
                className="hidden overflow-x-auto rounded-lg border border-gray-200 md:block"
              >
                <table className="min-w-full text-sm">
                  <caption className="sr-only">
                    Partidas de la compra
                  </caption>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left" scope="col">
                        Producto
                      </th>
                      <th className="w-32 px-3 py-2 text-left" scope="col">
                        Cantidad
                      </th>
                      <th className="px-3 py-2 text-right" scope="col">
                        Costo unitario
                      </th>
                      <th className="px-3 py-2 text-right" scope="col">
                        Descuento (%)
                      </th>
                      <th className="px-3 py-2 text-right" scope="col">
                        Subtotal
                      </th>
                      <th className="w-24 px-3 py-2 text-right" scope="col">
                        Acciones
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.productId}
                        className="border-t border-gray-200 align-top"
                      >
                        <td className="px-3 py-3">
                          <p className="font-medium text-gray-900">
                            {item.name}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {item.sku}
                            {item.unitOfMeasure ? ` · ${item.unitOfMeasure}` : ''}
                          </p>
                        </td>

                        <td className="px-3 py-3">
                          <Input
                            id={`purchase-item-quantity-${item.productId}-table`}
                            aria-label={`Cantidad de ${item.name}`}
                            type="number"
                            min={1}
                            step={1}
                            value={item.quantity}
                            error={itemQuantityErrors[item.productId]}
                            onChange={(event) =>
                              onItemQuantityChange(
                                item.productId,
                                event.target.value,
                              )
                            }
                          />
                        </td>

                        <td className="min-w-40 px-3 py-3 text-right text-gray-700">
                          {workspaceEnabled && canAdjustUnitCost ? (
                            <MoneyInput
                              id={`purchase-item-unit-cost-${item.productId}-table`}
                              aria-label={`Costo unitario de ${item.name}`}
                              value={itemUnitCostDrafts[item.productId] ?? String(item.baseUnitCost ?? item.unitCost)}
                              maxDecimals={4}
                              error={itemUnitCostErrors[item.productId]}
                              onValueChange={(value) => onItemUnitCostChange?.(item.productId, value)}
                            />
                          ) : formatMoney(item.baseUnitCost ?? item.unitCost)}
                        </td>

                        <td className="min-w-28 px-3 py-3 text-right">
                          {workspaceEnabled && canAdjustUnitCost ? (
                            <Input
                              id={`purchase-item-discount-${item.productId}-table`}
                              aria-label={`Descuento de ${item.name}`}
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              value={itemDiscountDrafts[item.productId] ?? String(item.discountPercent ?? 0)}
                              error={itemDiscountErrors[item.productId]}
                              onChange={(event) => onItemDiscountChange?.(item.productId, event.target.value)}
                            />
                          ) : (item.discountPercent ?? 0) > 0
                            ? `${(item.discountPercent ?? 0).toFixed(2)}%`
                            : '—'}
                        </td>

                        <td className="px-3 py-3 text-right font-medium text-gray-900">
                          {formatMoney(getItemSubtotal(item))}
                        </td>

                        <td className="px-3 py-3 text-right">
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            aria-label={`Quitar ${item.name}`}
                            onClick={() =>
                              onRemoveItem(item.productId)
                            }
                          >
                            Quitar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div
                data-testid="purchase-form-mobile-items"
                className="space-y-3 md:hidden"
              >
                {items.map((item) => {
                  const itemHeadingId = `purchase-item-heading-${item.productId}`;

                  return (
                    <article
                      key={item.productId}
                      aria-labelledby={itemHeadingId}
                      data-testid={`purchase-form-mobile-item-${item.productId}`}
                      className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4
                            id={itemHeadingId}
                            className="font-medium text-gray-900"
                          >
                            {item.name}
                          </h4>
                          <p className="mt-1 text-xs text-gray-500">
                            SKU: {item.sku}
                            {item.unitOfMeasure ? ` · ${item.unitOfMeasure}` : ''}
                          </p>
                        </div>

                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          aria-label={`Quitar ${item.name}`}
                          onClick={() =>
                            onRemoveItem(item.productId)
                          }
                        >
                          Quitar
                        </Button>
                      </div>

                      <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                        <div>
                          {workspaceEnabled && canAdjustUnitCost ? (
                            <MoneyInput
                              id={`purchase-item-unit-cost-${item.productId}-mobile`}
                              label={`Costo unitario de ${item.name}`}
                              value={itemUnitCostDrafts[item.productId] ?? String(item.baseUnitCost ?? item.unitCost)}
                              maxDecimals={4}
                              error={itemUnitCostErrors[item.productId]}
                              onValueChange={(value) => onItemUnitCostChange?.(item.productId, value)}
                            />
                          ) : (
                            <>
                              <dt className="text-gray-500">Costo</dt>
                              <dd className="mt-1 font-medium text-gray-900">
                                {formatMoney(item.baseUnitCost ?? item.unitCost)}
                              </dd>
                            </>
                          )}
                        </div>
                        <div>
                          {workspaceEnabled && canAdjustUnitCost ? (
                            <Input
                              id={`purchase-item-discount-${item.productId}-mobile`}
                              label={`Descuento de ${item.name}`}
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              value={itemDiscountDrafts[item.productId] ?? String(item.discountPercent ?? 0)}
                              error={itemDiscountErrors[item.productId]}
                              onChange={(event) => onItemDiscountChange?.(item.productId, event.target.value)}
                            />
                          ) : (
                            <>
                              <dt className="text-gray-500">Descuento</dt>
                              <dd className="mt-1 font-medium text-gray-900">
                                {(item.discountPercent ?? 0) > 0
                                  ? `${(item.discountPercent ?? 0).toFixed(2)}%`
                                  : 'No aplica'}
                              </dd>
                            </>
                          )}
                        </div>
                        <div>
                          <dt className="text-gray-500">Subtotal</dt>
                          <dd className="mt-1 font-medium text-gray-900">
                            {formatMoney(getItemSubtotal(item))}
                          </dd>
                        </div>
                      </dl>

                      <div className="mt-4">
                        <Input
                          id={`purchase-item-quantity-${item.productId}-mobile`}
                          label={`Cantidad de ${item.name}`}
                          type="number"
                          min={1}
                          step={1}
                          value={item.quantity}
                          error={itemQuantityErrors[item.productId]}
                          onChange={(event) =>
                            onItemQuantityChange(
                              item.productId,
                              event.target.value,
                            )
                          }
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>

        <div
          data-testid="purchase-form-lower-area"
          className={
            workspaceEnabled
              ? 'grid min-w-0 gap-3 lg:grid-cols-[minmax(0,11fr)_minmax(0,9fr)] lg:items-start'
              : ''
          }
        >
          {workspaceEnabled ? (
            <section
              aria-label="Revisión de la orden"
              className="min-w-0 space-y-3 rounded-xl border border-border bg-white p-3 sm:p-4"
            >
              <div>
                <h3 className="font-semibold text-text">Revisión de la orden</h3>
                <p className="mt-1 text-sm text-text-muted">
                  {editing
                    ? 'Verifica el proveedor y las partidas antes de guardar los cambios.'
                    : 'Verifica el proveedor y las partidas antes de crear la compra.'}
                </p>
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-text-muted">Proveedor</dt>
                  <dd className="font-medium text-text">{supplierName}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-text-muted">Partidas agregadas</dt>
                  <dd className="font-semibold text-text">{items.length}</dd>
                </div>
              </dl>
              <p className="rounded-lg bg-surface-subtle p-3 text-sm text-text-muted">
                {editing
                  ? 'Guardar los cambios de un borrador no registra la entrada de mercancía.'
                  : 'Crear una compra no registra la entrada de mercancía.'}{' '}
                El inventario se actualiza posteriormente, al registrar una recepción.
              </p>
            </section>
          ) : null}
          <section
            aria-labelledby="purchase-form-summary-heading"
            data-testid="purchase-form-financial-summary"
            className={
              workspaceEnabled
                ? 'min-w-0 rounded-xl border border-border bg-surface-subtle p-3 sm:p-4'
                : 'rounded-lg border border-gray-200 bg-gray-50 p-4 sm:p-5'
            }
          >
          <h3
            id="purchase-form-summary-heading"
            className={workspaceEnabled ? 'mb-3 font-semibold text-gray-900' : 'mb-4 font-semibold text-gray-900'}
          >
            Resumen financiero
          </h3>

          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">Subtotal</dt>
              <dd className="font-medium text-gray-900">
                {formatMoney(subtotal)}
              </dd>
            </div>

            <div className="flex justify-between gap-4">
              <dt className="text-gray-600">IVA (16%)</dt>
              <dd className="font-medium text-gray-900">
                {formatMoney(iva)}
              </dd>
            </div>

            <div className="flex justify-between gap-4 border-t border-gray-200 pt-3 text-lg font-semibold text-gray-900 sm:text-xl">
              <dt>Total</dt>
              <dd>{formatMoney(total)}</dd>
            </div>
          </dl>
          </section>
        </div>

        {!workspaceEnabled ? actions : null}
      </div>
    </Modal>
    <ConfirmDialog
      isOpen={isOpen && workspaceEnabled && confirmDiscard && !saving}
      title="Descartar cambios de la compra"
      message="Hay información de la compra que todavía no se ha guardado. Si sales, se perderán el proveedor, los productos y las cantidades capturadas."
      cancelText="Continuar captura"
      confirmText="Descartar cambios"
      confirmVariant="danger"
      onClose={() => setConfirmDiscard(false)}
      onConfirm={discardAndClose}
    />
    </>
  );
}
