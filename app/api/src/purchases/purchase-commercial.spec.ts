import {
  buildPurchaseCommercialSnapshot,
  formatPurchaseCalendarDate,
  formatPurchaseIssueDate,
  parsePurchaseCalendarDate,
  readPurchaseCommercialSnapshot,
} from './purchase-commercial';

describe('purchase commercial snapshot', () => {
  const purchase = {
    company: {
      name: 'Emisor S.A. de C.V.',
      tradeName: 'Emisor',
      rfc: 'EMI010101AAA',
      timezone: 'America/Hermosillo',
      currency: 'MXN',
      fiscalAddress: 'Calle 1, Hermosillo, Sonora, C.P. 83000',
      placeOfIssue: 'Hermosillo, Sonora',
    },
    supplier: {
      name: 'Proveedor comercial',
      legalName: 'Proveedor Legal S.A. de C.V.',
      rfc: 'PRL010101AAA',
      fiscalAddress: 'Calle 2, Monterrey, Nuevo León',
      supplierCode: '177',
    },
    createdAt: new Date('2026-11-18T00:43:35.000Z'),
    paymentTerms: 'Crédito a 30 días',
    paymentMethod: 'Transferencia electrónica',
    paymentDueDate: new Date('2026-12-17T00:00:00.000Z'),
    expectedDeliveryDate: new Date('2026-11-17T00:00:00.000Z'),
    buyerName: 'Comprador',
    items: [{
      productId: 'product-1',
      product: { name: 'Instrumental', sku: 'INS-1' },
      quantity: 2,
      price: 10.1234,
      subtotal: 20.25,
    }],
  };

  it('snapshots fiscal identity, terms and product description at confirmation', () => {
    const snapshot = buildPurchaseCommercialSnapshot(purchase);
    expect(snapshot).toMatchObject({
      version: 1,
      issuer: {
        legalName: 'Emisor S.A. de C.V.',
        fiscalAddress: 'Calle 1, Hermosillo, Sonora, C.P. 83000',
      },
      supplier: {
        legalName: 'Proveedor Legal S.A. de C.V.',
        rfc: 'PRL010101AAA',
      },
      terms: {
        paymentDueDate: '2026-12-17',
        expectedDeliveryDate: '2026-11-17',
      },
      items: [{ sku: 'INS-1', name: 'Instrumental', unitCost: 10.1234 }],
    });
    purchase.supplier.name = 'Nombre actualizado';
    purchase.items[0].product.name = 'Producto editado';
    expect(snapshot.supplier.name).toBe('Proveedor comercial');
    expect(snapshot.items[0].name).toBe('Instrumental');
  });

  it('formats issue timezone separately from calendar DATE fields', () => {
    expect(formatPurchaseIssueDate(purchase.createdAt, 'America/Hermosillo'))
      .toBe('17/11/2026');
    expect(formatPurchaseCalendarDate(purchase.paymentDueDate))
      .toBe('17/12/2026');
    expect(parsePurchaseCalendarDate('2026-12-17')?.toISOString())
      .toBe('2026-12-17T00:00:00.000Z');
  });

  it.each(['2026-02-30', '2026-13-01', '2026-11-00', '11/17/2026'])(
    'rejects impossible calendar day %s',
    (date) => {
      expect(() => parsePurchaseCalendarDate(date)).toThrow();
    },
  );

  it('tolerates missing dates and legacy documents without a snapshot', () => {
    expect(parsePurchaseCalendarDate(undefined)).toBeUndefined();
    expect(parsePurchaseCalendarDate(null)).toBeNull();
    expect(readPurchaseCommercialSnapshot(null)).toBeNull();
    const snapshot = buildPurchaseCommercialSnapshot(purchase);
    expect(readPurchaseCommercialSnapshot(snapshot)).toEqual(snapshot);
  });
});
