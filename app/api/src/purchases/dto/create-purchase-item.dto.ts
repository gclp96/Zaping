import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsUUID, Max, Min, ValidateIf } from 'class-validator';

export class CreatePurchaseItemDto {
  @IsUUID('4', {
    message: 'El producto debe tener un identificador válido',
  })
  productId!: string;

  @Type(() => Number)
  @IsInt({
    message: 'La cantidad debe ser un número entero',
  })
  @Min(1, {
    message: 'La cantidad debe ser mayor o igual a 1',
  })
  quantity!: number;

  // Optional per-order negotiated cost. Missing means use the product catalog
  // cost (create) or preserve the draft line's cost (update).
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 },
    { message: 'El costo unitario debe ser un número con máximo 4 decimales' },
  )
  @Min(0, { message: 'El costo unitario no puede ser negativo' })
  unitCost?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsNumber(
    { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 },
    { message: 'El descuento debe ser un porcentaje de máximo 2 decimales' },
  )
  @Min(0, { message: 'El descuento no puede ser negativo' })
  @Max(100, { message: 'El descuento no puede superar 100%' })
  discountPercent?: number;
}
