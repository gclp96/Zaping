import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import CompanyClock, { formatCompanyDateTime } from './CompanyClock';

afterEach(() => {
  cleanup();
});

describe('CompanyClock', () => {
  const sameInstant = new Date('2026-11-18T04:30:00.000Z');

  it('formats the same instant using the authenticated company timezone', () => {
    expect(formatCompanyDateTime(sameInstant, 'America/Hermosillo')?.time).toBe('21:30');
    expect(formatCompanyDateTime(sameInstant, 'America/Mexico_City')?.time).toBe('22:30');
    expect(formatCompanyDateTime(sameInstant, 'America/Hermosillo')?.date).toMatch(/^Mar/i);
    expect(formatCompanyDateTime(sameInstant, 'America/Hermosillo')?.date).toMatch(/17/);
  });

  it('avoids showing an incorrect local clock when the timezone is invalid', () => {
    expect(formatCompanyDateTime(sameInstant, 'Invalid/Timezone')).toBeNull();
  });

  it('renders a time element after hydration without pretending to select a branch', async () => {
    render(<CompanyClock timezone="America/Hermosillo" />);
    expect(screen.getByLabelText('Fecha y hora de la empresa')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/\d{2}:\d{2}/)).toBeTruthy();
    });
    expect(screen.queryByRole('button')).toBeNull();
  });
});
