import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';

import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';

describe('DashboardController', () => {
  let controller: DashboardController;
  let dashboardService: { get: jest.Mock; getRecentActivity: jest.Mock };

  beforeEach(async () => {
    dashboardService = {
      get: jest.fn(),
      getRecentActivity: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        {
          provide: DashboardService,
          useValue: dashboardService,
        },
      ],
    }).compile();

    controller = moduleRef.get<DashboardController>(DashboardController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it.each([
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.SALES,
    UserRole.WAREHOUSE,
  ])('scopes recent activity to the authenticated company for %s', (role) => {
    const request = {
      user: { companyId: 'company-1', role },
    } as AuthenticatedRequest;

    void controller.getRecentActivity(request);

    expect(dashboardService.getRecentActivity).toHaveBeenCalledWith(
      'company-1',
      role,
    );
  });

  it.each([
    UserRole.ADMIN,
    UserRole.MANAGER,
    UserRole.SALES,
    UserRole.WAREHOUSE,
  ])('passes company and %s role to the Dashboard service', (role) => {
    const request = {
      user: {
        companyId: 'company-1',
        role,
      },
    } as AuthenticatedRequest;

    void controller.getDashboard(request);

    expect(dashboardService.get).toHaveBeenCalledWith('company-1', role);
  });
});
