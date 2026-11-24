import { Module } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';
import { CompanyCommercialSettingsController } from './company-commercial-settings.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  providers: [CompaniesService, PrismaService],
  controllers: [CompaniesController, CompanyCommercialSettingsController],
})
export class CompaniesModule {}
