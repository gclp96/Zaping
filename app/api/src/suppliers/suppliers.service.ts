import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.supplier.findMany({
      where: {
        companyId,
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  async findOne(companyId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id: supplierId,
        companyId,
      },
    });

    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    return supplier;
  }

  async create(companyId: string, dto: CreateSupplierDto) {
    const existingSupplier = await this.prisma.supplier.findFirst({
      where: {
        companyId,
        name: dto.name,
        email: dto.email,
      },
    });

    if (existingSupplier) {
      throw new BadRequestException('Ya existe un proveedor con ese nombre');
    }

    return this.prisma.supplier.create({
      data: {
        companyId,
        name: dto.name,
        ...(dto.legalName !== undefined && { legalName: dto.legalName }),
        ...(dto.rfc !== undefined && { rfc: dto.rfc }),
        ...(dto.fiscalAddress !== undefined && {
          fiscalAddress: dto.fiscalAddress,
        }),
        ...(dto.supplierCode !== undefined && {
          supplierCode: dto.supplierCode,
        }),
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        contactName: dto.contactName,
        notes: dto.notes,
      },
    });
  }

  async update(companyId: string, supplierId: string, dto: UpdateSupplierDto) {
    const supplier = await this.findOne(companyId, supplierId);
    const data = {
      name: dto.name,
      ...(dto.legalName !== undefined && { legalName: dto.legalName }),
      ...(dto.rfc !== undefined && { rfc: dto.rfc }),
      ...(dto.fiscalAddress !== undefined && {
        fiscalAddress: dto.fiscalAddress,
      }),
      ...(dto.supplierCode !== undefined && {
        supplierCode: dto.supplierCode,
      }),
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      contactName: dto.contactName,
      notes: dto.notes,
    };

    if (Object.values(data).every((value) => value === undefined)) {
      return supplier;
    }

    const result = await this.prisma.supplier.updateMany({
      where: {
        id: supplierId,
        companyId,
      },
      data,
    });

    if (result.count !== 1) {
      throw new NotFoundException('Proveedor no encontrado');
    }

    return this.findOne(companyId, supplierId);
  }

  async remove(companyId: string, supplierId: string) {
    const supplier = await this.findOne(companyId, supplierId);

    if (!supplier.isActive) {
      return supplier;
    }

    await this.prisma.supplier.updateMany({
      where: {
        id: supplierId,
        companyId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    return this.findOne(companyId, supplierId);
  }
}
