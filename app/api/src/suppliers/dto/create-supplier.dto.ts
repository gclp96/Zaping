import {
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsEmail,
} from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[A-Za-zÁÉÍÓÚáéíóúÑñ0-9\s.\-()]+$/, {
    message: 'El nombre solo puede contener letras y espacios',
  })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  legalName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/, {
    message: 'El RFC del proveedor debe tener 12 o 13 caracteres válidos',
  })
  rfc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fiscalAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  supplierCode?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
