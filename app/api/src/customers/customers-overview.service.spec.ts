import { NotFoundException } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CustomersService customer overview', () => {
  const customer = {
    id: 'customer-a',
    name: 'Hospital QA',
    type: 'Hospital',
    email: 'compras@hospital.test',
    phone: '6621234567',
    contactName: null,
    address: null,
    notes: null,
    isActive: true,
    createdAt: new Date('2026-11-01T18:00:00.000Z'),
  };
  const customerFindFirst = jest.fn();
  const quoteCount = jest.fn();
  const saleCount = jest.fn();
  const quoteFindMany = jest.fn();
  const saleFindMany = jest.fn();
  const service = new CustomersService({
    customer: { findFirst: customerFindFirst },
    quote: { count: quoteCount, findMany: quoteFindMany },
    sale: { count: saleCount, findMany: saleFindMany },
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    customerFindFirst.mockResolvedValue(customer);
    quoteCount.mockResolvedValue(3);
    saleCount.mockResolvedValue(2);
    quoteFindMany.mockResolvedValue([
      {
        id: 'quote-1',
        folio: 'COT-001',
        status: 'CONFIRMED',
        total: 123.45,
        createdAt: new Date('2026-11-17T15:00:00.000Z'),
      },
    ]);
    saleFindMany.mockResolvedValue([]);
  });

  it('checks company ownership before reading related commercial documents', async () => {
    const overview = await service.getOverview('company-a', 'customer-a');

    expect(overview).toEqual({
      customer,
      counts: { quotes: 3, sales: 2 },
      recentQuotes: [
        {
          id: 'quote-1',
          folio: 'COT-001',
          status: 'CONFIRMED',
          total: 123.45,
          createdAt: new Date('2026-11-17T15:00:00.000Z'),
        },
      ],
      recentSales: [],
    });
    expect(customerFindFirst).toHaveBeenCalledWith({
      where: { id: 'customer-a', companyId: 'company-a' },
      select: {
        id: true,
        name: true,
        type: true,
        email: true,
        phone: true,
        contactName: true,
        address: true,
        notes: true,
        isActive: true,
        createdAt: true,
      },
    });
    const where = { companyId: 'company-a', customerId: 'customer-a' };
    expect(quoteCount).toHaveBeenCalledWith({ where });
    expect(saleCount).toHaveBeenCalledWith({ where });
    for (const query of [quoteFindMany, saleFindMany]) {
      expect(query).toHaveBeenCalledWith({
        where,
        select: {
          id: true,
          folio: true,
          status: true,
          total: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 5,
      });
    }
  });

  it('rejects cross-tenant or missing customers without querying documents', async () => {
    customerFindFirst.mockResolvedValue(null);

    await expect(
      service.getOverview('company-a', 'customer-of-company-b'),
    ).rejects.toThrow(new NotFoundException('Cliente no encontrado'));

    expect(quoteCount).not.toHaveBeenCalled();
    expect(saleCount).not.toHaveBeenCalled();
    expect(quoteFindMany).not.toHaveBeenCalled();
    expect(saleFindMany).not.toHaveBeenCalled();
  });

  it('also permits viewing the historical details of inactive customers', async () => {
    customerFindFirst.mockResolvedValue({ ...customer, isActive: false });

    const result = await service.getOverview('company-a', 'customer-a');
    expect(result.customer.isActive).toBe(false);
    expect(quoteCount).toHaveBeenCalledTimes(1);
  });
});
