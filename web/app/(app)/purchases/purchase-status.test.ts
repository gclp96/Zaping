import { describe, expect, it } from 'vitest';

import { canRegisterPurchaseReceipt, getPurchaseStatusDescriptor } from './purchase-status';
import type { PurchaseStatus } from './types';

describe('canRegisterPurchaseReceipt', () => {
  it.each([
    ['DRAFT', false],
    ['CONFIRMED', true],
    ['PARTIALLY_RECEIVED', true],
    ['RECEIVED', false],
    ['CANCELLED', false],
  ] as Array<[PurchaseStatus, boolean]>)('returns %s eligibility as %s', (status, expected) => {
    expect(canRegisterPurchaseReceipt(status)).toBe(expected);
  });
});

describe('getPurchaseStatusDescriptor — semantic purchase tones', () => {
  it.each([
    ['DRAFT', 'Borrador', 'neutral'],
    ['CONFIRMED', 'Confirmada', 'info'],
    ['PARTIALLY_RECEIVED', 'Parcialmente recibida', 'warning'],
    ['RECEIVED', 'Recibida', 'success'],
    ['CANCELLED', 'Cancelada', 'danger'],
  ] as const)('maps %s to %s with %s tone', (status, label, tone) => {
    expect(getPurchaseStatusDescriptor(status)).toEqual({ label, tone });
  });
});
