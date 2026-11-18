import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuthService } from './auth.service';
import { PasswordRecoveryService } from './password-recovery.service';

describe('AuthService', () => {
  type UserUpdateManyCall = {
    where: {
      id: string;
      companyId: string;
      isActive: boolean;
    };
    data: {
      passwordHash: string;
      authVersion?: {
        increment: number;
      };
    };
  };

  let service: AuthService;
  let prismaMock: {
    $transaction: jest.Mock;
    company: {
      create: jest.Mock;
      findUnique: jest.Mock;
    };
    user: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let transactionMock: {
    passwordResetToken: {
      updateMany: jest.Mock;
    };
    user: {
      updateMany: jest.Mock;
    };
  };
  let jwtServiceMock: {
    sign: jest.Mock;
    signAsync: jest.Mock;
  };
  let passwordRecoveryServiceMock: {
    invalidateToken: jest.Mock;
    preparePasswordReset: jest.Mock;
    resetPasswordWithToken: jest.Mock;
  };
  let emailServiceMock: {
    sendPasswordResetEmail: jest.Mock;
  };

  const authenticatedUser = {
    id: 'user-1',
    companyId: 'company-1',
    email: 'admin@example.com',
    firstName: 'Ada',
    lastName: 'Lovelace',
    role: 'ADMIN',
  };

  const userRecord = {
    ...authenticatedUser,
    role: UserRole.ADMIN,
    passwordHash: 'hashed-password',
    authVersion: 0,
    locale: 'es',
    isActive: true,
  };

  beforeEach(async () => {
    transactionMock = {
      passwordResetToken: {
        updateMany: jest.fn(),
      },
      user: {
        updateMany: jest.fn(),
      },
    };
    prismaMock = {
      $transaction: jest.fn(
        (callback: (tx: typeof transactionMock) => unknown) =>
          callback(transactionMock),
      ),
      company: {
        create: jest.fn(),
        findUnique: jest.fn(),
      },
      user: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    jwtServiceMock = {
      sign: jest.fn(),
      signAsync: jest.fn(),
    };
    passwordRecoveryServiceMock = {
      invalidateToken: jest.fn(),
      preparePasswordReset: jest.fn(),
      resetPasswordWithToken: jest.fn(),
    };
    emailServiceMock = {
      sendPasswordResetEmail: jest.fn(),
    };
    process.env.FRONTEND_BASE_URL = 'https://app.zaping.example';

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: JwtService,
          useValue: jwtServiceMock,
        },
        {
          provide: PasswordRecoveryService,
          useValue: passwordRecoveryServiceMock,
        },
        {
          provide: EmailService,
          useValue: emailServiceMock,
        },
      ],
    }).compile();

    service = moduleRef.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('adds companyTimezone from the authenticated user company', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      name: 'Insumos de Salud Profesional',
      tradeName: 'INSAP',
      timezone: 'America/Mazatlan',
    });

    await expect(
      service.getAuthenticatedUserContext(authenticatedUser as never),
    ).resolves.toEqual({
      ...authenticatedUser,
      companyTimezone: 'America/Mazatlan',
      companyName: 'INSAP',
    });

    expect(prismaMock.company.findUnique).toHaveBeenCalledWith({
      where: {
        id: 'company-1',
      },
      select: {
        name: true,
        tradeName: true,
        timezone: true,
      },
    });
  });

  it('returns non-default company timezones without hardcoding', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      name: 'Insumos de Salud Profesional',
      tradeName: 'INSAP',
      timezone: 'America/Tijuana',
    });

    const context = await service.getAuthenticatedUserContext(
      authenticatedUser as never,
    );

    expect(context.companyTimezone).toBe('America/Tijuana');
  });

  it('uses the legal name when no trade name is available', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      name: 'Empresa Demo SA de CV',
      tradeName: '   ',
      timezone: 'America/Hermosillo',
    });

    const context = await service.getAuthenticatedUserContext(
      authenticatedUser as never,
    );

    expect(context.companyName).toBe('Empresa Demo SA de CV');
    expect(context.companyId).toBe(authenticatedUser.companyId);
  });

  it('preserves existing authenticated user fields', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      name: 'Insumos de Salud Profesional',
      tradeName: 'INSAP',
      timezone: 'America/Hermosillo',
    });

    const context = await service.getAuthenticatedUserContext(
      authenticatedUser as never,
    );

    expect(context).toMatchObject(authenticatedUser);
  });

  it('rejects missing companies using the current authenticated companyId', async () => {
    prismaMock.company.findUnique.mockResolvedValue(null);

    await expect(
      service.getAuthenticatedUserContext(authenticatedUser as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not add timezone to JWT operations while building /auth/me context', async () => {
    prismaMock.company.findUnique.mockResolvedValue({
      name: 'Insumos de Salud Profesional',
      tradeName: 'INSAP',
      timezone: 'America/Mazatlan',
    });

    await service.getAuthenticatedUserContext(authenticatedUser as never);

    expect(jwtServiceMock.sign).not.toHaveBeenCalled();
    expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
  });

  it('signs register tokens with the initial user authVersion without exposing it', async () => {
    const company = {
      id: 'company-1',
      name: 'Zaping Medical',
      tradeName: undefined,
      rfc: 'ZAP010101ABC',
    };
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.company.findUnique.mockResolvedValue(null);
    prismaMock.company.create.mockResolvedValue(company);
    prismaMock.user.create.mockResolvedValue(userRecord);
    jwtServiceMock.signAsync.mockResolvedValue('registered-token');

    const response = await service.register({
      companyName: company.name,
      rfc: company.rfc,
      firstName: userRecord.firstName,
      lastName: userRecord.lastName,
      email: userRecord.email,
      password: 'secure-password',
    });

    expect(jwtServiceMock.signAsync).toHaveBeenCalledWith({
      sub: userRecord.id,
      companyId: company.id,
      email: userRecord.email,
      role: userRecord.role,
      authVersion: 0,
    });
    expect(response.user).not.toHaveProperty('passwordHash');
    expect(response.user).not.toHaveProperty('authVersion');
  });

  it('allows active users with a valid password to login without exposing passwordHash', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userRecord,
      passwordHash: await bcrypt.hash('correct-password', 10),
      authVersion: 2,
    });
    jwtServiceMock.signAsync.mockResolvedValue('signed-token');

    const response = await service.login({
      email: userRecord.email,
      password: 'correct-password',
    });

    expect(response).toEqual({
      token: 'signed-token',
      user: {
        id: userRecord.id,
        companyId: userRecord.companyId,
        firstName: userRecord.firstName,
        lastName: userRecord.lastName,
        email: userRecord.email,
        role: userRecord.role,
        locale: userRecord.locale,
      },
    });
    expect(response.user).not.toHaveProperty('passwordHash');
    expect(response.user).not.toHaveProperty('authVersion');
    expect(jwtServiceMock.signAsync).toHaveBeenCalledWith({
      sub: userRecord.id,
      companyId: userRecord.companyId,
      email: userRecord.email,
      role: userRecord.role,
      firstName: userRecord.firstName,
      lastName: userRecord.lastName,
      authVersion: 2,
    });
  });

  it('rejects inactive users with the generic credentials error before issuing a token', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userRecord,
      isActive: false,
    });

    await expect(
      service.login({
        email: userRecord.email,
        password: 'correct-password',
      }),
    ).rejects.toMatchObject({
      message: 'Credenciales inválidas',
    });

    expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
  });

  it('keeps invalid password behavior unchanged', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...userRecord,
      passwordHash: await bcrypt.hash('correct-password', 10),
    });

    await expect(
      service.login({
        email: userRecord.email,
        password: 'wrong-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
  });

  it('orchestrates forgot-password for active users without exposing the token', async () => {
    const preparedReset = {
      tokenId: 'reset-token-1',
      token: 'plain-reset-token',
      expiresAt: new Date('2026-09-01T17:00:00.000Z'),
      user: {
        id: userRecord.id,
        email: userRecord.email,
        firstName: userRecord.firstName,
        lastName: userRecord.lastName,
      },
    };
    passwordRecoveryServiceMock.preparePasswordReset.mockResolvedValue(
      preparedReset,
    );
    emailServiceMock.sendPasswordResetEmail.mockResolvedValue(undefined);

    const response = await service.forgotPassword({
      email: `  ${userRecord.email.toUpperCase()}  `,
    });

    expect(
      passwordRecoveryServiceMock.preparePasswordReset,
    ).toHaveBeenCalledWith(userRecord.email);
    expect(emailServiceMock.sendPasswordResetEmail).toHaveBeenCalledWith({
      to: userRecord.email,
      resetUrl:
        'https://app.zaping.example/reset-password?token=plain-reset-token',
      expiresAt: preparedReset.expiresAt,
      recipientName: userRecord.firstName,
    });
    expect(response).toEqual({
      message:
        'Si la cuenta existe, enviaremos instrucciones para restablecer la contraseña.',
    });
    expect(response).not.toHaveProperty('token');
    expect(response).not.toHaveProperty('resetUrl');
  });

  it('returns the same forgot-password response for unknown or inactive users without sending email', async () => {
    passwordRecoveryServiceMock.preparePasswordReset.mockResolvedValue(null);

    await expect(
      service.forgotPassword({
        email: 'missing@example.com',
      }),
    ).resolves.toEqual({
      message:
        'Si la cuenta existe, enviaremos instrucciones para restablecer la contraseña.',
    });
    await expect(
      service.forgotPassword({
        email: 'inactive@example.com',
      }),
    ).resolves.toEqual({
      message:
        'Si la cuenta existe, enviaremos instrucciones para restablecer la contraseña.',
    });

    expect(emailServiceMock.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('invalidates the issued token and returns the generic response when delivery fails', async () => {
    const loggerSpy = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);
    passwordRecoveryServiceMock.preparePasswordReset.mockResolvedValue({
      tokenId: 'reset-token-1',
      token: 'plain-reset-token',
      expiresAt: new Date('2026-09-01T17:00:00.000Z'),
      user: {
        id: userRecord.id,
        email: userRecord.email,
        firstName: userRecord.firstName,
        lastName: userRecord.lastName,
      },
    });
    emailServiceMock.sendPasswordResetEmail.mockRejectedValue(
      new Error('provider unavailable'),
    );

    await expect(
      service.forgotPassword({
        email: userRecord.email,
      }),
    ).resolves.toEqual({
      message:
        'Si la cuenta existe, enviaremos instrucciones para restablecer la contraseña.',
    });

    expect(passwordRecoveryServiceMock.invalidateToken).toHaveBeenCalledWith(
      'reset-token-1',
    );
    expect(loggerSpy).toHaveBeenCalledWith(
      'Password reset email delivery failed',
    );
    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain(
      'plain-reset-token',
    );
  });

  it('resets password through PasswordRecoveryService without returning a JWT', async () => {
    passwordRecoveryServiceMock.resetPasswordWithToken.mockResolvedValue({
      success: true,
      message: 'Contraseña actualizada',
    });

    await expect(
      service.resetPassword({
        token: 'plain-reset-token',
        newPassword: 'new-secure-password',
      }),
    ).resolves.toEqual({
      success: true,
      message: 'Contraseña restablecida',
    });

    expect(
      passwordRecoveryServiceMock.resetPasswordWithToken,
    ).toHaveBeenCalledWith('plain-reset-token', 'new-secure-password');
    expect(jwtServiceMock.signAsync).not.toHaveBeenCalled();
  });

  it('changes password for the authenticated active user scoped by id and companyId', async () => {
    const currentHash = await bcrypt.hash('current-password', 10);

    prismaMock.user.findFirst.mockResolvedValue({
      id: userRecord.id,
      companyId: userRecord.companyId,
      passwordHash: currentHash,
      isActive: true,
    });
    transactionMock.user.updateMany.mockResolvedValue({ count: 1 });
    transactionMock.passwordResetToken.updateMany.mockResolvedValue({
      count: 2,
    });

    const response = await service.changePassword(authenticatedUser as never, {
      currentPassword: 'current-password',
      newPassword: 'new-secure-password',
    });

    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: {
        id: authenticatedUser.id,
        companyId: authenticatedUser.companyId,
        isActive: true,
      },
      select: {
        id: true,
        companyId: true,
        passwordHash: true,
        isActive: true,
      },
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionMock.user.updateMany).toHaveBeenCalledTimes(1);
    const updateCalls = transactionMock.user.updateMany.mock.calls as [
      UserUpdateManyCall,
    ][];
    const updateCall = updateCalls[0][0];

    expect(updateCall).toEqual({
      where: {
        id: authenticatedUser.id,
        companyId: authenticatedUser.companyId,
        isActive: true,
      },
      data: {
        passwordHash: updateCall.data.passwordHash,
        authVersion: {
          increment: 1,
        },
      },
    });
    expect(typeof updateCall.data.passwordHash).toBe('string');
    expect(transactionMock.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: {
        userId: authenticatedUser.id,
        usedAt: null,
      },
      data: {
        usedAt: expect.any(Date) as Date,
      },
    });
    expect(response).toEqual({
      success: true,
      message: 'Contraseña actualizada',
    });
    expect(response).not.toHaveProperty('passwordHash');
    expect(response).not.toHaveProperty('password');
  });

  it('rejects an incorrect current password as a form error without updating', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: userRecord.id,
      companyId: userRecord.companyId,
      passwordHash: await bcrypt.hash('current-password', 10),
      isActive: true,
    });

    await expect(
      service.changePassword(authenticatedUser as never, {
        currentPassword: 'wrong-password',
        newPassword: 'new-secure-password',
      }),
    ).rejects.toMatchObject({
      constructor: BadRequestException,
      message: 'La contraseña actual no es correcta.',
    });

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(transactionMock.user.updateMany).not.toHaveBeenCalled();
    expect(
      transactionMock.passwordResetToken.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('rejects same-password changes without updating', async () => {
    prismaMock.user.findFirst.mockResolvedValue({
      id: userRecord.id,
      companyId: userRecord.companyId,
      passwordHash: await bcrypt.hash('current-password', 10),
      isActive: true,
    });

    await expect(
      service.changePassword(authenticatedUser as never, {
        currentPassword: 'current-password',
        newPassword: 'current-password',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(transactionMock.user.updateMany).not.toHaveBeenCalled();
    expect(
      transactionMock.passwordResetToken.updateMany,
    ).not.toHaveBeenCalled();
  });

  it('persists only a fresh hash and never the plain new password', async () => {
    const currentHash = await bcrypt.hash('current-password', 10);

    prismaMock.user.findFirst.mockResolvedValue({
      id: userRecord.id,
      companyId: userRecord.companyId,
      passwordHash: currentHash,
      isActive: true,
    });
    transactionMock.user.updateMany.mockResolvedValue({ count: 1 });
    transactionMock.passwordResetToken.updateMany.mockResolvedValue({
      count: 0,
    });

    await service.changePassword(authenticatedUser as never, {
      currentPassword: 'current-password',
      newPassword: 'new-secure-password',
    });

    const updateCalls = transactionMock.user.updateMany.mock.calls as [
      UserUpdateManyCall,
    ][];
    const updateCall = updateCalls[0][0];
    const nextHash = updateCall.data.passwordHash;

    expect(nextHash).not.toBe('new-secure-password');
    expect(nextHash).not.toBe(currentHash);
    await expect(bcrypt.compare('new-secure-password', nextHash)).resolves.toBe(
      true,
    );
    expect(updateCall.data.authVersion).toEqual({ increment: 1 });
    expect(Object.keys(updateCall.data)).toEqual([
      'passwordHash',
      'authVersion',
    ]);
  });

  it('rejects missing or inactive users before password comparison', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);

    await expect(
      service.changePassword(authenticatedUser as never, {
        currentPassword: 'current-password',
        newPassword: 'new-secure-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(transactionMock.user.updateMany).not.toHaveBeenCalled();
    expect(
      transactionMock.passwordResetToken.updateMany,
    ).not.toHaveBeenCalled();
  });
});
