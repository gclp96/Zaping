import { StreamableFile } from '@nestjs/common';
import { SupplierDocumentsController } from './supplier-documents.controller';

describe('supplier document download headers', () => {
  const attachments = { verifiedDownload: jest.fn() };
  const controller = new SupplierDocumentsController(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    attachments as never,
  );
  const req = { user: { id: 'actor-a', companyId: 'company-a' } } as never;
  const response = { setHeader: jest.fn() } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    attachments.verifiedDownload.mockResolvedValue({
      bytes: Buffer.from('%PDF-1.7%%EOF'),
      contentType: 'application/pdf',
      originalName: 'factura proveedor.pdf',
    });
  });

  it('uses authenticated tenant and attachment ID, never user-supplied storage keys', async () => {
    const file = await controller.downloadAttachment(
      req,
      'document-a',
      'attachment-a',
      response,
    );
    expect(file).toBeInstanceOf(StreamableFile);
    expect(attachments.verifiedDownload).toHaveBeenCalledWith(
      'company-a',
      'document-a',
      'attachment-a',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Content-Type-Options',
      'nosniff',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Security-Policy',
      'sandbox',
    );
    expect(file.getHeaders().disposition).toMatch(/^attachment;/);
  });

  it('cannot send a file after a failed storage authorization', async () => {
    attachments.verifiedDownload.mockRejectedValueOnce(
      new Error('PRIVATE_STORAGE_UNAVAILABLE'),
    );
    await expect(
      controller.downloadAttachment(
        req,
        'document-a',
        'attachment-a',
        response,
      ),
    ).rejects.toThrow('PRIVATE_STORAGE_UNAVAILABLE');
    expect(response.setHeader).not.toHaveBeenCalled();
  });
});
