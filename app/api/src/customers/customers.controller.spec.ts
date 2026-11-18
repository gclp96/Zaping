import { Test, TestingModule } from '@nestjs/testing';

import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

describe('CustomersController', () => {
  let controller: CustomersController;
  const getOverview = jest.fn();

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [
        {
          provide: CustomersService,
          useValue: { getOverview },
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

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
