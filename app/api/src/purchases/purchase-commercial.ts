import { BadRequestException } from '@nestjs/common';

// PostgreSQL DATE must be handled as a calendar day, never in a tenant timezone.
export function parsePurchaseCalendarDate(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('La fecha debe tener formato AAAA-MM-DD');
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException('La fecha comercial no es válida');
  }
  return parsed;
}

export function formatPurchaseCalendarDate(
  value: Date | string | null | undefined,
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

export function formatPurchaseIssueDate(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('es-MX', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')}/${part('month')}/${part('year')}`;
}

export type PurchaseCommercialSource = {
  company: {
    name: string;
    tradeName?: string | null;
    rfc: string;
    fiscalAddress?: string | null;
    placeOfIssue?: string | null;
    email?: string | null;
    phone?: string | null;
    timezone?: string | null;
    currency?: string | null;
  };
  supplier: {
    name: string;
    legalName?: string | null;
    rfc?: string | null;
    fiscalAddress?: string | null;
    address?: string | null;
    supplierCode?: string | null;
  };
  createdAt: Date;
  paymentTerms?: string | null;
  paymentMethod?: string | null;
  paymentDueDate?: Date | null;
  expectedDeliveryDate?: Date | null;
  buyerName?: string | null;
  items: Array<{
    productId: string;
    product: { name: string; sku: string };
    quantity: number;
    price: number;
    subtotal: number;
  }>;
};

export type PurchaseCommercialSnapshotV1 = {
  version: 1;
  issuer: {
    legalName: string;
    tradeName: string | null;
    rfc: string;
    fiscalAddress: string | null;
    placeOfIssue: string | null;
    timezone: string;
    currency: string;
  };
  supplier: {
    name: string;
    legalName: string | null;
    rfc: string | null;
    fiscalAddress: string | null;
    code: string | null;
  };
  terms: {
    paymentTerms: string | null;
    paymentMethod: string | null;
    paymentDueDate: string | null;
    expectedDeliveryDate: string | null;
    buyerName: string | null;
  };
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    quantity: number;
    unitCost: number;
    subtotal: number;
  }>;
};

export function buildPurchaseCommercialSnapshot(
  purchase: PurchaseCommercialSource,
): PurchaseCommercialSnapshotV1 {
  return {
    version: 1,
    issuer: {
      legalName: purchase.company.name,
      tradeName: purchase.company.tradeName ?? null,
      rfc: purchase.company.rfc,
      fiscalAddress: purchase.company.fiscalAddress ?? null,
      placeOfIssue: purchase.company.placeOfIssue ?? null,
      timezone: purchase.company.timezone || 'America/Hermosillo',
      currency: purchase.company.currency || 'MXN',
    },
    supplier: {
      name: purchase.supplier.name,
      legalName: purchase.supplier.legalName ?? null,
      rfc: purchase.supplier.rfc ?? null,
      fiscalAddress:
        purchase.supplier.fiscalAddress ||
        purchase.supplier.address ||
        null,
      code: purchase.supplier.supplierCode ?? null,
    },
    terms: {
      paymentTerms: purchase.paymentTerms ?? null,
      paymentMethod: purchase.paymentMethod ?? null,
      paymentDueDate: purchase.paymentDueDate?.toISOString().slice(0, 10) ?? null,
      expectedDeliveryDate:
        purchase.expectedDeliveryDate?.toISOString().slice(0, 10) ?? null,
      buyerName: purchase.buyerName ?? null,
    },
    items: purchase.items.map((item) => ({
      productId: item.productId,
      sku: item.product.sku,
      name: item.product.name,
      quantity: item.quantity,
      unitCost: item.price,
      subtotal: item.subtotal,
    })),
  };
}

export function readPurchaseCommercialSnapshot(
  value: unknown,
): PurchaseCommercialSnapshotV1 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const snapshot = value as Partial<PurchaseCommercialSnapshotV1>;
  if (
    snapshot.version !== 1 ||
    !snapshot.issuer ||
    !snapshot.supplier ||
    !snapshot.terms ||
    !Array.isArray(snapshot.items)
  ) {
    return null;
  }
  return snapshot as PurchaseCommercialSnapshotV1;
}
