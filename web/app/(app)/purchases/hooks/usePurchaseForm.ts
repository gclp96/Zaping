import { useMemo, useState } from 'react';

import { api } from '@/services/api';
import { getApiErrorMessage } from '@/services/errors';

import type {
  Product,
  Purchase,
  PurchaseFormItem,
  PurchaseCommercialForm,
  PurchaseCommercialFormField,
} from '../types';

const emptyCommercial: PurchaseCommercialForm = {
  paymentTerms: '',
  paymentMethod: '',
  paymentDueDate: '',
  expectedDeliveryDate: '',
  buyerName: '',
};

function fromPurchase(purchase: Purchase): PurchaseCommercialForm {
  return {
    paymentTerms: purchase.paymentTerms ?? '',
    paymentMethod: purchase.paymentMethod ?? '',
    paymentDueDate: purchase.paymentDueDate?.slice(0, 10) ?? '',
    expectedDeliveryDate: purchase.expectedDeliveryDate?.slice(0, 10) ?? '',
    buyerName: purchase.buyerName ?? '',
  };
}

type UsePurchaseFormParams = {
  products: Product[];
  onPurchaseSaved: () => Promise<void>;
  canAdjustUnitCost?: boolean;
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isValidUnitCost(value: string): boolean {
  if (!value.trim()) return false;
  const parsed = Number(value);
  const scaled = parsed * 10_000;
  return Number.isFinite(parsed) && parsed >= 0 &&
    Number.isSafeInteger(Math.round(scaled)) &&
    Math.abs(scaled - Math.round(scaled)) <= 0.000001;
}

export function usePurchaseForm({
  products,
  onPurchaseSaved,
  canAdjustUnitCost = false,
}: UsePurchaseFormParams) {
  const [openModal, setOpenModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [purchaseToEdit, setPurchaseToEdit] =
    useState<Purchase | null>(null);

  const [supplierId, setSupplierId] = useState('');
  const [commercial, setCommercial] =
    useState<PurchaseCommercialForm>({ ...emptyCommercial });
  const [selectedProductId, setSelectedProductId] =
    useState('');
  const [quantity, setQuantity] = useState('1');

  const [items, setItems] = useState<
    PurchaseFormItem[]
  >([]);

  const [supplierError, setSupplierError] =
    useState('');
  const [productError, setProductError] =
    useState('');
  const [quantityError, setQuantityError] =
    useState('');
  const [itemQuantityErrors, setItemQuantityErrors] =
    useState<Record<string, string>>({});
  const [itemUnitCostDrafts, setItemUnitCostDrafts] = useState<Record<string, string>>({});
  const [itemUnitCostErrors, setItemUnitCostErrors] = useState<Record<string, string>>({});
  const [itemsError, setItemsError] = useState('');

  const subtotal = useMemo(() => {
    return items.reduce((total, item) => {
      const parsedQuantity = Number(item.quantity);

      if (!Number.isFinite(parsedQuantity)) {
        return total;
      }

      return roundMoney(total + roundMoney(parsedQuantity * item.unitCost));
    }, 0);
  }, [items]);

  const iva = roundMoney(subtotal * 0.16);
  const total = roundMoney(subtotal + iva);

  // A draft's preloaded supplier and lines are the baseline, not new edits.
  // The existing hook stays responsible for form state and POST/PATCH payloads.
  const hasUnsavedChanges = useMemo(() => {
    if (selectedProductId !== '' || quantity !== '1' || Object.keys(itemUnitCostErrors).length > 0) {
      return true;
    }

    if (!purchaseToEdit) {
      return supplierId !== '' || items.length > 0 ||
        Object.values(commercial).some((value) => value.trim() !== '');
    }

    if (
      supplierId !== purchaseToEdit.supplier.id ||
      items.length !== purchaseToEdit.items.length
    ) {
      return true;
    }

    if (Object.entries(commercial).some(([field, value]) =>
      value !== fromPurchase(purchaseToEdit)[field as PurchaseCommercialFormField],
    )) {
      return true;
    }

    return items.some((item, index) => {
      const originalItem = purchaseToEdit.items[index];

      return (
        !originalItem ||
        item.productId !== originalItem.productId ||
        item.quantity !== String(originalItem.quantity) ||
        item.unitCost !== originalItem.price
      );
    });
  }, [items, itemUnitCostErrors, purchaseToEdit, quantity, selectedProductId, supplierId, commercial]);

  function resetForm() {
    setSupplierId('');
    setCommercial({ ...emptyCommercial });
    setSelectedProductId('');
    setQuantity('1');
    setItems([]);

    setSupplierError('');
    setProductError('');
    setQuantityError('');
    setItemQuantityErrors({});
    setItemUnitCostDrafts({});
    setItemUnitCostErrors({});
    setItemsError('');
  }

  function openCreateModal() {
    resetForm();
    setPurchaseToEdit(null);
    setOpenModal(true);
  }

  function openEditModal(purchase: Purchase) {
    if (purchase.status !== 'DRAFT') {
      return;
    }

    setPurchaseToEdit(purchase);

    setSupplierId(purchase.supplier.id);
    setCommercial(fromPurchase(purchase));
    setSelectedProductId('');
    setQuantity('1');

    setItems(
      purchase.items.map((item) => ({
        productId: item.productId,
        sku: item.product.sku,
        name: item.product.name,
        quantity: String(item.quantity),
        unitCost: item.price,
      })),
    );

    setSupplierError('');
    setProductError('');
    setQuantityError('');
    setItemQuantityErrors({});
    setItemUnitCostDrafts({});
    setItemUnitCostErrors({});
    setItemsError('');

    setOpenModal(true);
  }

  function closeCreateModal() {
    if (saving) {
      return;
    }

    setOpenModal(false);
    setPurchaseToEdit(null);
    resetForm();
  }

  function handleSupplierChange(value: string) {
    setSupplierId(value);
    setSupplierError('');
  }

  function handleCommercialChange(
    field: PurchaseCommercialFormField,
    value: string,
  ) {
    setCommercial((current) => ({ ...current, [field]: value }));
  }

  function handleSelectedProductChange(
    value: string,
  ) {
    setSelectedProductId(value);
    setProductError('');
  }

  function handleFormQuantityChange(
    value: string,
  ) {
    setQuantity(value);
    setQuantityError('');
  }

  function handleAddProduct() {
    setProductError('');
    setQuantityError('');
    setItemsError('');

    if (!selectedProductId) {
      setProductError('Selecciona un producto.');
      return;
    }

    const parsedQuantity = Number(quantity);

    if (
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 1
    ) {
      setQuantityError(
        'La cantidad debe ser un número entero mayor o igual a uno.',
      );
      return;
    }

    if (
      items.some(
        (item) =>
          item.productId === selectedProductId,
      )
    ) {
      setProductError(
        'El producto ya fue agregado a la compra.',
      );
      return;
    }

    const product = products.find(
      (currentProduct) =>
        currentProduct.id === selectedProductId,
    );

    if (!product) {
      setProductError(
        'El producto seleccionado no existe.',
      );
      return;
    }

    setItems((currentItems) => [
      ...currentItems,
      {
        productId: product.id,
        sku: product.sku,
        name: product.name,
        quantity: String(parsedQuantity),
        unitCost: product.cost,
      },
    ]);

    setItemQuantityErrors((currentErrors) => {
      if (!currentErrors[product.id]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[product.id];
      return nextErrors;
    });

    setSelectedProductId('');
    setQuantity('1');
  }

  function handleItemQuantityChange(
    productId: string,
    value: string,
  ) {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity: value,
            }
          : item,
      ),
    );

    setItemsError('');
    setItemQuantityErrors((currentErrors) => {
      if (!currentErrors[productId]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[productId];
      return nextErrors;
    });
  }

  function handleItemUnitCostChange(productId: string, value: string) {
    if (!canAdjustUnitCost) return;
    setItemUnitCostDrafts((current) => ({ ...current, [productId]: value }));
    const valid = isValidUnitCost(value);
    setItemUnitCostErrors((current) => {
      const next = { ...current };
      if (!valid) next[productId] = 'El costo debe ser no negativo, con máximo 4 decimales.';
      else delete next[productId];
      return next;
    });
    if (valid) {
      setItems((current) => current.map((item) =>
        item.productId === productId ? { ...item, unitCost: Number(value) } : item,
      ));
    }
    setItemsError('');
  }

  function handleRemoveItem(productId: string) {
    setItems((currentItems) =>
      currentItems.filter(
        (item) => item.productId !== productId,
      ),
    );

    setItemsError('');
    setItemUnitCostDrafts((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    setItemUnitCostErrors((current) => {
      const next = { ...current };
      delete next[productId];
      return next;
    });
    setItemQuantityErrors((currentErrors) => {
      if (!currentErrors[productId]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[productId];
      return nextErrors;
    });
  }

  async function handleCreatePurchase() {
    setSupplierError('');
    setQuantityError('');
    setItemQuantityErrors({});
    setItemsError('');

    let valid = true;

    if (!supplierId) {
      setSupplierError(
        'Selecciona un proveedor.',
      );
      valid = false;
    }

    if (items.length === 0) {
      setItemsError(
        'Agrega al menos un producto.',
      );
      valid = false;
    }

    const quantityErrors = items.reduce<Record<string, string>>(
      (errors, item) => {
        const parsedQuantity = Number(item.quantity);

        if (
          !Number.isInteger(parsedQuantity) ||
          parsedQuantity < 1
        ) {
          errors[item.productId] =
            'La cantidad debe ser un número entero mayor o igual a uno.';
        }

        return errors;
      },
      {},
    );

    if (Object.keys(quantityErrors).length > 0) {
      setItemQuantityErrors(quantityErrors);
      setItemsError(
        'Todas las cantidades deben ser enteros mayores o iguales a uno.',
      );
      valid = false;
    }
    if (Object.keys(itemUnitCostErrors).length > 0) {
      setItemsError('Corrige los costos unitarios antes de guardar.');
      valid = false;
    }

    if (!valid) {
      return;
    }

    try {
      setSaving(true);

      const existingCommercial = purchaseToEdit
        ? fromPurchase(purchaseToEdit)
        : emptyCommercial;
      const commercialChanges: Partial<Record<PurchaseCommercialFormField, string | null>> = {};
      for (const field of Object.keys(commercial) as PurchaseCommercialFormField[]) {
        const value = commercial[field].trim();
        if (value !== existingCommercial[field]) {
          commercialChanges[field] = value || null;
        }
      }

      const payload = {
        supplierId,
        ...commercialChanges,
        items: items.map((item) => {
          const catalogCost = products.find((product) => product.id === item.productId)?.cost;
          const previousCost = purchaseToEdit?.items.find((line) => line.productId === item.productId)?.price;
          const overrideNeeded = canAdjustUnitCost && (
            (catalogCost !== undefined && item.unitCost !== catalogCost) ||
            (previousCost !== undefined && item.unitCost !== previousCost)
          );
          return {
            productId: item.productId,
            quantity: Number(item.quantity),
            ...(overrideNeeded ? { unitCost: item.unitCost } : {}),
          };
        }),
      };

      if (purchaseToEdit) {
        await api.patch(
          `/purchases/${purchaseToEdit.id}`,
          payload,
        );
      } else {
        await api.post('/purchases', payload);
      }

      await onPurchaseSaved();

      setOpenModal(false);
      setPurchaseToEdit(null);
      resetForm();
    } catch (error: unknown) {

      setItemsError(
        getApiErrorMessage(
          error,
          'No fue posible guardar la compra.',
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return {
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

    openCreateModal,
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
  };
}
