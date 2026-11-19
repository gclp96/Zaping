export type ReceiptAuthority = 'LEGACY' | 'PHYSICAL';

import type { StatusTone } from '@/app/components/business/StatusBadge';

export type PurchaseStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export type ProductInventoryTracking =
  | 'QUANTITY'
  | 'SERIALIZED'
  | 'ASSET';

export type ProductLotTracking =
  | 'NONE'
  | 'OPTIONAL'
  | 'REQUIRED';

export type PurchaseReceiptFormField =
  | 'quantityReceived'
  | 'lotNumber'
  | 'expirationDate';

export type PurchaseReceiptFormItem = {
  purchaseItemId: string;
  productId: string;
  sku: string;
  name: string;
  inventoryTracking: ProductInventoryTracking;
  lotTracking: ProductLotTracking;

  orderedQuantity: number;
  receivedQuantity: number;
  pendingQuantity: number;

  quantityReceived: string;
  lotNumber: string;
  expirationDate: string;
};

export type PurchaseReceiptItemFieldErrors = Partial<
  Record<PurchaseReceiptFormField, string>
>;

export type PurchaseReceiptFieldErrors = Record<
  string,
  PurchaseReceiptItemFieldErrors
>;

export type PurchaseReceiptItem = {
  id: string;
  purchaseItemId: string;
  productId: string;
  quantityReceived: number;
  lotNumber?: string | null;
  expirationDate?: string | null;
  unitCost: number;
  batchId?: string | null;

  product: {
    id: string;
    sku: string;
    name: string;
  };

  batch?: {
    id: string;
    lotNumber: string;
    expirationDate?: string | null;
    initialQuantity: number;
    availableQuantity: number;
    unitCost: number;
  } | null;
};

export type PurchaseReceipt = {
  id: string;
  purchaseId: string;
  folio: string;
  receivedAt: string;
  receivedBy?: string | null;
  notes?: string | null;
  items: PurchaseReceiptItem[];

  receivedByUser?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
};

export type CreatedPurchaseReceipt = Pick<
  PurchaseReceipt,
  'id' | 'folio'
>;

export type InventoryMovement = {
  id: string;
  productId: string;
  movementType: string;
  quantity: number;
  balance: number;
  unitCost?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
  createdAt: string;

  product: {
    id: string;
    sku: string;
    name: string;
  };
};

export type PurchaseItem = {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  listUnitCost?: number | null;
  discountPercent?: number;
  subtotal: number;

  product: {
    id: string;
    sku: string;
    name: string;
    unitOfMeasure?: string | null;
    inventoryTracking: ProductInventoryTracking;
    lotTracking: ProductLotTracking;
  };
};

export type PurchaseReceiptProgress = {
  orderedUnits: number;
  receivedUnits: number;
  pendingUnits: number;
  orderedLines: number;
  completedLines: number;
};

export type Purchase = {
  id: string;
  folio: string;
  status: PurchaseStatus;
  subtotal: number;
  iva: number;
  total: number;
  createdAt: string;
  paymentTerms?: string | null;
  paymentMethod?: string | null;
  paymentDueDate?: string | null;
  expectedDeliveryDate?: string | null;
  buyerName?: string | null;
  receiptProgress: PurchaseReceiptProgress;

  supplier: {
    id: string;
    name: string;
    email?: string | null;
    contactName?: string | null;
    isActive?: boolean;
  };

  items: PurchaseItem[];
};

export type PurchaseStatusDescriptor = {
  label: string;
  tone: StatusTone;
};

export type Supplier = {
  id: string;
  name: string;
  email?: string | null;
  contactName?: string | null;
  isActive?: boolean;
};

export type Product = {
  id: string;
  sku: string;
  name: string;
  unitOfMeasure?: string | null;
  cost: number;
  stock: number;
  minStock: number;
  price: number;
  inventoryTracking: ProductInventoryTracking;
  lotTracking: ProductLotTracking;
};

export type PurchaseFormItem = {
  productId: string;
  sku: string;
  name: string;
  quantity: string;
  unitCost: number;
  baseUnitCost?: number;
  discountPercent?: number;
  unitOfMeasure?: string | null;
};

export type PurchaseCommercialForm = {
  paymentTerms: string;
  paymentMethod: string;
  paymentDueDate: string;
  expectedDeliveryDate: string;
  buyerName: string;
};

export type PurchaseCommercialFormField = keyof PurchaseCommercialForm;
