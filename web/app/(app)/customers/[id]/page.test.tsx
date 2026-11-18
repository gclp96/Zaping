import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAuthenticatedSessionCache } from '@/app/auth-session';
import { api } from '@/services/api';
import CustomerDetailPage, {
  formatCustomerDocumentDate,
  type CustomerOverview,
} from './page';

const route = vi.hoisted(() => ({ id: 'customer-a' }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: route.id }),
}));

vi.mock('@/services/api', () => ({
  api: { get: vi.fn() },
}));

vi.mock('@/services/errors', () => ({
  getApiErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  isForbiddenError: (error: unknown) =>
    Boolean(
      error &&
        typeof error === 'object' &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 403,
    ),
}));

const overview: CustomerOverview = {
  customer: {
    id: 'customer-a',
    name: 'Hospital QA',
    type: 'Hospital',
    email: 'compras@hospital.test',
    phone: '6621234567',
    contactName: 'Rosa Sánchez',
    address: 'Hermosillo, Sonora',
    notes: 'Entrega de lunes a viernes',
    isActive: true,
    createdAt: '2026-11-01T18:00:00.000Z',
  },
  counts: { quotes: 8, sales: 2 },
  recentQuotes: [
    {
      id: 'quote-a',
      folio: 'COT-100',
      status: 'CONFIRMED',
      total: 1234,
      createdAt: '2026-11-17T15:00:00.000Z',
    },
  ],
  recentSales: [
    {
      id: 'sale-a',
      folio: 'V-101',
      status: 'DRAFT',
      total: 600,
      createdAt: '2026-11-16T15:00:00.000Z',
    },
  ],
};

function setupApi(role = 'ADMIN', data = overview) {
  vi.mocked(api.get).mockImplementation(async (endpoint: string) => {
    if (endpoint === '/auth/me') {
      return {
        data: {
          id: 'user-1',
          companyId: 'company-a',
          role,
          email: 'admin@qa.test',
          firstName: 'QA',
          lastName: 'Admin',
          companyTimezone: 'America/Hermosillo',
          companyName: 'QA Company',
        },
      } as never;
    }
    if (endpoint === '/customers/customer-a/overview') {
      return { data } as never;
    }
    throw new Error('Endpoint inesperado: ' + endpoint);
  });
}

describe('CustomerDetailPage', () => {
  beforeEach(() => {
    clearAuthenticatedSessionCache();
    vi.clearAllMocks();
    route.id = 'customer-a';
    setupApi();
  });

  afterEach(cleanup);

  it('shows customer details, bounded recent documents and real navigation', async () => {
    render(<CustomerDetailPage />);

    expect(
      await screen.findByRole('heading', { name: 'Hospital QA' }),
    ).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/customers/customer-a/overview');
    expect(screen.getByText('Rosa Sánchez')).toBeTruthy();
    expect(screen.getByText('Hermosillo, Sonora')).toBeTruthy();
    expect(screen.getByText('Entrega de lunes a viernes')).toBeTruthy();
    expect(screen.getByText('Cotizaciones registradas')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('COT-100')).toBeTruthy();
    expect(screen.getByText('V-101')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Ver venta V-101' }).getAttribute('href'),
    ).toBe('/sales?saleId=sale-a');
    expect(
      screen.getByRole('link', { name: 'Ver cotizaciones' }).getAttribute('href'),
    ).toBe('/quotes');
    expect(
      screen.getByRole('link', { name: 'Volver a clientes' }).getAttribute('href'),
    ).toBe('/customers');
    const quoteSection = screen.getByRole('heading', {
      name: 'Cotizaciones recientes',
    }).closest('section');
    expect(quoteSection).not.toBeNull();
    expect(within(quoteSection as HTMLElement).getByText('Aprobada')).toBeTruthy();
    expect(within(quoteSection as HTMLElement).getByText('Mostrando los 1 registros más recientes.')).toBeTruthy();
  });

  it('does not call customer overview for a role without commercial access', async () => {
    setupApi('WAREHOUSE');
    render(<CustomerDetailPage />);

    await screen.findByText(/No tienes permiso|Acceso denegado|No autorizado/i);
    expect(api.get).not.toHaveBeenCalledWith('/customers/customer-a/overview');
  });

  it('handles missing optional fields and empty document history', async () => {
    setupApi('SALES', {
      customer: {
        ...overview.customer,
        contactName: null,
        email: null,
        phone: null,
        address: null,
        notes: null,
        isActive: false,
      },
      counts: { quotes: 0, sales: 0 },
      recentQuotes: [],
      recentSales: [],
    });

    render(<CustomerDetailPage />);
    await screen.findByRole('heading', { name: 'Hospital QA' });
    expect(screen.getByText('Inactivo')).toBeTruthy();
    expect(screen.getAllByText('Sin registrar')).toHaveLength(4);
    expect(
      screen.getByText('No hay cotizaciones registradas para este cliente.'),
    ).toBeTruthy();
    expect(
      screen.getByText('No hay ventas registradas para este cliente.'),
    ).toBeTruthy();
  });

  it('does not reveal resources in another company or nonexistent customers', async () => {
    vi.mocked(api.get).mockImplementation(async (endpoint: string) => {
      if (endpoint === '/auth/me') {
        return {
          data: {
            id: 'user-1',
            companyId: 'company-a',
            role: 'ADMIN',
            companyTimezone: 'America/Hermosillo',
          },
        } as never;
      }
      throw Object.assign(new Error('Not Found'), {
        isAxiosError: true,
        response: { status: 404 },
      });
    });

    render(<CustomerDetailPage />);
    expect(await screen.findByText('Cliente no encontrado')).toBeTruthy();
    expect(screen.queryByText('Hospital QA')).toBeNull();
  });

  it('supports a non-destructive retry after a network error', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get).mockImplementation((endpoint: string) => {
      if (endpoint === '/auth/me') {
        return Promise.resolve({
          data: {
            id: 'user-1',
            companyId: 'company-a',
            role: 'ADMIN',
            companyTimezone: 'America/Hermosillo',
          },
        }) as never;
      }
      return Promise.reject(new Error('Red temporalmente no disponible'));
    });

    render(<CustomerDetailPage />);
    expect(
      await screen.findByText('Red temporalmente no disponible'),
    ).toBeTruthy();

    vi.mocked(api.get).mockImplementation((endpoint: string) =>
      Promise.resolve({
        data: endpoint === '/auth/me' ? {} : overview,
      }) as never,
    );
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('heading', { name: 'Hospital QA' });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/customers/customer-a/overview'),
    );
  });

  it('formats dates using company timezone', () => {
    expect(
      formatCustomerDocumentDate(
        '2026-11-18T04:30:00.000Z',
        'America/Hermosillo',
      ),
    ).toContain('17');
    expect(
      formatCustomerDocumentDate(
        '2026-11-18T04:30:00.000Z',
        'America/Mexico_City',
      ),
    ).toContain('17');
    expect(formatCustomerDocumentDate('invalid', 'UTC')).toBe(
      'Fecha no disponible',
    );
  });
});
