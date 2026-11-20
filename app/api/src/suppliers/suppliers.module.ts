import { Module } from '@nestjs/common';

import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';

import { PrismaModule } from '../prisma/prisma.module';
import { CompanySequencesModule } from '../company-sequences/company-sequences.module';

@Module({
  imports: [PrismaModule, CompanySequencesModule],
  controllers: [SuppliersController],
  providers: [SuppliersService],
})
export class SuppliersModule {}
