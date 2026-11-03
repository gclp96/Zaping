import { Test, TestingModule } from '@nestjs/testing';

import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

describe('PurchasesController', () => {
  let controller: PurchasesController;
  let purchasesServiceMock: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    approve: jest.Mock;
    cancel: jest.Mock;
    findInventoryMovements: jest.Mock;
    generatePDF: jest.Mock;
  };

  beforeEach(async () => {
    purchasesServiceMock = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      approve: jest.fn(),
      cancel: jest.fn(),
      findInventoryMovements: jest.fn(),
      generatePDF: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PurchasesController],
      providers: [
        {
          provide: PurchasesService,
          useValue: purchasesServiceMock,
        },
      ],
    }).compile();

    controller = moduleRef.get<PurchasesController>(PurchasesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('gets a purchase detail with companyId from the authenticated request', async () => {
    const response = {
      id: 'purchase-1',
      receiptProgress: {
        orderedUnits: 1,
        receivedUnits: 0,
        pendingUnits: 1,
        orderedLines: 1,
        completedLines: 0,
      },
    };

    purchasesServiceMock.findOne.mockResolvedValue(response);

    await expect(
      controller.findOne(
        {
          user: {
            companyId: 'company-1',
          },
        },
        'purchase-1',
      ),
    ).resolves.toBe(response);

    expect(purchasesServiceMock.findOne).toHaveBeenCalledWith(
      'company-1',
      'purchase-1',
    );
  });

  it('cancels a purchase with companyId from the authenticated request', async () => {
    const response = { id: 'purchase-1', status: 'CANCELLED' };
    purchasesServiceMock.cancel.mockResolvedValue(response);

    await expect(
      controller.cancel(
        {
          user: {
            companyId: 'company-1',
          },
        },
        'purchase-1',
      ),
    ).resolves.toBe(response);

    expect(purchasesServiceMock.cancel).toHaveBeenCalledTimes(1);
    expect(purchasesServiceMock.cancel).toHaveBeenCalledWith(
      'company-1',
      'purchase-1',
    );
  });

  it('keeps inventory movements routed to the existing service method', async () => {
    const response = [{ id: 'movement-1' }];
    purchasesServiceMock.findInventoryMovements.mockResolvedValue(response);

    await expect(
      controller.findInventoryMovements(
        {
          user: {
            companyId: 'company-1',
          },
        },
        'purchase-1',
      ),
    ).resolves.toBe(response);

    expect(purchasesServiceMock.findInventoryMovements).toHaveBeenCalledWith(
      'company-1',
      'purchase-1',
    );
    expect(purchasesServiceMock.findOne).not.toHaveBeenCalled();
  });

  it('keeps pdf routed to the existing service method', () => {
    const response = {};
    purchasesServiceMock.generatePDF.mockReturnValue(response);

    expect(
      controller.generatePDF(
        {
          user: {
            companyId: 'company-1',
          },
        },
        'purchase-1',
        response as never,
      ),
    ).toBe(response);

    expect(purchasesServiceMock.generatePDF).toHaveBeenCalledWith(
      'company-1',
      'purchase-1',
      response,
    );
    expect(purchasesServiceMock.findOne).not.toHaveBeenCalled();
  });
});
