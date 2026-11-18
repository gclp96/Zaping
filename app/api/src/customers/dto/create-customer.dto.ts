import {
  IsString,
  IsEmail,
  IsOptional,
  IsIn,
  MaxLength,
  Matches,
} from 'class-validator';
import { CUSTOMER_TYPES } from '../customer-types';

export class CreateCustomerDto {
  @IsString()
  name!: string;

  @IsString()
  @IsIn([...CUSTOMER_TYPES])
  type!: string;

  @IsEmail()
  email!: string;

  @IsString()
  phone!: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  city?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  state?: string | null;

  @IsString()
  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string | null;

  @IsString()
  @IsOptional()
  contactName?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
