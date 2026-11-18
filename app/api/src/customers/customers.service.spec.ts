import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from './customers.service';

const activeCustomer = {
  id: 'customer-1',
  companyId: 'company-1',
  name: 'Hospital Central',
  type: 'BUSINESS',
  email: 'compras@hospital.test',
  phone: '5551000000',
  address: null,
  contactName: null,
  creditLimit: null,
  notes: null,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  isActive: true,
};

const inactiveCustomer = {
  ...activeCustomer,
  isActive: false,
  updatedAt: new Date('2026-08-02T00:00:00.000Z'),
};

describe('CustomersService', () => {
  let service: CustomersService;
  let customer: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    customer = {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        {
          provide: PrismaService,
          useValue: { customer },
        },
      ],
    }).compile();

    service = moduleRef.get<CustomersService>(CustomersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists only active customers from the requested company', async () => {
    customer.findMany.mockResolvedValue([activeCustomer]);

    await expect(service.findAll('company-1')).resolves.toEqual([
      activeCustomer,
    ]);
    expect(customer.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        isActive: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  });

  it('retrieves an inactive customer for historical detail', async () => {
    customer.findFirst.mockResolvedValue(inactiveCustomer);

    await expect(service.findOne('company-1', 'customer-1')).resolves.toEqual(
      inactiveCustomer,
    );
    expect(customer.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'customer-1',
        companyId: 'company-1',
      },
    });
  });

  it('creates a customer without exposing lifecycle state', async () => {
    customer.create.mockResolvedValue(activeCustomer);

    await service.create('company-1', {
      name: activeCustomer.name,
      type: activeCustomer.type,
      email: activeCustomer.email,
      phone: activeCustomer.phone,
    });

    expect(customer.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        name: activeCustomer.name,
        type: activeCustomer.type,
        email: activeCustomer.email,
        phone: activeCustomer.phone,
        address: undefined,
        city: undefined,
        state: undefined,
        countryCode: undefined,
        contactName: undefined,
        notes: undefined,
      },
    });
  });

  it('updates through a tenant-scoped mutation without accepting lifecycle fields', async () => {
    const updatedCustomer = {
      ...activeCustomer,
      name: 'Hospital Central Norte',
    };
    customer.findFirst
      .mockResolvedValueOnce(activeCustomer)
      .mockResolvedValueOnce(updatedCustomer);
    customer.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.update('company-1', 'customer-1', {
        name: updatedCustomer.name,
        isActive: false,
      } as never),
    ).resolves.toEqual(updatedCustomer);

    expect(customer.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'customer-1',
        companyId: 'company-1',
      },
      data: {
        name: updatedCustomer.name,
        type: undefined,
        email: undefined,
        phone: undefined,
        address: undefined,
        city: undefined,
        state: undefined,
        countryCode: undefined,
        contactName: undefined,
        notes: undefined,
      },
    });
  });

  it('does not mutate a customer from another company', async () => {
    customer.findFirst.mockResolvedValue(null);

    await expect(
      service.update('company-1', 'customer-other', { name: 'Otro cliente' }),
    ).rejects.toThrow(new NotFoundException('Cliente no encontrado'));
    expect(customer.updateMany).not.toHaveBeenCalled();
  });

  it('treats a failed scoped update as not found', async () => {
    customer.findFirst.mockResolvedValue(activeCustomer);
    customer.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('company-1', 'customer-1', { name: 'Nuevo nombre' }),
    ).rejects.toThrow(new NotFoundException('Cliente no encontrado'));
  });

  it('deactivates an active customer without physically deleting it', async () => {
    customer.findFirst
      .mockResolvedValueOnce(activeCustomer)
      .mockResolvedValueOnce(inactiveCustomer);
    customer.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.remove('company-1', 'customer-1')).resolves.toEqual(
      inactiveCustomer,
    );
    expect(customer.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'customer-1',
        companyId: 'company-1',
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
    expect(customer.delete).not.toHaveBeenCalled();
  });

  it('returns an already inactive customer without another write', async () => {
    customer.findFirst.mockResolvedValue(inactiveCustomer);

    await expect(service.remove('company-1', 'customer-1')).resolves.toEqual(
      inactiveCustomer,
    );
    expect(customer.updateMany).not.toHaveBeenCalled();
    expect(customer.delete).not.toHaveBeenCalled();
  });

  it('does not deactivate a customer from another company', async () => {
    customer.findFirst.mockResolvedValue(null);

    await expect(service.remove('company-1', 'customer-other')).rejects.toThrow(
      new NotFoundException('Cliente no encontrado'),
    );
    expect(customer.updateMany).not.toHaveBeenCalled();
    expect(customer.delete).not.toHaveBeenCalled();
  });
});
