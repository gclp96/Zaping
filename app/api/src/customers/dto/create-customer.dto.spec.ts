import { BadRequestException, ValidationPipe } from '@nestjs/common';

import { CUSTOMER_TYPES } from '../customer-types';
import { CreateCustomerDto } from './create-customer.dto';
import { UpdateCustomerDto } from './update-customer.dto';

describe('CreateCustomerDto', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const transformDto = (value: Record<string, unknown>) =>
    validationPipe.transform(value, {
      type: 'body',
      metatype: CreateCustomerDto,
    });

  const validPayload = {
    name: 'Hospital Central',
    type: 'BUSINESS',
    email: 'compras@hospital.test',
    phone: '5551000000',
  };

  it('accepts the existing customer creation contract', async () => {
    await expect(transformDto(validPayload)).resolves.toMatchObject(
      validPayload,
    );
  });

  it.each(CUSTOMER_TYPES)('accepts controlled type %s', async (type) => {
    await expect(transformDto({ ...validPayload, type })).resolves.toMatchObject({
      ...validPayload,
      type,
    });
  });

  it.each(['Licitación', 'CLINICA LIBRE', ''])(
    'rejects type outside catalog %s',
    async (type) => {
      await expect(
        transformDto({ ...validPayload, type }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('validates location fields and preserves the existing address field', async () => {
    await expect(
      transformDto({
        ...validPayload,
        city: 'Hermosillo',
        state: 'Sonora',
        countryCode: 'MX',
        address: 'Calle 100',
      }),
    ).resolves.toMatchObject({
      city: 'Hermosillo',
      state: 'Sonora',
      countryCode: 'MX',
      address: 'Calle 100',
    });
    await expect(
      transformDto({ ...validPayload, countryCode: 'MEX' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows partial updates without rewriting historical types', async () => {
    await expect(
      validationPipe.transform({ city: 'Nogales' }, {
        type: 'body',
        metatype: UpdateCustomerDto,
      }),
    ).resolves.toMatchObject({ city: 'Nogales' });
  });

  it('rejects client-provided isActive', async () => {
    await expect(
      transformDto({
        ...validPayload,
        isActive: false,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
