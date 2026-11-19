import { Injectable, NotFoundException } from '@nestjs/common';
import { UpdateCompanyCommercialDto } from './dto/update-company-commercial.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CompaniesService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.company.findMany();
  }

  async findOwn(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        tradeName: true,
        rfc: true,
        email: true,
        phone: true,
        fiscalAddress: true,
        placeOfIssue: true,
        timezone: true,
        currency: true,
      },
    });
    if (!company) throw new NotFoundException('Empresa no encontrada');
    return company;
  }

  async updateOwnCommercial(
    companyId: string,
    dto: UpdateCompanyCommercialDto,
  ) {
    const result = await this.prisma.company.updateMany({
      where: { id: companyId },
      data: {
        ...(dto.fiscalAddress !== undefined && {
          fiscalAddress: dto.fiscalAddress,
        }),
        ...(dto.placeOfIssue !== undefined && {
          placeOfIssue: dto.placeOfIssue,
        }),
      },
    });
    if (result.count !== 1) {
      throw new NotFoundException('Empresa no encontrada');
    }
    return this.findOwn(companyId);
  }

  async create(data: {
    name: string;
    tradeName?: string;
    rfc: string;
    email?: string;
    phone?: string;
  }) {
    return this.prisma.company.create({
      data,
    });
  }
}
