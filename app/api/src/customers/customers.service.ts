import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  normalizePostalLookup(code: string, payload: unknown) {
    if (!payload || typeof payload !== 'object' || !('data' in payload)) {
      return { code, settlements: [] };
    }
    const data = payload.data;
    if (!data || typeof data !== 'object') {
      return { code, settlements: [] };
    }
    const postal = data as {
      state?: { name?: string };
      municipality?: { name?: string };
      city?: { name?: string } | null;
      settlements?: Array<{ name?: string }>;
    };
    return {
      code,
      state: postal.state?.name ?? '',
      municipality: postal.municipality?.name ?? '',
      city: postal.city?.name ?? postal.municipality?.name ?? '',
      settlements: Array.isArray(postal.settlements)
        ? postal.settlements
            .map((settlement) => settlement.name)
            .filter((name): name is string => typeof name === 'string')
        : [],
    };
  }

  normalizeGeographyOptions(payload: unknown) {
    if (!payload || typeof payload !== 'object' || !('data' in payload)) {
      return [];
    }
    const records = payload.data;
    if (!Array.isArray(records)) return [];

    return records.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return [];
      const item = entry as { id?: unknown; name?: unknown; code?: unknown };
      if (
        typeof item.id !== 'number' ||
        !Number.isSafeInteger(item.id) ||
        item.id < 1 ||
        typeof item.name !== 'string' ||
        !item.name.trim()
      ) {
        return [];
      }
      return [
        {
          id: item.id,
          name: item.name,
          ...(typeof item.code === 'string' ? { code: item.code } : {}),
        },
      ];
    });
  }

  async findOne(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        companyId,
      },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return customer;
  }

  /**
   * Bounded customer overview: counts include all document statuses, while
   * recent lists show five documents per type. This is not a full audit log.
   */
  async getOverview(companyId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, companyId },
      select: {
        id: true,
        name: true,
        legalName: true,
        type: true,
        email: true,
        phone: true,
        contactName: true,
        address: true,
        postalCode: true,
        neighborhood: true,
        municipality: true,
        city: true,
        state: true,
        countryCode: true,
        notes: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Cliente no encontrado');
    }

    const where = { companyId, customerId };
    const [quoteCount, saleCount, recentQuotes, recentSales] =
      await Promise.all([
        this.prisma.quote.count({ where }),
        this.prisma.sale.count({ where }),
        this.prisma.quote.findMany({
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
        }),
        this.prisma.sale.findMany({
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
        }),
      ]);

    return {
      customer,
      counts: { quotes: quoteCount, sales: saleCount },
      recentQuotes,
      recentSales,
    };
  }

  findAll(companyId: string) {
    return this.prisma.customer.findMany({
      where: {
        companyId,
        isActive: true,
      },

      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  create(companyId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        companyId,
        name: dto.name,
        legalName: dto.legalName,
        type: dto.type,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        postalCode: dto.postalCode,
        neighborhood: dto.neighborhood,
        municipality: dto.municipality,
        city: dto.city,
        state: dto.state,
        countryCode: dto.countryCode,
        contactName: dto.contactName,
        notes: dto.notes,
      },
    });
  }

  async update(companyId: string, customerId: string, dto: UpdateCustomerDto) {
    const customer = await this.findOne(companyId, customerId);
    const data = {
      name: dto.name,
      legalName: dto.legalName,
      type: dto.type,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      postalCode: dto.postalCode,
      neighborhood: dto.neighborhood,
      municipality: dto.municipality,
      city: dto.city,
      state: dto.state,
      countryCode: dto.countryCode,
      contactName: dto.contactName,
      notes: dto.notes,
    };

    if (Object.values(data).every((value) => value === undefined)) {
      return customer;
    }

    const result = await this.prisma.customer.updateMany({
      where: {
        id: customerId,
        companyId,
      },
      data,
    });

    if (result.count !== 1) {
      throw new NotFoundException('Cliente no encontrado');
    }

    return this.findOne(companyId, customerId);
  }

  async remove(companyId: string, customerId: string) {
    const customer = await this.findOne(companyId, customerId);

    if (!customer.isActive) {
      return customer;
    }

    await this.prisma.customer.updateMany({
      where: {
        id: customerId,
        companyId,
        isActive: true,
      },
      data: {
        isActive: false,
      },
    });

    return this.findOne(companyId, customerId);
  }
}
