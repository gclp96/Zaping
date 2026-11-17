import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { R2StorageService } from './r2-storage.service';
import { ZapingFilesController } from './zaping-files.controller';
import { ZapingFilesService } from './zaping-files.service';

@Module({
  imports: [PrismaModule],
  providers: [R2StorageService, ZapingFilesService],
  controllers: [ZapingFilesController],
})
export class ZapingFilesModule {}
