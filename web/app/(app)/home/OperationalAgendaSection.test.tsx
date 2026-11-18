import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api } from '@/services/api';
import OperationalAgendaSection, {
  formatAgendaDate,
  type UpcomingCase,
} from './OperationalAgendaSection';

vi.mock('@/services/api', () => ({
  api: { get: vi.fn() },
}));

const scheduledCase: UpcomingCase = {
  id: 'case-1',
  folio: 'HC-000001',
  title: 'Procedimiento programado',
  scheduledStart: '2026-11-19T18:30:00.000Z',
  scheduledEnd: '2026-11-19T20:30:00.000Z',
  hospitalName: 'Hospital de prueba',
};

describe('OperationalAgendaSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({
      data: [scheduledCase],
    } as never);
  });

  afterEach(cleanup);

  it('does not request the agenda before the authenticated company is known', () => {
    render(
      <OperationalAgendaSection companyId="" timezone="America/Hermosillo" />,
    );
    expect(screen.queryByText('Agenda operativa')).toBeNull();
    expect(api.get).not.toHaveBeenCalled();
  });

  it('shows real scheduled records and an existing list route', async () => {
    const { container } = render(
      <OperationalAgendaSection
        companyId="company-a"
        timezone="America/Hermosillo"
      />,
    );

    expect(await screen.findByText('Procedimiento programado')).toBeTruthy();
    expect(api.get).toHaveBeenCalledExactlyOnceWith('/healthcare/cases/agenda');
    expect(screen.getByText('HC-000001 · Hospital de prueba')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Ver casos de salud' }).getAttribute('href'),
    ).toBe('/healthcare-cases');
    expect(container.querySelector('time')?.getAttribute('dateTime')).toBe(
      scheduledCase.scheduledStart,
    );
  });

  it('formats the start timestamp in the company timezone', () => {
    expect(formatAgendaDate(scheduledCase.scheduledStart, 'America/Hermosillo')).toContain('11:30');
    expect(formatAgendaDate(scheduledCase.scheduledStart, 'America/Mexico_City')).toContain('12:30');
    expect(formatAgendaDate('invalid', 'America/Hermosillo')).toBe('Fecha no disponible');
    expect(formatAgendaDate(scheduledCase.scheduledStart, 'Bad/Timezone')).toBe('Fecha no disponible');
  });

  it('shows a meaningful empty state', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: [] } as never);
    render(
      <OperationalAgendaSection
        companyId="company-a"
        timezone="America/Hermosillo"
      />,
    );
    expect(await screen.findByText('Sin casos próximos programados')).toBeTruthy();
    expect(
      screen.getByText('No hay casos programados en los próximos siete días.'),
    ).toBeTruthy();
  });

  it('allows retrying without exposing backend errors', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get)
      .mockRejectedValueOnce(new Error('internal private details'))
      .mockResolvedValueOnce({ data: [scheduledCase] } as never);

    render(
      <OperationalAgendaSection
        companyId="company-a"
        timezone="America/Hermosillo"
      />,
    );

    expect(await screen.findByText('No fue posible consultar la agenda.')).toBeTruthy();
    expect(screen.queryByText('internal private details')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Reintentar agenda' }));
    await screen.findByText('Procedimiento programado');
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });
});
