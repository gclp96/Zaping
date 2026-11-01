import { IsUUID, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateReceiptDocumentLinkDto {
  @IsUUID()
  documentId!: string;
}

export class RemoveReceiptDocumentLinkDto {
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;
}
