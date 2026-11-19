import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreatePurchaseItemDto } from './create-purchase-item.dto';

const base = {
  productId: '44444444-4444-4444-8444-444444444444',
  quantity: 2,
};

describe('CreatePurchaseItemDto — negotiated cost', () => {
  it('keeps legacy requests valid without a cost', async () => {
    expect(await validate(plainToInstance(CreatePurchaseItemDto, base))).toHaveLength(0);
  });

  it.each([0, 12.34, 123.4567])('accepts non-negative negotiated price %s', async (unitCost) => {
    const dto = plainToInstance(CreatePurchaseItemDto, { ...base, unitCost });
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([-1, 12.34567, Number.POSITIVE_INFINITY, '12.34', null])(
    'rejects invalid price %s',
    async (unitCost) => {
      const dto = plainToInstance(CreatePurchaseItemDto, { ...base, unitCost });
      expect((await validate(dto)).some((error) => error.property === 'unitCost')).toBe(true);
    },
  );
});
