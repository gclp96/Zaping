import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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
} satisfies Prisma.UserSelect;

type SafeUser = Prisma.UserGetPayload<{ select: typeof safeUserSelect }>;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll(companyId: string): Promise<SafeUser[]> {
    return this.prisma.user.findMany({
      where: { companyId },
      select: safeUserSelect,
      orderBy: [{ createdAt: 'asc' }, { email: 'asc' }],
    });
  }

  async findOne(companyId: string, userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, companyId },
      select: safeUserSelect,
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return user;
  }

  async create(companyId: string, dto: CreateUserDto): Promise<SafeUser> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Ya existe un usuario con ese correo');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: {
        companyId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        passwordHash,
        role: dto.role,
        canAdjustPurchaseUnitCost:
          dto.role === UserRole.WAREHOUSE &&
          dto.canAdjustPurchaseUnitCost === true,
      },
      select: safeUserSelect,
    });
  }

  async update(
    companyId: string,
    currentUserId: string,
    userId: string,
    dto: UpdateUserDto,
  ): Promise<SafeUser> {
    const currentUser = await this.findOne(companyId, userId);

    if (dto.email && dto.email !== currentUser.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Ya existe un usuario con ese correo');
      }
    }

    const finalRole = dto.role ?? currentUser.role;
    const finalIsActive = dto.isActive ?? currentUser.isActive;

    if (
      userId === currentUserId &&
      currentUser.isActive &&
      finalIsActive === false
    ) {
      throw new BadRequestException('No puedes desactivar tu propio usuario');
    }

    await this.ensureLastActiveAdminIsPreserved(
      companyId,
      currentUser,
      finalRole,
      finalIsActive,
    );

    const data: Prisma.UserUpdateManyMutationInput = {};

    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (finalRole !== UserRole.WAREHOUSE) {
      if (dto.role !== undefined || dto.canAdjustPurchaseUnitCost === true) {
        data.canAdjustPurchaseUnitCost = false;
      }
    } else if (dto.canAdjustPurchaseUnitCost !== undefined) {
      data.canAdjustPurchaseUnitCost = dto.canAdjustPurchaseUnitCost;
    }

    if (Object.keys(data).length === 0) {
      return currentUser;
    }

    const result = await this.prisma.user.updateMany({
      where: { id: userId, companyId },
      data,
    });

    if (result.count !== 1) {
      throw new NotFoundException('Usuario no encontrado');
    }

    return this.findOne(companyId, userId);
  }

  private async ensureLastActiveAdminIsPreserved(
    companyId: string,
    currentUser: SafeUser,
    finalRole: UserRole,
    finalIsActive: boolean,
  ) {
    const removesActiveAdmin =
      currentUser.role === UserRole.ADMIN &&
      currentUser.isActive &&
      (finalRole !== UserRole.ADMIN || !finalIsActive);

    if (!removesActiveAdmin) {
      return;
    }

    const activeAdminCount = await this.prisma.user.count({
      where: {
        companyId,
        role: UserRole.ADMIN,
        isActive: true,
      },
    });

    if (activeAdminCount <= 1) {
      throw new ConflictException(
        'La empresa debe conservar al menos un ADMIN activo',
      );
    }
  }
}
