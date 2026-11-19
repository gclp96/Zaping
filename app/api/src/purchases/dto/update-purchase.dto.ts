import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';

import { CreatePurchaseItemDto } from './create-purchase-item.dto';
import { PurchaseCommercialFields } from './purchase-commercial-fields';

export class UpdatePurchaseDto extends PurchaseCommercialFields {
  @IsUUID('4', {
    message: 'El proveedor debe tener un identificador válido',
  })
  supplierId!: string;

  @IsArray({
    message: 'Las partidas deben enviarse como un arreglo',
  })
  @ArrayMinSize(1, {
    message: 'Debe enviar al menos una partida',
  })
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items!: CreatePurchaseItemDto[];
}
