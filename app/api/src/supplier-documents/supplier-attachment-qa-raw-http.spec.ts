import type { Readable } from 'node:stream';
import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guards';
import { SupplierAttachmentUploadReservationsController } from './supplier-attachment-upload-reservations.controller';
import { SupplierAttachmentUploadReservationsService } from './supplier-attachment-upload-reservations.service';
import { SupplierAttachmentQaBinaryUploadService } from './supplier-attachment-qa-binary-upload.service';

describe('ZFILES QA raw HTTP boundary (no DB or network)', () => {
  let app: INestApplication<App>;
  const reserved = { reserve: jest.fn() };
  const uploaded = { receive: jest.fn() };
  const qaEnv = {
    reservations: process.env.ZFILES_QA_RESERVATIONS_ENABLED,
    binary: process.env.ZFILES_QA_BINARY_UPLOAD_ENABLED,
    scope: process.env.ZFILES_DEPLOYMENT_SCOPE,
  };
  const bytes = Buffer.from('%PDF-1.7\nraw request\n%%EOF\n');
  let observedBytes = Buffer.alloc(0);
  const route =
    '/supplier-documents/qa-document/attachments/reservations/qa-reservation/content';

  beforeAll(async () => {
    process.env.ZFILES_QA_RESERVATIONS_ENABLED = '1';
    process.env.ZFILES_QA_BINARY_UPLOAD_ENABLED = '1';
    process.env.ZFILES_DEPLOYMENT_SCOPE = 'qa';

    const moduleRef = await Test.createTestingModule({
      controllers: [SupplierAttachmentUploadReservationsController],
      providers: [
        {
          provide: SupplierAttachmentUploadReservationsService,
          useValue: reserved,
        },
        {
          provide: SupplierAttachmentQaBinaryUploadService,
          useValue: uploaded,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<{ user?: unknown }>().user = {
            id: 'qa-actor',
            companyId: 'qa-company',
            role: 'ADMIN',
          };
          return true;
        },
      })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    uploaded.receive.mockImplementation(async (input: { source: Readable }) => {
      const chunks: Buffer[] = [];
      for await (const chunk of input.source) {
        chunks.push(Buffer.from(chunk as Uint8Array));
      }
      observedBytes = Buffer.concat(chunks);
      return {
        id: 'qa-reservation',
        status: 'QUARANTINE_WRITE_ACKNOWLEDGED_UNVERIFIED',
      };
    });
  });

  afterAll(async () => {
    await app.close();
    for (const [key, value] of [
      ['ZFILES_QA_RESERVATIONS_ENABLED', qaEnv.reservations],
      ['ZFILES_QA_BINARY_UPLOAD_ENABLED', qaEnv.binary],
      ['ZFILES_DEPLOYMENT_SCOPE', qaEnv.scope],
    ] as const) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('streams exact PDF bytes without parsing them as JSON', async () => {
    const response = await request(app.getHttpServer())
      .put(route)
      .set('Content-Type', 'application/pdf')
      .send(bytes)
      .expect(202);

    expect(response.body).toEqual({
      id: 'qa-reservation',
      status: 'QUARANTINE_WRITE_ACKNOWLEDGED_UNVERIFIED',
    });
    expect(observedBytes).toEqual(bytes);
    expect(uploaded.receive).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'qa-company',
        documentId: 'qa-document',
        actorId: 'qa-actor',
        reservationId: 'qa-reservation',
        declaredLength: String(bytes.length),
        contentType: 'application/pdf',
      }),
    );
  });

  it('blocks raw HTTP before accessing the service when disabled', async () => {
    delete process.env.ZFILES_QA_BINARY_UPLOAD_ENABLED;
    await request(app.getHttpServer())
      .put(route)
      .set('Content-Type', 'application/pdf')
      .send(bytes)
      .expect(503);
    expect(uploaded.receive).not.toHaveBeenCalled();
    process.env.ZFILES_QA_BINARY_UPLOAD_ENABLED = '1';
  });
});
