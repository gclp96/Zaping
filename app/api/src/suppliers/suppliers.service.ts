import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CompanySequenceAllocatorService } from '../company-sequences/company-sequence-allocator.service';

import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: CompanySequenceAllocatorService,
  ) {}

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
    return this.prisma.$transaction(async (tx) => {
      const existingSupplier = await tx.supplier.findFirst({
        where: {
          companyId,
          name: dto.name,
        },
        select: { id: true },
      });

      if (existingSupplier) {
        throw new BadRequestException('Ya existe un proveedor con ese nombre');
      }

      // CompanySequenceAllocatorService serializes allocations in PostgreSQL.
      // Never reuse a numeric code already assigned to a historical supplier.
      let supplierCode = '';
      while (true) {
        const number = await this.sequences.allocateNext(
          tx,
          companyId,
          'SUPPLIER_CODE',
        );
        if (!Number.isSafeInteger(number) || number < 1 || number > 999999999) {
          throw new ConflictException('Se agotó la numeración de proveedores');
        }
        const candidate = String(number).padStart(4, '0');
        const existingCode = await tx.supplier.findFirst({
          where: { companyId, supplierCode: candidate },
          select: { id: true },
        });
        if (!existingCode) {
          supplierCode = candidate;
          break;
        }
      }

      return tx.supplier.create({
        data: {
          companyId,
          name: dto.name,
          ...(dto.legalName !== undefined && { legalName: dto.legalName }),
          ...(dto.rfc !== undefined && { rfc: dto.rfc }),
          ...(dto.fiscalAddress !== undefined && {
            fiscalAddress: dto.fiscalAddress,
          }),
          supplierCode,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          contactName: dto.contactName,
          notes: dto.notes,
        },
      });
    });
  }

  async update(companyId: string, supplierId: string, dto: UpdateSupplierDto) {
    const supplier = await this.findOne(companyId, supplierId);
    if (dto.supplierCode !== undefined && dto.supplierCode !== supplier.supplierCode) {
      if (!/^\\d{4,12}$/.test(dto.supplierCode)) {
        throw new BadRequestException('El código debe contener entre 4 y 12 dígitos');
      }
      const assigned = await this.prisma.supplier.findFirst({
        where: {
          companyId,
          supplierCode: dto.supplierCode,
          id: { not: supplierId },
        },
        select: { id: true },
      });
      if (assigned) throw new ConflictException('El código ya está asignado a otro proveedor');
    }

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
