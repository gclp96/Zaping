import {
  act,
  cleanup,
  renderHook,
} from '@testing-library/react';

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { canApprovePurchases } from '@/app/erp-role-access';
import { api } from '@/services/api';

import type { Purchase } from '../types';

import { usePurchaseForm } from './usePurchaseForm';

vi.mock('@/services/api', () => ({
  api: {
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('@/services/errors', () => ({
  getApiErrorMessage: (
    _error: unknown,
    fallbackMessage: string,
  ) => fallbackMessage,
}));

const product = {
  id: 'product-1',
  sku: 'MED-001',
  name: 'Producto médico',
  cost: 100,
  stock: 20,
  minStock: 5,
  price: 120,
  inventoryTracking: 'QUANTITY' as const,
  lotTracking: 'OPTIONAL' as const,
};

const draftPurchase: Purchase = {
  id: 'purchase-1',
  folio: 'OC-0001',
  status: 'DRAFT',
  receiptProgress: {
    orderedUnits: 10,
    receivedUnits: 0,
    pendingUnits: 10,
    orderedLines: 1,
    completedLines: 0,
  },
  subtotal: 1000,
  iva: 160,
  total: 1160,
  createdAt: '2026-07-30T18:00:00.000Z',
  supplier: {
    id: 'supplier-1',
    name: 'Proveedor médico',
  },
  items: [
    {
      id: 'purchase-item-1',
      productId: 'product-1',
      quantity: 10,
      price: 100,
      subtotal: 1000,
      product: {
        id: 'product-1',
        sku: 'MED-001',
        name: 'Producto médico',
        inventoryTracking: 'QUANTITY',
        lotTracking: 'OPTIONAL',
      },
    },
  ],
};

function setupHook(canAdjustUnitCost = false) {
  const onPurchaseSaved = vi
    .fn()
    .mockResolvedValue(undefined);

  const hook = renderHook(() =>
    usePurchaseForm({
      products: [product],
      onPurchaseSaved,
      canAdjustUnitCost,
    }),
  );

  return {
    ...hook,
    onPurchaseSaved,
  };
}

describe('usePurchaseForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('inicia con el formulario cerrado y vacío', () => {
    const { result } = setupHook();

    expect(result.current.openModal).toBe(false);
    expect(result.current.saving).toBe(false);
    expect(result.current.purchaseToEdit).toBeNull();
    expect(result.current.hasUnsavedChanges).toBe(false);

    expect(result.current.supplierId).toBe('');
    expect(result.current.selectedProductId).toBe('');
    expect(result.current.quantity).toBe('1');
    expect(result.current.items).toEqual([]);

    expect(result.current.subtotal).toBe(0);
    expect(result.current.iva).toBe(0);
    expect(result.current.total).toBe(0);
  });

  it('envía las condiciones comerciales capturadas en una nueva orden', async () => {
    const { result } = setupHook();
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'new-1' } } as never);
    act(() => result.current.openCreateModal());
    act(() => {
      result.current.handleSupplierChange('supplier-1');
      result.current.handleSelectedProductChange('product-1');
      result.current.handleCommercialChange('paymentTerms', 'Crédito 30 días');
      result.current.handleCommercialChange('paymentMethod', 'Transferencia electrónica');
      result.current.handleCommercialChange('paymentDueDate', '2026-12-17');
      result.current.handleCommercialChange('expectedDeliveryDate', '2026-11-17');
    });
    act(() => result.current.handleAddProduct());

    expect(result.current.hasUnsavedChanges).toBe(true);
    await act(async () => {
      await result.current.handleCreatePurchase();
    });

    expect(api.post).toHaveBeenCalledWith(
      '/purchases',
      expect.objectContaining({
        paymentTerms: 'Crédito 30 días',
        paymentMethod: 'Transferencia electrónica',
        paymentDueDate: '2026-12-17',
        expectedDeliveryDate: '2026-11-17',
      }),
    );
  });

  it('envía null cuando se elimina una condición comercial del borrador', async () => {
    const { result } = setupHook();
    const purchase = { ...draftPurchase, paymentTerms: 'Crédito 30 días' };
    vi.mocked(api.patch).mockResolvedValue({ data: purchase } as never);
    act(() => result.current.openEditModal(purchase));
    expect(result.current.commercial.paymentTerms).toBe('Crédito 30 días');
    expect(result.current.hasUnsavedChanges).toBe(false);
    act(() => result.current.handleCommercialChange('paymentTerms', ''));
    expect(result.current.hasUnsavedChanges).toBe(true);
    await act(async () => {
      await result.current.handleCreatePurchase();
    });
    expect(api.patch).toHaveBeenCalledWith(
      '/purchases/purchase-1',
      expect.objectContaining({ paymentTerms: null }),
    );
  });

  it('abre el formulario para crear una compra', () => {
    const { result } = setupHook();

    act(() => {
      result.current.openCreateModal();
    });

    expect(result.current.openModal).toBe(true);
    expect(result.current.purchaseToEdit).toBeNull();
    expect(result.current.quantity).toBe('1');
    expect(result.current.items).toEqual([]);
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it('agrega un producto y calcula los totales', () => {
    const { result } = setupHook();

    act(() => {
      result.current.openCreateModal();
    });

    act(() => {
      result.current.handleSupplierChange(
        'supplier-1',
      );

      result.current.handleSelectedProductChange(
        'product-1',
      );

      result.current.handleFormQuantityChange('3');
    });

    act(() => {
      result.current.handleAddProduct();
    });

    expect(result.current.items).toEqual([
      {
        productId: 'product-1',
        sku: 'MED-001',
        name: 'Producto médico',
        quantity: '3',
        unitCost: 100,
        baseUnitCost: 100,
        discountPercent: 0,
        unitOfMeasure: null,
      },
    ]);

    expect(result.current.subtotal).toBe(300);
    expect(result.current.iva).toBe(48);
    expect(result.current.total).toBe(348);
    expect(result.current.hasUnsavedChanges).toBe(true);

    expect(
      result.current.selectedProductId,
    ).toBe('');

    expect(result.current.quantity).toBe('1');
  });

  it('carga una compra en borrador para edición', () => {
    const { result } = setupHook();

    act(() => {
      result.current.openEditModal(draftPurchase);
    });

    expect(result.current.openModal).toBe(true);

    expect(result.current.purchaseToEdit).toEqual(
      draftPurchase,
    );

    expect(result.current.supplierId).toBe(
      'supplier-1',
    );

    expect(result.current.items).toEqual([
      {
        productId: 'product-1',
        sku: 'MED-001',
        name: 'Producto médico',
        quantity: '10',
        unitCost: 100,
        baseUnitCost: 100,
        discountPercent: 0,
        unitOfMeasure: null,
      },
    ]);

    expect(result.current.subtotal).toBe(1000);
    expect(result.current.iva).toBe(160);
    expect(result.current.total).toBe(1160);
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it('detecta solo cambios reales respecto al borrador original', () => {
    const { result } = setupHook();

    act(() => result.current.openEditModal(draftPurchase));
    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => result.current.handleItemQuantityChange('product-1', '7'));
    expect(result.current.hasUnsavedChanges).toBe(true);
    act(() => result.current.handleItemQuantityChange('product-1', '10'));
    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => result.current.handleSupplierChange('supplier-2'));
    expect(result.current.hasUnsavedChanges).toBe(true);
    act(() => result.current.handleSupplierChange('supplier-1'));
    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => result.current.handleSelectedProductChange('product-2'));
    expect(result.current.hasUnsavedChanges).toBe(true);
    act(() => result.current.handleSelectedProductChange(''));
    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => result.current.handleFormQuantityChange('4'));
    expect(result.current.hasUnsavedChanges).toBe(true);
    act(() => result.current.handleFormQuantityChange('1'));
    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => result.current.handleRemoveItem('product-1'));
    expect(result.current.hasUnsavedChanges).toBe(true);

    act(() => result.current.openEditModal(draftPurchase));
    expect(result.current.hasUnsavedChanges).toBe(false);

    act(() => result.current.closeCreateModal());
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it('evita editar compras que no están en DRAFT', () => {
    const { result } = setupHook();
    act(() =>
      result.current.openEditModal({ ...draftPurchase, status: 'CONFIRMED' }),
    );
    expect(result.current.openModal).toBe(false);
    expect(result.current.purchaseToEdit).toBeNull();
    expect(result.current.hasUnsavedChanges).toBe(false);
  });

  it('muestra errores cuando se intenta guardar un formulario vacío', async () => {
    const { result } = setupHook();

    act(() => {
      result.current.openCreateModal();
    });

    await act(async () => {
      await result.current.handleCreatePurchase();
    });

    expect(result.current.supplierError).toBe(
      'Selecciona un proveedor.',
    );

    expect(result.current.itemsError).toBe(
      'Agrega al menos un producto.',
    );

    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('crea una compra mediante POST y reinicia el formulario', async () => {
    const { result, onPurchaseSaved } =
      setupHook();

    vi.mocked(api.post).mockResolvedValue({
      data: {
        id: 'purchase-2',
        folio: 'OC-0002',
      },
    } as never);

    act(() => {
      result.current.openCreateModal();
    });

    act(() => {
      result.current.handleSupplierChange(
        'supplier-1',
      );

      result.current.handleSelectedProductChange(
        'product-1',
      );

      result.current.handleFormQuantityChange('3');
    });

    act(() => {
      result.current.handleAddProduct();
    });

    await act(async () => {
      await result.current.handleCreatePurchase();
    });

    expect(api.post).toHaveBeenCalledWith(
      '/purchases',
      {
        supplierId: 'supplier-1',
        items: [
          {
            productId: 'product-1',
            quantity: 3,
          },
        ],
      },
    );

    expect(onPurchaseSaved).toHaveBeenCalledTimes(1);

    expect(result.current.openModal).toBe(false);
    expect(result.current.purchaseToEdit).toBeNull();
    expect(result.current.supplierId).toBe('');
    expect(result.current.items).toEqual([]);
  });

  it('acepta costo negociado de 4 decimales y envía override sin modificar catálogo', async () => {
    const { result } = setupHook(true);
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'new-1' } } as never);
    act(() => result.current.openCreateModal());
    act(() => {
      result.current.handleSupplierChange('supplier-1');
      result.current.handleSelectedProductChange('product-1');
      result.current.handleFormQuantityChange('2');
    });
    act(() => result.current.handleAddProduct());
    act(() => result.current.handleItemUnitCostChange('product-1', '12.3456'));
    expect(result.current.requiresCostAdjustmentReason).toBe(true);
    await act(async () => { await result.current.handleCreatePurchase(); });
    expect(api.post).not.toHaveBeenCalled();
    expect(result.current.itemsError).toMatch(/motivo del ajuste/);
    act(() => result.current.setCostAdjustmentReason('  Precio acordado con el proveedor  '));
    expect(result.current.items[0].unitCost).toBe(12.3456);
    expect(result.current.subtotal).toBe(24.69);
    expect(result.current.iva).toBe(3.95);
    expect(result.current.total).toBe(28.64);
    await act(async () => { await result.current.handleCreatePurchase(); });
    expect(api.post).toHaveBeenCalledWith('/purchases', {
      costAdjustmentReason: 'Precio acordado con el proveedor',
      supplierId: 'supplier-1',
      items: [{ productId: 'product-1', quantity: 2, unitCost: 12.3456 }],
    });
    expect(product.cost).toBe(100);
  });

  it('bloquea guardar con costo vacío y conserva el valor pactado al editar', async () => {
    const { result } = setupHook(true);
    act(() => result.current.openEditModal(draftPurchase));
    act(() => result.current.handleItemUnitCostChange('product-1', ''));
    expect(result.current.itemUnitCostErrors['product-1']).toBeTruthy();
    expect(result.current.hasUnsavedChanges).toBe(true);
    await act(async () => { await result.current.handleCreatePurchase(); });
    expect(api.patch).not.toHaveBeenCalled();

    act(() => result.current.handleItemUnitCostChange('product-1', '99.9999'));
    expect(result.current.requiresCostAdjustmentReason).toBe(true);
    act(() => result.current.setCostAdjustmentReason('  Precio acordado con el proveedor  '));
    expect(result.current.itemUnitCostErrors).toEqual({});
    expect(result.current.hasUnsavedChanges).toBe(true);
    vi.mocked(api.patch).mockResolvedValue({ data: { id: 'purchase-1' } } as never);
    await act(async () => { await result.current.handleCreatePurchase(); });
    expect(api.patch).toHaveBeenCalledWith('/purchases/purchase-1', {
      costAdjustmentReason: 'Precio acordado con el proveedor',
      supplierId: 'supplier-1',
      items: [{ productId: 'product-1', quantity: 10, unitCost: 99.9999 }],
    });
  });

  it('exige motivo a MANAGER antes de enviar un ajuste de costo de una compra existente', async () => {
    const { result } = setupHook(canApprovePurchases('MANAGER'));
    vi.mocked(api.patch).mockResolvedValue({ data: { id: draftPurchase.id } } as never);
    act(() => result.current.openEditModal(draftPurchase));
    act(() => result.current.handleItemUnitCostChange(product.id, '90.125'));

    expect(result.current.items[0].unitCost).toBe(90.125);
    expect(result.current.requiresCostAdjustmentReason).toBe(true);
    await act(async () => {
      await result.current.handleCreatePurchase();
    });
    expect(result.current.itemsError).toBe(
      'Describe el motivo del ajuste de costo o descuento (mínimo 8 caracteres).',
    );
    expect(api.patch).not.toHaveBeenCalled();

    act(() => result.current.setCostAdjustmentReason('  Flete QA  '));
    await act(async () => {
      await result.current.handleCreatePurchase();
    });
    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/purchases/purchase-1', {
      supplierId: draftPurchase.supplier.id,
      costAdjustmentReason: 'Flete QA',
      items: [{ productId: product.id, quantity: 10, unitCost: 90.125 }],
    });
  });

  it('guarda una edición exclusiva de cantidad sin exigir motivo de ajuste', async () => {
    const { result } = setupHook(canApprovePurchases('MANAGER'));
    vi.mocked(api.patch).mockResolvedValue({ data: { id: draftPurchase.id } } as never);
    act(() => result.current.openEditModal(draftPurchase));
    act(() => result.current.handleItemQuantityChange(product.id, '12'));

    expect(result.current.requiresCostAdjustmentReason).toBe(false);
    await act(async () => {
      await result.current.handleCreatePurchase();
    });
    expect(result.current.itemsError).toBe('');
    expect(api.patch).toHaveBeenCalledExactlyOnceWith('/purchases/purchase-1', {
      supplierId: draftPurchase.supplier.id,
      items: [{ productId: product.id, quantity: 12 }],
    });
  });

  it('impide modificar costo desde UI no autorizada', () => {
    const { result } = setupHook(false);
    act(() => result.current.openCreateModal());
    act(() => {
      result.current.handleSelectedProductChange('product-1');
    });
    act(() => result.current.handleAddProduct());
    act(() => result.current.handleItemUnitCostChange('product-1', '1'));
    expect(result.current.items[0].unitCost).toBe(100);
  });

  it('calcula descuento de compra con costo neto y envía bruto y porcentaje', async () => {
    const { result } = setupHook(true);
    vi.mocked(api.post).mockResolvedValue({ data: { id: 'new-2' } } as never);
    act(() => result.current.openCreateModal());
    act(() => {
      result.current.handleSupplierChange('supplier-1');
      result.current.handleSelectedProductChange('product-1');
      result.current.handleFormQuantityChange('10');
    });
    act(() => result.current.handleAddProduct());
    act(() => result.current.handleItemUnitCostChange('product-1', '85.5'));
    act(() => result.current.handleItemDiscountChange('product-1', '10'));
    expect(result.current.requiresCostAdjustmentReason).toBe(true);
    act(() => result.current.setCostAdjustmentReason('  Precio acordado con el proveedor  '));
    expect(result.current.items[0].unitCost).toBe(76.95);
    expect(result.current.items[0].baseUnitCost).toBe(85.5);
    expect(result.current.subtotal).toBe(769.5);
    expect(result.current.iva).toBe(123.12);
    expect(result.current.total).toBe(892.62);

    await act(async () => { await result.current.handleCreatePurchase(); });
    expect(api.post).toHaveBeenCalledWith('/purchases', {
      costAdjustmentReason: 'Precio acordado con el proveedor',
      supplierId: 'supplier-1',
      items: [{
        productId: 'product-1',
        quantity: 10,
        unitCost: 85.5,
        discountPercent: 10,
      }],
    });
    expect(product.cost).toBe(100);
  });

  it('bloquea descuentos inválidos y protege rol no autorizado', async () => {
    const { result } = setupHook(true);
    act(() => result.current.openCreateModal());
    act(() => {
      result.current.handleSupplierChange('supplier-1');
      result.current.handleSelectedProductChange('product-1');
    });
    act(() => result.current.handleAddProduct());
    act(() => result.current.handleItemDiscountChange('product-1', '120'));
    expect(result.current.itemDiscountErrors['product-1']).toBeTruthy();
    await act(async () => { await result.current.handleCreatePurchase(); });
    expect(api.post).not.toHaveBeenCalled();
    act(() => result.current.handleItemDiscountChange('product-1', '0'));
    expect(result.current.itemDiscountErrors).toEqual({});

    const unauthorized = setupHook(false);
    act(() => unauthorized.result.current.openCreateModal());
    act(() => unauthorized.result.current.handleSelectedProductChange('product-1'));
    act(() => unauthorized.result.current.handleAddProduct());
    act(() => unauthorized.result.current.handleItemDiscountChange('product-1', '10'));
    expect(unauthorized.result.current.items[0].discountPercent).toBe(0);
  });

  it('actualiza una compra en borrador mediante PATCH', async () => {
    const { result, onPurchaseSaved } =
      setupHook();

    vi.mocked(api.patch).mockResolvedValue({
      data: {
        ...draftPurchase,
        total: 580,
      },
    } as never);

    act(() => {
      result.current.openEditModal(draftPurchase);
    });

    act(() => {
      result.current.handleItemQuantityChange(
        'product-1',
        '5',
      );
    });

    await act(async () => {
      await result.current.handleCreatePurchase();
    });

    expect(api.patch).toHaveBeenCalledWith(
      '/purchases/purchase-1',
      {
        supplierId: 'supplier-1',
        items: [
          {
            productId: 'product-1',
            quantity: 5,
          },
        ],
      },
    );

    expect(api.post).not.toHaveBeenCalled();
    expect(onPurchaseSaved).toHaveBeenCalledTimes(1);

    expect(result.current.openModal).toBe(false);
    expect(result.current.purchaseToEdit).toBeNull();
  });
});
