import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthenticatedSession, type UserRole } from '@/app/auth-session';
import { api } from '@/services/api';

import ReceiptSupplierDocuments from './ReceiptSupplierDocuments';

vi.mock('@/app/auth-session', () => ({
  useAuthenticatedSession: vi.fn(),
}));

vi.mock('@/services/api', () => ({
  api: { get: vi.fn() },
}));

vi.mock('@/services/errors', () => ({
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

function setRole(role: UserRole) {
  vi.mocked(useAuthenticatedSession).mockReturnValue({
    status: 'success',
    retry: vi.fn(),
    user: {
      id: 'actor-1',
      companyId: 'company-1',
      role,
      email: 'qa@example.invalid',
      firstName: 'QA',
      lastName: 'Pruebas',
      companyTimezone: 'America/Hermosillo',
    },
  });
}

function link(id: string, docId: string) {
  return {
    id,
    receiptId: 'receipt-1',
    documentId: docId,
    document: {
      id: docId,
      type: 'REMISION' as const,
      series: 'A',
      number: '000123',
      status: 'ACTIVE' as const,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  setRole('ADMIN');
  vi.mocked(api.get).mockResolvedValue({ data: [] } as never);
});

afterEach(() => cleanup());

describe('ReceiptSupplierDocuments', () => {
  it('opens the exact validated document ID, not a guessed folio', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [link('association-1', 'document-actual-1')],
    } as never);
    render(
      <ReceiptSupplierDocuments
        receiptId="receipt-1"
        legacyReference="REMISION · 000123"
      />,
    );

    expect(
      await screen.findByRole('link', {
        name: 'Ver documento REMISION · A-000123',
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: 'Ver documento REMISION · A-000123' })
        .getAttribute('href'),
    ).toBe('/supplier-documents/document-actual-1');
    expect(api.get).toHaveBeenCalledWith(
      '/supplier-documents/receipts/receipt-1/links',
    );
  });

  it('keeps same-folio documents distinct by ID', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [
        link('association-1', 'first-document'),
        link('association-2', 'second-document'),
      ],
    } as never);
    render(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);

    await screen.findByRole('list', {
      name: 'Documentos vinculados a esta recepción',
    });
    expect(
      screen
        .getAllByRole('link', { name: 'Ver documento REMISION · A-000123' })
        .map((item) => item.getAttribute('href')),
    ).toEqual([
      '/supplier-documents/first-document',
      '/supplier-documents/second-document',
    ]);
  });

  it('does not construct a document link from a legacy textual reference', async () => {
    render(
      <ReceiptSupplierDocuments
        receiptId="receipt-1"
        legacyReference="REMISION · 000123"
      />,
    );
    expect(
      await screen.findByText(/Referencia documental sin vínculo por ID/),
    ).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it.each(['WAREHOUSE', 'SALES'] as const)(
    'never queries management-only documents for %s',
    (role) => {
      setRole(role);
      render(
        <ReceiptSupplierDocuments
          receiptId="receipt-1"
          legacyReference="FACTURA · 451"
        />,
      );
      expect(screen.getByText(/Solo Administración o Gerencia/)).toBeTruthy();
      expect(api.get).not.toHaveBeenCalled();
      expect(screen.queryByRole('link')).toBeNull();
    },
  );

  it('fails closed if a link ID and its populated document ID disagree', async () => {
    vi.mocked(api.get).mockResolvedValue({
      data: [{ ...link('association-1', 'doc-1'), documentId: 'different-id' }],
    } as never);
    render(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
    expect((await screen.findByRole('alert')).textContent).toContain(
      'La respuesta de vínculos documentales no es válida.',
    );
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('reports a request failure and supports retry', async () => {
    vi.mocked(api.get)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({
        data: [link('association-1', 'document-actual-1')],
      } as never);

    const user = userEvent.setup();
    render(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
    expect(
      await screen.findByText('No fue posible consultar los documentos vinculados.'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reintentar documentos' }));
    await waitFor(() => {
      expect(
        screen.getByRole('link', { name: 'Ver documento REMISION · A-000123' }),
      ).toBeTruthy();
    });
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});

it.each(['ADMIN', 'MANAGER'] as const)('queries links for %s and encodes exact IDs', async (role) => {
  setRole(role);
  vi.mocked(api.get).mockResolvedValue({ data: [{ ...link('a', 'doc/a ?'), receiptId: 'receipt/a' }] } as never);
  render(<ReceiptSupplierDocuments receiptId="receipt/a" legacyReference={null} />);
  expect((await screen.findByRole('link')).getAttribute('href')).toBe('/supplier-documents/doc%2Fa%20%3F');
  expect(api.get).toHaveBeenCalledWith('/supplier-documents/receipts/receipt%2Fa/links');
});

it('labels cancelled documents while retaining historical navigation', async () => {
  const item = link('a', 'cancelled-doc');
  item.document.status = 'CANCELLED' as never;
  vi.mocked(api.get).mockResolvedValue({ data: [item] } as never);
  render(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
  expect((await screen.findByText(/registro cancelado/)).textContent).toContain('REMISION');
  expect(screen.getByRole('link').getAttribute('href')).toBe('/supplier-documents/cancelled-doc');
});

it.each([
  null, {}, [null], [42], [{ ...link('a', 'doc'), receiptId: 'other' }],
  [{ ...link('a', 'doc'), document: null }],
  [{ ...link('a', 'doc'), document: { ...link('a', 'doc').document, status: 'UNKNOWN' } }],
  [{ ...link('a', 'doc'), document: { ...link('a', 'doc').document, type: null } }],
  [{ ...link('a', 'doc'), document: { ...link('a', 'doc').document, number: 123 } }],
  [{ ...link('a', 'doc'), removedAt: '2026-01-01' }],
  [link('a', 'doc'), link('a', 'doc2')], [link('a', 'doc'), link('b', 'doc')],
].map((data) => ({ data })))('rejects malformed or inconsistent payload %#', async ({ data }) => {
  vi.mocked(api.get).mockResolvedValue({ data } as never);
  render(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
  expect((await screen.findByRole('alert')).textContent).toContain('no es válida');
  expect(screen.queryByRole('link')).toBeNull();
});

function deferred() {
  let resolve!: (value: { data: unknown }) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<{ data: unknown }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it('shows loading and ignores late success after changing receipt', async () => {
  const old = deferred();
  const next = deferred();
  vi.mocked(api.get).mockReturnValueOnce(old.promise as never).mockReturnValueOnce(next.promise as never);
  const view = render(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
  expect(screen.getByRole('status').textContent).toContain('Cargando');
  view.rerender(<ReceiptSupplierDocuments receiptId="receipt-2" legacyReference={null} />);
  next.resolve({ data: [{ ...link('new', 'new-doc'), receiptId: 'receipt-2' }] });
  await screen.findByRole('link');
  await act(async () => {
    old.resolve({ data: [link('old', 'old-doc')] });
    await old.promise;
  });
  await waitFor(() => expect(screen.getByRole('link').getAttribute('href')).toBe('/supplier-documents/new-doc'));
});

it('resets errors when changing receipt and ignores late failures', async () => {
  const old = deferred();
  vi.mocked(api.get).mockReturnValueOnce(old.promise as never).mockResolvedValueOnce({ data: [] } as never);
  const view = render(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
  view.rerender(<ReceiptSupplierDocuments receiptId="receipt-2" legacyReference={null} />);
  await screen.findByText('Sin documento vinculado por ID.');
  await act(async () => {
    old.reject(new Error('late HTTP failure'));
    await old.promise.catch(() => undefined);
  });
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

it.each(['SALES', 'WAREHOUSE'] as const)('hides loaded links and discards pending responses on transition to %s', async (role) => {
  const pending = deferred();
  vi.mocked(api.get).mockReturnValueOnce(pending.promise as never).mockResolvedValueOnce({ data: [] } as never);
  const view = render(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
  setRole(role);
  view.rerender(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
  await act(async () => {
    pending.resolve({ data: [link('a', 'old-doc')] });
    await pending.promise;
  });
  await waitFor(() => expect(screen.queryByRole('link')).toBeNull());
  expect(api.get).toHaveBeenCalledTimes(1);
  setRole('ADMIN');
  view.rerender(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
  await screen.findByText('Sin documento vinculado por ID.');
  expect(api.get).toHaveBeenCalledTimes(2);
});

it('clears loaded links on actor or tenant change', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: [link('a', 'old-doc')] } as never).mockResolvedValueOnce({ data: [] } as never);
  const view = render(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
  await screen.findByRole('link');
  const session = vi.mocked(useAuthenticatedSession).mock.results.at(-1)!.value;
  vi.mocked(useAuthenticatedSession).mockReturnValue({ ...session, user: { ...session.user, id: 'actor-2', companyId: 'tenant-2' } });
  view.rerender(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
  expect(screen.queryByRole('link')).toBeNull();
  await screen.findByText('Sin documento vinculado por ID.');
});

it.each(['loading', 'unauthenticated', 'error'] as const)('does not query without a verified session: %s', (status) => {
  vi.mocked(useAuthenticatedSession).mockReturnValue({ status, message: 'HTTP failure', retry: vi.fn() } as ReturnType<typeof useAuthenticatedSession>);
  render(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference="FACTURA 12" />);
  expect(screen.getByText('Referencia registrada: FACTURA 12')).toBeTruthy();
  expect(api.get).not.toHaveBeenCalled();
  expect(screen.queryByRole('link')).toBeNull();
});

it.each(['SALES', 'WAREHOUSE'] as const)('removes already loaded navigation immediately when role becomes %s', async (role) => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: [link('a', 'old-doc')] } as never);
  const view = render(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
  await screen.findByRole('link');
  setRole(role);
  view.rerender(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
  expect(screen.queryByRole('link')).toBeNull();
  expect(api.get).toHaveBeenCalledTimes(1);
});

it('clears a previous error when changing receipt', async () => {
  vi.mocked(api.get).mockRejectedValueOnce(new Error('HTTP 500')).mockResolvedValueOnce({ data: [] } as never);
  const view = render(<ReceiptSupplierDocuments receiptId="receipt-1" legacyReference={null} />);
  await screen.findByRole('alert');
  view.rerender(<ReceiptSupplierDocuments receiptId="receipt-2" legacyReference={null} />);
  expect(screen.queryByRole('alert')).toBeNull();
  await screen.findByText('Sin documento vinculado por ID.');
});
