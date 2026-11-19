import { ProductInventoryTracking, ProductLotTracking } from '@prisma/client';

import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';

import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9\-_]+$/)
  sku!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  brand?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsOptional()
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitOfMeasure?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minStock!: number;

  @IsEnum(ProductInventoryTracking)
  @IsOptional()
  inventoryTracking?: ProductInventoryTracking;

  @IsEnum(ProductLotTracking)
  @IsOptional()
  lotTracking?: ProductLotTracking;
}
