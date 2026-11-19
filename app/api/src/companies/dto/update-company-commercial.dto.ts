import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCompanyCommercialDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fiscalAddress?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  placeOfIssue?: string | null;
}
