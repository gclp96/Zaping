import type {
  PurchaseStatus,
  PurchaseStatusDescriptor,
} from './types';

export function canRegisterPurchaseReceipt(status: PurchaseStatus): boolean {
  return status === 'CONFIRMED' || status === 'PARTIALLY_RECEIVED';
}

export function getPurchaseStatusDescriptor(
  status: PurchaseStatus,
): PurchaseStatusDescriptor {
  if (status === 'CONFIRMED') {
    return {
      label: 'Confirmada',
      tone: 'info',
    };
  }

  if (status === 'PARTIALLY_RECEIVED') {
    return {
      label: 'Parcialmente recibida',
      tone: 'warning',
    };
  }

  if (status === 'RECEIVED') {
    return {
      label: 'Recibida',
      tone: 'success',
    };
  }

  if (status === 'CANCELLED') {
    return {
      label: 'Cancelada',
      tone: 'danger',
    };
  }

  if (status === 'DRAFT') {
    return {
      label: 'Borrador',
      tone: 'neutral',
    };
  }

  return {
    label: status,
    tone: 'neutral',
  };
}
