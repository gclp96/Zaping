import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { SUPPLIER_ATTACHMENT_MAX_BYTES } from '../supplier-document-attachment-validation';

export class ReserveSupplierAttachmentDto {
  @IsString()
  @MaxLength(255)
  originalName!: string;

  @IsIn(['application/pdf', 'image/jpeg'])
  contentType!: 'application/pdf' | 'image/jpeg';

  @IsInt()
  @Min(1)
  @Max(SUPPLIER_ATTACHMENT_MAX_BYTES)
  sizeBytes!: number;

  @Matches(/^[0-9a-f]{64}$/)
  sha256!: string;
}
