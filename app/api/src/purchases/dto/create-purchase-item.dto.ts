import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsUUID, Min, ValidateIf } from 'class-validator';

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
}
