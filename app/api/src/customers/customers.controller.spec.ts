import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

describe('CustomersController', () => {
  let controller: CustomersController;
  const getOverview = jest.fn();
  const normalizePostalLookup = jest.fn();
  const normalizeGeographyOptions = jest.fn();
  const normalizeMunicipalitySettlements = jest.fn();
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
          useValue: {
            getOverview,
            normalizePostalLookup,
            normalizeGeographyOptions,
            normalizeMunicipalitySettlements,
          },
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
      json: () => Promise.resolve(providerPayload),
    } as Response);
    await expect(controller.lookupPostalCode('83000')).resolves.toEqual(result);
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

  it('lists states without exposing the provider key', async () => {
    process.env.POSTALKIT_API_KEY = 'test-key';
    const payload = {
      data: [{ id: 2, name: 'Sonora', code: '26' }],
    };
    const catalog = [{ id: 2, name: 'Sonora', code: '26' }];
    normalizeGeographyOptions.mockReturnValue(catalog);
    const provider = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    } as Response);

    await expect(controller.listStates()).resolves.toEqual(catalog);
    expect(provider).toHaveBeenCalledWith(
      'https://api.postalkit.mx/v1/states',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-key' },
      }),
    );
    expect(normalizeGeographyOptions).toHaveBeenCalledWith(payload);
  });

  it('restricts state IDs and calls the documented municipality/city routes', async () => {
    process.env.POSTALKIT_API_KEY = 'test-key';
    const provider = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    } as Response);
    normalizeGeographyOptions.mockReturnValue([]);

    expect(() => controller.listMunicipalities('invalid')).toThrow(
      BadRequestException,
    );
    expect(() => controller.listCities('../other')).toThrow(
      BadRequestException,
    );
    await expect(controller.listMunicipalities('26')).resolves.toEqual([]);
    await expect(controller.listCities('26')).resolves.toEqual([]);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider).toHaveBeenCalledWith(
      'https://api.postalkit.mx/v1/states/26/municipalities',
      expect.anything(),
    );
    expect(provider).toHaveBeenCalledWith(
      'https://api.postalkit.mx/v1/states/26/cities',
      expect.anything(),
    );
  });

  it('returns municipality colonias with CP and supports bounded pagination', async () => {
    process.env.POSTALKIT_API_KEY = 'test-key';
    const payload = {
      data: [{ id: 50, name: 'Centro', postal_code: { code: '83140' } }],
      meta: { total: 21 },
    };
    const result = {
      items: [{ id: 50, name: 'Centro', postalCode: '83140' }],
      hasMore: true,
    };
    normalizeMunicipalitySettlements.mockReturnValue(result);
    const provider = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    } as Response);
    await expect(
      controller.listMunicipalitySettlements('26', '30', '1'),
    ).resolves.toEqual(result);
    expect(provider).toHaveBeenCalledWith(
      'https://api.postalkit.mx/v1/states/26/municipalities/30/settlements?page=1',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-key' },
      }),
    );
    expect(normalizeMunicipalitySettlements).toHaveBeenCalledWith(payload, 1);
    await controller.listMunicipalitySettlements('26', '30', '1');
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it('rejects unsafe geography identifiers and unbounded settlement pages', async () => {
    process.env.POSTALKIT_API_KEY = 'test-key';
    const provider = jest.spyOn(global, 'fetch');
    await expect(
      controller.listMunicipalitySettlements('../', '30', '1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listMunicipalitySettlements('26', '../', '1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listMunicipalitySettlements('26', '30', '1001'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(provider).not.toHaveBeenCalled();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
