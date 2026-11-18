import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { DashboardService } from './dashboard.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES, UserRole.WAREHOUSE)
  @Get('recent-activity')
  getRecentActivity(@Request() req: AuthenticatedRequest) {
    return this.dashboardService.getRecentActivity(
      req.user.companyId,
      req.user.role,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.SALES, UserRole.WAREHOUSE)
  @Get()
  getDashboard(@Request() req: AuthenticatedRequest) {
    return this.dashboardService.get(req.user.companyId, req.user.role);
  }
}
