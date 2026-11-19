import { PurchasesService } from './purchases.service';
import { PrismaService } from '../prisma/prisma.service';
import { PurchasesFolioService } from './purchases-folio.service';

describe('purchase approval freezes commercial PDF identity', () => {
  const tx = {
    purchase: {
      updateMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(),
  };
  const service = new PurchasesService(
    prisma as unknown as PrismaService,
    {} as PurchasesFolioService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    tx.purchase.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    );
  });

  it('captures supplier, issuer, conditions and product descriptions in the confirmation transaction', async () => {
    const purchase = {
      id: 'purchase-1',
      companyId: 'company-a',
      folio: 'OC-26-00001',
      status: 'CONFIRMED',
      createdAt: new Date('2026-11-18T00:43:35.000Z'),
      company: {
        name: 'Empresa Legal',
        rfc: 'EMI010101AAA',
        timezone: 'America/Hermosillo',
        currency: 'MXN',
      },
      supplier: {
        name: 'Proveedor comercial',
        legalName: 'Proveedor Legal',
        rfc: 'HME091016DQ8',
        address: 'Calle 1',
      },
      paymentTerms: '30 días',
      paymentMethod: 'Transferencia electrónica',
      paymentDueDate: new Date('2026-12-17T00:00:00.000Z'),
      expectedDeliveryDate: new Date('2026-11-17T00:00:00.000Z'),
      items: [
        {
          productId: 'product-1',
          product: { sku: 'INS-1', name: 'Instrumento médico' },
          quantity: 2,
          price: 11.2345,
          subtotal: 22.47,
        },
      ],
    };
    tx.purchase.findFirst.mockResolvedValue(purchase);
    const result = await service.approve('company-a', 'purchase-1');

    expect(tx.purchase.updateMany).toHaveBeenCalledTimes(2);
    const calls = tx.purchase.updateMany.mock.calls as unknown as Array<
      [unknown]
    >;
    expect(calls[0][0]).toEqual({
      where: {
        id: 'purchase-1',
        companyId: 'company-a',
        status: 'DRAFT',
      },
      data: { status: 'CONFIRMED' },
    });

    const frozen = calls[1][0] as {
      where: { status: string; companyId: string };
      data: {
        commercialSnapshot: {
          issuer: { legalName: string };
          supplier: { legalName: string; rfc: string };
          terms: { paymentDueDate: string };
          items: Array<{ name: string; unitCost: number }>;
        };
      };
    };
    expect(frozen.where).toMatchObject({
      companyId: 'company-a',
      status: 'CONFIRMED',
    });
    expect(frozen.data.commercialSnapshot.issuer.legalName).toBe(
      'Empresa Legal',
    );
    expect(frozen.data.commercialSnapshot.supplier.rfc).toBe('HME091016DQ8');
    expect(frozen.data.commercialSnapshot.terms.paymentDueDate).toBe(
      '2026-12-17',
    );
    expect(frozen.data.commercialSnapshot.items[0].name).toBe(
      'Instrumento médico',
    );
    expect(frozen.data.commercialSnapshot.items[0].unitCost).toBe(11.2345);
    expect(result.commercialSnapshot).toEqual(frozen.data.commercialSnapshot);
  });

  it('rejects a purchase without lines before freezing a document', async () => {
    tx.purchase.findFirst.mockResolvedValue({
      items: [],
      supplier: { name: 'Proveedor' },
      company: { name: 'Empresa' },
    });
    await expect(service.approve('company-a', 'purchase-1')).rejects.toThrow(
      'No se puede confirmar una compra sin productos',
    );
    expect(tx.purchase.updateMany).toHaveBeenCalledTimes(1);
  });
});
