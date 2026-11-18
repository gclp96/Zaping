import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/services/api';
import RecentActivitySection, {
  formatRecentActivityDate,
  getRecentActivityHref,
  type RecentActivity,
} from './RecentActivitySection';

vi.mock('@/services/api', () => ({
  api: { get: vi.fn() },
}));

const records: RecentActivity[] = [
  {
    type: 'RECEIPT',
    id: 'receipt-1',
    folio: 'REC-100',
    createdAt: '2026-11-18T04:30:00.000Z',
  },
  {
    type: 'SALE',
    id: 'sale-1',
    folio: 'VEN-101',
    createdAt: '2026-11-17T15:00:00.000Z',
  },
  {
    type: 'QUOTE',
    id: 'quote-1',
    folio: 'COT-102',
    createdAt: '2026-11-17T14:00:00.000Z',
  },
  {
    type: 'PURCHASE',
    id: 'purchase-1',
    folio: 'COM-103',
    createdAt: '2026-11-17T13:00:00.000Z',
  },
];

describe('RecentActivitySection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: records } as never);
  });

  afterEach(cleanup);

  it('keeps the feed unmounted until the tenant session is known', () => {
    render(
      <RecentActivitySection
        companyId=""
        timezone="America/Hermosillo"
      />,
    );
    expect(screen.queryByText('Actividad reciente')).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('shows tenant-scoped results without inventing a detailed link', async () => {
    const { container } = render(
      <RecentActivitySection
        companyId="company-a"
        timezone="America/Hermosillo"
      />,
    );

    await screen.findByText('Recepción registrada');
    expect(api.get).toHaveBeenCalledExactlyOnceWith('/dashboard/recent-activity');
    expect(screen.getByText('Folio REC-100')).toBeTruthy();

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/purchase-receipts/receipt-1',
      '/sales?saleId=sale-1',
      '/quotes',
      '/purchases/purchase-1',
    ]);
    expect(container.querySelectorAll('time')).toHaveLength(4);
  });

  it('formats timestamps in the company timezone rather than the browser timezone', () => {
    const instant = '2026-11-18T04:30:00.000Z';
    expect(formatRecentActivityDate(instant, 'America/Hermosillo')).toContain('21:30');
    expect(formatRecentActivityDate(instant, 'America/Mexico_City')).toContain('22:30');
    expect(formatRecentActivityDate('invalid', 'America/Hermosillo')).toBe('Fecha no disponible');
    expect(formatRecentActivityDate(instant, 'Invalid/Timezone')).toBe('Fecha no disponible');
  });

  it('preserves the receipt identifier as part of its route', () => {
    expect(getRecentActivityHref(records[0])).toBe('/purchase-receipts/receipt-1');
    expect(getRecentActivityHref(records[1])).toBe('/sales?saleId=sale-1');
    expect(getRecentActivityHref(records[2])).toBe('/quotes');
    expect(getRecentActivityHref(records[3])).toBe('/purchases/purchase-1');
  });

  it('shows a useful empty state when no documents exist', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [] } as never);
    render(
      <RecentActivitySection
        companyId="company-a"
        timezone="America/Hermosillo"
      />,
    );
    expect(
      await screen.findByText('Aún no hay documentos registrados para mostrar.'),
    ).toBeTruthy();
  });

  it('allows retry after a temporary API error', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get)
      .mockRejectedValueOnce(new Error('private backend details'))
      .mockResolvedValueOnce({ data: records } as never);

    render(
      <RecentActivitySection
        companyId="company-a"
        timezone="America/Hermosillo"
      />,
    );
    expect(
      await screen.findByText('No fue posible consultar la actividad reciente.'),
    ).toBeTruthy();
    expect(screen.queryByText('private backend details')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Reintentar actividad' }));
    await screen.findByText('Recepción registrada');
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });
});
