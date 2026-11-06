import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/services/api';
import ReceiptAvailableAttachments, {
  validAvailableReceiptAttachments,
} from './ReceiptAvailableAttachments';

vi.mock('@/services/api', () => ({ api: { get: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => cleanup());

const valid = {
  id: 'attachment-1',
  originalName: 'remision.pdf',
  contentType: 'application/pdf',
  sizeBytes: 110,
  createdAt: '2026-11-05T12:00:00.000Z',
};

describe('ReceiptAvailableAttachments', () => {
  it('is invisible and never queries API with the feature gate OFF', () => {
    const { container } = render(
      <ReceiptAvailableAttachments documentId="document-a" enabled={false} />,
    );
    expect(container.textContent).toBe('');
    expect(api.get).not.toHaveBeenCalled();
  });

  it('queries only the exact linked ID and renders approved metadata without download', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [valid] } as never);
    render(
      <ReceiptAvailableAttachments documentId="document/a ?" enabled />,
    );
    expect(await screen.findByText(/remision\.pdf/)).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith(
      '/supplier-documents/document%2Fa%20%3F/attachments',
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/Sólo consulta/)).toBeTruthy();
  });

  it('rejects malformed, unscoped, or secret-bearing payloads', async () => {
    expect(validAvailableReceiptAttachments([{ ...valid, storageKey: 'private/secret' }])).toBe(false);
    expect(validAvailableReceiptAttachments([{ ...valid, sha256: 'a'.repeat(64) }])).toBe(false);
    expect(validAvailableReceiptAttachments([valid, valid])).toBe(false);
    expect(validAvailableReceiptAttachments([{ ...valid, sizeBytes: 10485761 }])).toBe(false);
    vi.mocked(api.get).mockResolvedValue({
      data: [{ ...valid, storageKey: 'private/private-object' }],
    } as never);
    render(<ReceiptAvailableAttachments documentId="document-a" enabled />);
    expect((await screen.findByRole('alert')).textContent).toContain('inválida');
    expect(screen.queryByText('remision.pdf')).toBeNull();
  });

  it('handles server failures without exposing errors or object keys', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('SecretAccessKey debug'));
    render(<ReceiptAvailableAttachments documentId="document-a" enabled />);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'No fue posible consultar adjuntos.',
    );
  });
});
