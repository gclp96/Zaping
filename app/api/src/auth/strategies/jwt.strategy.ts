import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../interfaces/authenticated-request.interface';

interface JwtPayload {
  sub: string;
  companyId: string;
  email: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  authVersion?: number;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      throw new Error('JWT_SECRET must be defined');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sub || !payload.companyId || !payload.email || !payload.role) {
      throw new UnauthorizedException('Token inválido');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        companyId: payload.companyId,
        isActive: true,
      },
      select: {
        id: true,
        companyId: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        canAdjustPurchaseUnitCost: true,
        authVersion: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Token inválido');
    }

    const tokenAuthVersion = payload.authVersion ?? 0;

    if (tokenAuthVersion !== user.authVersion) {
      throw new UnauthorizedException('Token inválido');
    }

    return {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      canAdjustPurchaseUnitCost: user.canAdjustPurchaseUnitCost,
    };
  }
}
