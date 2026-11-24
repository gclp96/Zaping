import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { CompanySequenceAllocatorService } from '../company-sequences/company-sequence-allocator.service';
import { SuppliersService } from './suppliers.service';

const activeSupplier = {
  id: 'supplier-1',
  companyId: 'company-1',
  name: 'Proveedor Médico',
  email: 'ventas@proveedor.test',
  phone: '5552000000',
  address: null,
  contactName: null,
  notes: null,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  isActive: true,
};

const inactiveSupplier = {
  ...activeSupplier,
  isActive: false,
  updatedAt: new Date('2026-08-02T00:00:00.000Z'),
};

describe('SuppliersService', () => {
  let service: SuppliersService;
  const sequence = { allocateNext: jest.fn() };
  let supplier: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    sequence.allocateNext.mockResolvedValue(1);
    supplier = {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
        {
          provide: PrismaService,
          useValue: {
            supplier,
            $transaction: async (
              fn: (tx: { supplier: typeof supplier }) => Promise<unknown>,
            ) => fn({ supplier }),
          },
        },
        {
          provide: CompanySequenceAllocatorService,
          useValue: sequence,
        },
      ],
    }).compile();

    service = moduleRef.get<SuppliersService>(SuppliersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists only active suppliers from the requested company', async () => {
    supplier.findMany.mockResolvedValue([activeSupplier]);

    await expect(service.findAll('company-1')).resolves.toEqual([
      activeSupplier,
    ]);
    expect(supplier.findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  });

  it('retrieves an inactive supplier for historical detail', async () => {
    supplier.findFirst.mockResolvedValue(inactiveSupplier);

    await expect(service.findOne('company-1', 'supplier-1')).resolves.toEqual(
      inactiveSupplier,
    );
    expect(supplier.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'supplier-1',
        companyId: 'company-1',
      },
    });
  });

  it('creates a supplier without exposing lifecycle state', async () => {
    supplier.findFirst.mockResolvedValue(null);
    supplier.create.mockResolvedValue(activeSupplier);

    await service.create('company-1', {
      name: activeSupplier.name,
      email: activeSupplier.email,
      phone: activeSupplier.phone,
    });

    expect(sequence.allocateNext).toHaveBeenCalledWith(
      expect.objectContaining({ supplier }),
      'company-1',
      'SUPPLIER_CODE',
    );
    expect(supplier.create).toHaveBeenCalledWith({
      data: {
        companyId: 'company-1',
        supplierCode: '0001',
        name: activeSupplier.name,
        email: activeSupplier.email,
        phone: activeSupplier.phone,
        address: undefined,
        contactName: undefined,
        notes: undefined,
      },
    });
  });

  it('skips an already used numeric code without renumbering its owner', async () => {
    supplier.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-code' })
      .mockResolvedValueOnce(null);
    sequence.allocateNext.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    supplier.create.mockResolvedValue({
      ...activeSupplier,
      supplierCode: '0002',
    });

    await service.create('company-1', {
      name: 'Proveedor con consecutivo',
    });

    expect(sequence.allocateNext).toHaveBeenCalledTimes(2);
    const [createArgs] = supplier.create.mock.calls[0] as [
      { data: { companyId: string; supplierCode: string } },
    ];
    expect(createArgs.data.companyId).toBe('company-1');
    expect(createArgs.data.supplierCode).toBe('0002');
  });

  it('does not allow a tenant to assign a supplier code already in use', async () => {
    supplier.findFirst
      .mockResolvedValueOnce({ ...activeSupplier, supplierCode: '0001' })
      .mockResolvedValueOnce({ id: 'other-supplier' });

    await expect(
      service.update('company-1', activeSupplier.id, {
        supplierCode: '0002',
      }),
    ).rejects.toThrow('El código ya está asignado a otro proveedor');
    expect(supplier.updateMany).not.toHaveBeenCalled();
  });

  it('rejects invalid manual numeric conversion of a legacy supplier code', async () => {
    supplier.findFirst.mockResolvedValue({
      ...activeSupplier,
      supplierCode: 'PROV-UX007-001',
    });

    await expect(
      service.update('company-1', activeSupplier.id, {
        supplierCode: 'AB001',
      }),
    ).rejects.toThrow('El código debe contener entre 4 y 12 dígitos');
    expect(supplier.updateMany).not.toHaveBeenCalled();
  });

  it('updates through a tenant-scoped mutation without accepting lifecycle fields', async () => {
    const updatedSupplier = {
      ...activeSupplier,
      name: 'Proveedor Médico Norte',
    };
    supplier.findFirst
      .mockResolvedValueOnce(activeSupplier)
      .mockResolvedValueOnce(updatedSupplier);
    supplier.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.update('company-1', 'supplier-1', {
        name: updatedSupplier.name,
        isActive: false,
      } as never),
    ).resolves.toEqual(updatedSupplier);

    expect(supplier.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'supplier-1',
        companyId: 'company-1',
      },
      data: {
        name: updatedSupplier.name,
        email: undefined,
        phone: undefined,
        address: undefined,
        contactName: undefined,
        notes: undefined,
      },
    });
  });

  it('does not mutate a supplier from another company', async () => {
    supplier.findFirst.mockResolvedValue(null);

    await expect(
      service.update('company-1', 'supplier-other', {
        name: 'Otro proveedor',
      }),
    ).rejects.toThrow(new NotFoundException('Proveedor no encontrado'));
    expect(supplier.updateMany).not.toHaveBeenCalled();
  });

  it('treats a failed scoped update as not found', async () => {
    supplier.findFirst.mockResolvedValue(activeSupplier);
    supplier.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('company-1', 'supplier-1', { name: 'Nuevo nombre' }),
    ).rejects.toThrow(new NotFoundException('Proveedor no encontrado'));
  });

  it('deactivates an active supplier without physically deleting it', async () => {
    supplier.findFirst
      .mockResolvedValueOnce(activeSupplier)
      .mockResolvedValueOnce(inactiveSupplier);
    supplier.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.remove('company-1', 'supplier-1')).resolves.toEqual(
      inactiveSupplier,
    );
    expect(supplier.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'supplier-1',
        companyId: 'company-1',
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });
    expect(supplier.delete).not.toHaveBeenCalled();
  });

  it('returns an already inactive supplier without another write', async () => {
    supplier.findFirst.mockResolvedValue(inactiveSupplier);

    await expect(service.remove('company-1', 'supplier-1')).resolves.toEqual(
      inactiveSupplier,
    );
    expect(supplier.updateMany).not.toHaveBeenCalled();
    expect(supplier.delete).not.toHaveBeenCalled();
  });

  it('does not deactivate a supplier from another company', async () => {
    supplier.findFirst.mockResolvedValue(null);

    await expect(service.remove('company-1', 'supplier-other')).rejects.toThrow(
      new NotFoundException('Proveedor no encontrado'),
    );
    expect(supplier.updateMany).not.toHaveBeenCalled();
    expect(supplier.delete).not.toHaveBeenCalled();
  });
});
