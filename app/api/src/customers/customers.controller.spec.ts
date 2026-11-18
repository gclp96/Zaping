import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

describe('CustomersController', () => {
  let controller: CustomersController;
  const getOverview = jest.fn();
  const normalizePostalLookup = jest.fn();
  const originalKey = process.env.POSTALKIT_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) {
      delete process.env.POSTALKIT_API_KEY;
    } else {
      process.env.POSTALKIT_API_KEY = originalKey;
    }
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        {
          provide: CustomersService,
          useValue: { getOverview, normalizePostalLookup },
        },
      ],
    }).compile();

    controller = moduleRef.get<CustomersController>(CustomersController);
  });

  it('delegates overview to the authenticated company only', () => {
    getOverview.mockReturnValue({ customer: { id: 'customer-1' } });
    const request = { user: { companyId: 'company-a' } };

    expect(controller.getOverview(request, 'customer-1')).toEqual({
      customer: { id: 'customer-1' },
    });
    expect(getOverview).toHaveBeenCalledWith('company-a', 'customer-1');
  });

  it('rejects invalid postal codes without requesting the provider', async () => {
    const provider = jest.spyOn(global, 'fetch');
    process.env.POSTALKIT_API_KEY = 'test-key';
    await expect(controller.lookupPostalCode('8300')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(provider).not.toHaveBeenCalled();
  });

  it('does not contact the provider without its server-side credential', async () => {
    delete process.env.POSTALKIT_API_KEY;
    const provider = jest.spyOn(global, 'fetch');
    await expect(controller.lookupPostalCode('83000')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(provider).not.toHaveBeenCalled();
  });

  it('normalizes a successful postal lookup without exposing credentials', async () => {
    process.env.POSTALKIT_API_KEY = 'test-key';
    const providerPayload = {
      data: {
        state: { name: 'Sonora' },
        municipality: { name: 'Hermosillo' },
        city: { name: 'Hermosillo' },
        settlements: [{ name: 'Centro' }],
      },
    };
    const result = { code: '83000', state: 'Sonora', settlements: ['Centro'] };
    normalizePostalLookup.mockReturnValue(result);
    const provider = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => providerPayload,
    } as Response);
    await expect(controller.lookupPostalCode('83000')).resolves.toEqual(
      result,
    );
    expect(provider).toHaveBeenCalledWith(
      'https://api.postalkit.mx/v1/postal-codes/83000',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-key' },
      }),
    );
    expect(normalizePostalLookup).toHaveBeenCalledWith(
      '83000',
      providerPayload,
    );
  });

  it('handles nonexistent postcodes and provider failures', async () => {
    process.env.POSTALKIT_API_KEY = 'test-key';
    const provider = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);
    await expect(controller.lookupPostalCode('99999')).resolves.toEqual({
      code: '99999',
      settlements: [],
    });
    provider.mockRejectedValueOnce(new Error('network unavailable'));
    await expect(controller.lookupPostalCode('83000')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
