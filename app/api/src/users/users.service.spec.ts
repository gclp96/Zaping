import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let prismaMock: {
    user: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
  };

  const companyId = 'company-1';
  const currentAdminId = 'admin-1';
  const userId = 'user-1';

  const safeUser = {
    id: userId,
    companyId,
    email: 'user@zaping.test',
    firstName: 'User',
    lastName: 'Zaping',
    role: UserRole.SALES,
    canAdjustPurchaseUnitCost: false,
    isActive: true,
    createdAt: new Date('2026-08-30T10:00:00.000Z'),
    updatedAt: new Date('2026-08-30T10:00:00.000Z'),
  };

  const safeAdmin = {
    ...safeUser,
    id: currentAdminId,
    email: 'admin@zaping.test',
    role: UserRole.ADMIN,
  };

  const safeUserSelect = {
    id: true,
    companyId: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    canAdjustPurchaseUnitCost: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  };

  beforeEach(async () => {
    jest.resetAllMocks();

    prismaMock = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
      ],
    }).compile();

    service = moduleRef.get<UsersService>(UsersService);
  });

  it('lists safe users scoped to companyId', async () => {
    prismaMock.user.findMany.mockResolvedValue([safeUser]);

    await expect(service.findAll(companyId)).resolves.toEqual([safeUser]);

    expect(prismaMock.user.findMany).toHaveBeenCalledWith({
      where: { companyId },
      select: safeUserSelect,
      orderBy: [{ createdAt: 'asc' }, { email: 'asc' }],
    });
  });

  it('finds one safe user scoped to companyId', async () => {
    prismaMock.user.findFirst.mockResolvedValue(safeUser);

    await expect(service.findOne(companyId, userId)).resolves.toEqual(safeUser);

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { id: userId, companyId },
      select: safeUserSelect,
    });
  });

  it('throws NotFound when a user is missing or belongs to another company', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(service.findOne(companyId, userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates a user with companyId, explicit role, hashed password, and safe select', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(safeUser);

    await expect(
      service.create(companyId, {
        firstName: 'User',
        lastName: 'Zaping',
        email: 'user@zaping.test',
        password: 'secure-password',
        role: UserRole.SALES,
      }),
    ).resolves.toEqual(safeUser);

    const createCall = prismaMock.user.create.mock.calls[0] as [
      { data: { passwordHash: string } },
    ];

    expect(createCall[0]).toEqual({
      data: {
        companyId,
        firstName: 'User',
        lastName: 'Zaping',
        email: 'user@zaping.test',
        passwordHash: createCall[0].data.passwordHash,
        role: UserRole.SALES,
        canAdjustPurchaseUnitCost: false,
      },
      select: safeUserSelect,
    });
    expect(typeof createCall[0].data.passwordHash).toBe('string');

    await expect(
      bcrypt.compare('secure-password', createCall[0].data.passwordHash),
    ).resolves.toBe(true);
    expect(safeUser).not.toHaveProperty('passwordHash');
  });

  it('permite otorgar permiso de costo al encargado WAREHOUSE sin cambiar el rol', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue({
      ...safeUser, role: UserRole.WAREHOUSE, canAdjustPurchaseUnitCost: true,
    });
    await service.create(companyId, {
      firstName: 'Comprador',
      lastName: 'Zaping',
      email: 'comprador@zaping.test',
      password: 'secure-password',
      role: UserRole.WAREHOUSE,
      canAdjustPurchaseUnitCost: true,
    });
    expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        role: UserRole.WAREHOUSE,
        canAdjustPurchaseUnitCost: true,
      }),
    }));
  });

  it('no concede el permiso especial a roles ajenos a WAREHOUSE', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(safeUser);
    await service.create(companyId, {
      firstName: 'Vendedor',
      lastName: 'Zaping',
      email: 'vendedor@zaping.test',
      password: 'secure-password',
      role: UserRole.SALES,
      canAdjustPurchaseUnitCost: true,
    });
    expect(prismaMock.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ canAdjustPurchaseUnitCost: false }),
    }));
  });

  it('rejects duplicate emails on create', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.create(companyId, {
        firstName: 'User',
        lastName: 'Zaping',
        email: 'user@zaping.test',
        password: 'secure-password',
        role: UserRole.SALES,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows creating another ADMIN without relying on a default role', async () => {
    const secondAdmin = {
      ...safeAdmin,
      id: 'admin-2',
      email: 'admin2@zaping.test',
    };

    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.user.create.mockResolvedValue(secondAdmin);

    await expect(
      service.create(companyId, {
        firstName: 'Second',
        lastName: 'Admin',
        email: 'admin2@zaping.test',
        password: 'secure-password',
        role: UserRole.ADMIN,
      }),
    ).resolves.toEqual(secondAdmin);

    const createCall = prismaMock.user.create.mock.calls[0] as [
      { data: { companyId: string; role: UserRole } },
    ];

    expect(createCall[0].data.companyId).toBe(companyId);
    expect(createCall[0].data.role).toBe(UserRole.ADMIN);
    expect(prismaMock.user.count).not.toHaveBeenCalled();
  });

  it('updates only allowed fields and returns a safe user', async () => {
    const updatedUser = {
      ...safeUser,
      firstName: 'Updated',
      role: UserRole.MANAGER,
      isActive: false,
    };

    prismaMock.user.findFirst
      .mockResolvedValueOnce(safeUser)
      .mockResolvedValueOnce(updatedUser);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.update(companyId, currentAdminId, userId, {
        firstName: 'Updated',
        role: UserRole.MANAGER,
        isActive: false,
      }),
    ).resolves.toEqual(updatedUser);

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: userId, companyId },
      data: {
        firstName: 'Updated',
        role: UserRole.MANAGER,
        isActive: false,
        canAdjustPurchaseUnitCost: false,
      },
    });
  });

  it('reactivates an inactive user', async () => {
    const inactiveUser = { ...safeUser, isActive: false };
    const reactivatedUser = { ...safeUser, isActive: true };

    prismaMock.user.findFirst
      .mockResolvedValueOnce(inactiveUser)
      .mockResolvedValueOnce(reactivatedUser);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.update(companyId, currentAdminId, userId, {
        isActive: true,
      }),
    ).resolves.toEqual(reactivatedUser);

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: { id: userId, companyId },
      data: { isActive: true },
    });
  });

  it('checks duplicate emails only when the email changes', async () => {
    prismaMock.user.findFirst
      .mockResolvedValueOnce(safeUser)
      .mockResolvedValueOnce({ ...safeUser, email: 'same@zaping.test' });
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

    await service.update(companyId, currentAdminId, userId, {
      email: 'same@zaping.test',
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'same@zaping.test' },
      select: { id: true },
    });
  });

  it('rejects duplicate emails on update', async () => {
    prismaMock.user.findFirst.mockResolvedValue(safeUser);
    prismaMock.user.findUnique.mockResolvedValue({ id: 'other-user' });

    await expect(
      service.update(companyId, currentAdminId, userId, {
        email: 'taken@zaping.test',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFound for cross-tenant updates before mutating', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(
      service.update(companyId, currentAdminId, userId, {
        firstName: 'Updated',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('returns the current user for no-op updates', async () => {
    prismaMock.user.findFirst.mockResolvedValue(safeUser);

    await expect(
      service.update(companyId, currentAdminId, userId, {}),
    ).resolves.toBe(safeUser);

    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it('prevents self-deactivation', async () => {
    prismaMock.user.findFirst.mockResolvedValue(safeAdmin);

    await expect(
      service.update(companyId, currentAdminId, currentAdminId, {
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents deactivating the last active ADMIN', async () => {
    prismaMock.user.findFirst.mockResolvedValue(safeAdmin);
    prismaMock.user.count.mockResolvedValue(1);

    await expect(
      service.update(companyId, 'another-admin', currentAdminId, {
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { companyId, role: UserRole.ADMIN, isActive: true },
    });
  });

  it('prevents demoting the last active ADMIN', async () => {
    prismaMock.user.findFirst.mockResolvedValue(safeAdmin);
    prismaMock.user.count.mockResolvedValue(1);

    await expect(
      service.update(companyId, currentAdminId, currentAdminId, {
        role: UserRole.MANAGER,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents last active ADMIN removal even when inactive ADMIN users exist', async () => {
    prismaMock.user.findFirst.mockResolvedValue(safeAdmin);
    prismaMock.user.count.mockResolvedValue(1);

    await expect(
      service.update(companyId, 'another-admin', currentAdminId, {
        role: UserRole.WAREHOUSE,
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { companyId, role: UserRole.ADMIN, isActive: true },
    });
  });

  it('allows ADMIN deactivation when another active ADMIN exists and target is not self', async () => {
    const deactivatedAdmin = { ...safeAdmin, isActive: false };

    prismaMock.user.findFirst
      .mockResolvedValueOnce(safeAdmin)
      .mockResolvedValueOnce(deactivatedAdmin);
    prismaMock.user.count.mockResolvedValue(2);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.update(companyId, 'another-admin', currentAdminId, {
        isActive: false,
      }),
    ).resolves.toEqual(deactivatedAdmin);
  });

  it('allows ADMIN demotion when another active ADMIN exists', async () => {
    const updatedUser = { ...safeAdmin, role: UserRole.MANAGER };

    prismaMock.user.findFirst
      .mockResolvedValueOnce(safeAdmin)
      .mockResolvedValueOnce(updatedUser);
    prismaMock.user.count.mockResolvedValue(2);
    prismaMock.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.update(companyId, currentAdminId, currentAdminId, {
        role: UserRole.MANAGER,
      }),
    ).resolves.toEqual(updatedUser);
  });
});
