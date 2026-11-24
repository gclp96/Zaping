import {
  Matches,
  MaxLength,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class PurchaseCommercialFields {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  paymentTerms?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(90)
  paymentMethod?: string | null;

  // Calendar dates are date-only, not UTC instants. Stored as PostgreSQL DATE.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de pago debe tener formato AAAA-MM-DD',
  })
  paymentDueDate?: string | null;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de entrega debe tener formato AAAA-MM-DD',
  })
  expectedDeliveryDate?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(500)
  costAdjustmentReason?: string;
}
