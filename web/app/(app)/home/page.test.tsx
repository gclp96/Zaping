import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { api } from '@/services/api';
import { clearAuthenticatedSessionCache } from '@/app/auth-session';

import HomePage from './page';

const navigationMock = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: navigationMock.push,
  }),
}));

vi.mock('@/services/api', () => ({
  api: {
    get: vi.fn(),
  },
}));

const dashboardData = {
  totals: {
    quotes: 7,
    purchases: 5,
    sales: 6,
  },
  lowStock: [
    {
      id: 'product-empty',
      stock: 0,
      minStock: 4,
    },
    {
      id: 'product-low',
      stock: 2,
      minStock: 5,
    },
  ],
};

const equipmentData = [
  {
    id: 'equipment-pending-1',
    lifecycle: 'ACTIVE',
    condition: 'INSPECTION_PENDING',
  },
  {
    id: 'equipment-pending-2',
    lifecycle: 'ACTIVE',
    condition: 'INSPECTION_PENDING',
  },
  {
    id: 'equipment-retired',
    lifecycle: 'RETIRED',
    condition: 'INSPECTION_PENDING',
  },
  {
    id: 'equipment-ready',
    lifecycle: 'ACTIVE',
    condition: 'GOOD',
  },
];

const purchasesData = [
  { id: 'purchase-confirmed', status: 'CONFIRMED' },
  { id: 'purchase-partial', status: 'PARTIALLY_RECEIVED' },
  { id: 'purchase-draft', status: 'DRAFT' },
  { id: 'purchase-received', status: 'RECEIVED' },
] as const;

let homeRole: 'ADMIN' | 'MANAGER' | 'SALES' | 'WAREHOUSE' = 'ADMIN';

function mockHomeSuccess({
  dashboard = dashboardData,
  equipment = equipmentData,
  purchases = purchasesData,
}: {
  dashboard?: typeof dashboardData;
  equipment?: typeof equipmentData;
  purchases?: ReadonlyArray<(typeof purchasesData)[number]>;
} = {}) {
  vi.mocked(api.get).mockImplementation(async (url) => {
    const endpoint = String(url);

    if (endpoint === '/auth/me') {
      return {
        data: {
          id: 'user-1',
          companyId: 'company-1',
          email: 'admin@test.test',
          firstName: 'Admin',
          lastName: 'Test',
          role: homeRole,
          companyTimezone: 'America/Hermosillo',
          companyName: 'Zaping QA Company A',
        },
      } as never;
    }

    if (endpoint === '/dashboard/recent-activity') {
      return { data: [] } as never;
    }

    if (endpoint === '/dashboard') {
      return { data: dashboard } as never;
    }

    if (endpoint === '/equipment') {
      return { data: equipment } as never;
    }

    if (endpoint === '/purchases') {
      return { data: purchases } as never;
    }

    throw new Error(`Unexpected endpoint ${endpoint}`);
  });
}

describe('HomePage', () => {
  beforeEach(() => {
    homeRole = 'ADMIN';
    clearAuthenticatedSessionCache();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockHomeSuccess();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the wide Home workspace without duplicating Dashboard', async () => {
    const { container } = render(<HomePage />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Inicio' }),
    ).toBeTruthy();
    expect(screen.getByText('Resumen de tu operación diaria.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Bienvenida' })).toBeTruthy();
    expect(container.firstElementChild?.classList.contains('max-w-none')).toBe(
      true,
    );

    await screen.findByRole('heading', { level: 2, name: 'Hola, Admin' });
    expect(
      screen.getByText('Aquí tienes un resumen de la operación en Zaping QA Company A.'),
    ).toBeTruthy();
    await screen.findByText('Productos sin stock');
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/equipment');
      expect(api.get).toHaveBeenCalledWith('/purchases');
    });

    expect(api.get).toHaveBeenCalledWith('/dashboard');
    expect(api.get).toHaveBeenCalledWith('/equipment');
    expect(api.get).toHaveBeenCalledWith('/purchases');
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/dashboard/recent-activity');
      expect(api.get).toHaveBeenCalledTimes(5);
    });
    const operationalSummary = screen
      .getByRole('heading', { level: 2, name: 'Resumen operativo' })
      .closest('section') as HTMLElement;
    expect(within(operationalSummary).getByText('Cotizaciones')).toBeTruthy();
    expect(within(operationalSummary).getByText('Compras')).toBeTruthy();
    expect(within(operationalSummary).getByText('Ventas')).toBeTruthy();
    expect(
      within(operationalSummary).getByRole('link', { name: 'Cotizaciones' }).getAttribute('href'),
    ).toBe('/quotes');
    expect(screen.queryByText('Valor de inventario')).toBeNull();
    expect(screen.queryByText('Ventas recientes')).toBeNull();
    expect(screen.queryByText('Productos')).toBeNull();
  });

  it('keeps SALES on dashboard and commercial actions without loading warehouse resources', async () => {
    homeRole = 'SALES';
    clearAuthenticatedSessionCache();
    mockHomeSuccess();

    render(<HomePage />);

    await screen.findByText('Productos sin stock');

    expect(api.get).toHaveBeenCalledWith('/dashboard');
    expect(api.get).not.toHaveBeenCalledWith('/equipment');
    expect(api.get).not.toHaveBeenCalledWith('/purchases');
    expect(screen.getByRole('button', { name: 'Nueva cotización' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nueva venta' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nueva compra' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Registrar recepción' }),
    ).toBeNull();
    expect(screen.queryByText('Inspecciones pendientes')).toBeNull();
    expect(screen.queryByText('Compras por recibir')).toBeNull();
    const operationalSummary = screen
      .getByRole('heading', { level: 2, name: 'Resumen operativo' })
      .closest('section') as HTMLElement;
    expect(within(operationalSummary).getByText('Cotizaciones')).toBeTruthy();
    expect(within(operationalSummary).getByText('Ventas')).toBeTruthy();
    expect(within(operationalSummary).queryByText('Compras')).toBeNull();
  });

  it('keeps WAREHOUSE operational attention and warehouse actions available', async () => {
    homeRole = 'WAREHOUSE';
    clearAuthenticatedSessionCache();
    mockHomeSuccess();

    render(<HomePage />);

    await screen.findByText('2 equipos requieren inspección');

    expect(api.get).toHaveBeenCalledWith('/dashboard');
    expect(api.get).toHaveBeenCalledWith('/equipment');
    expect(api.get).toHaveBeenCalledWith('/purchases');
    expect(screen.getByRole('button', { name: 'Nueva compra' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Registrar recepción' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Nueva cotización' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nueva venta' })).toBeNull();
    const operationalSummary = screen
      .getByRole('heading', { level: 2, name: 'Resumen operativo' })
      .closest('section') as HTMLElement;
    expect(within(operationalSummary).getByText('Compras')).toBeTruthy();
    expect(within(operationalSummary).queryByText('Cotizaciones')).toBeNull();
    expect(within(operationalSummary).queryByText('Ventas')).toBeNull();
  });

  it('keeps the complete operational summary for MANAGER', async () => {
    homeRole = 'MANAGER';
    clearAuthenticatedSessionCache();
    mockHomeSuccess();

    render(<HomePage />);

    await screen.findByText('Productos sin stock');

    const operationalSummary = screen
      .getByRole('heading', { level: 2, name: 'Resumen operativo' })
      .closest('section') as HTMLElement;
    expect(within(operationalSummary).getByText('Cotizaciones')).toBeTruthy();
    expect(within(operationalSummary).getByText('Compras')).toBeTruthy();
    expect(within(operationalSummary).getByText('Ventas')).toBeTruthy();
  });

  it('navigates every quick action to an existing workflow route', async () => {
    const user = userEvent.setup();

    render(<HomePage />);
    await screen.findByRole('button', { name: 'Nueva cotización' });

    const quotationAction = screen.getByRole('button', { name: 'Nueva cotización' });
    expect(quotationAction.classList.contains('bg-blue-50/80')).toBe(true);

    for (const [label, href] of [
      ['Nueva cotización', '/quotes'],
      ['Nueva venta', '/sales'],
      ['Nueva compra', '/purchases'],
      ['Registrar recepción', '/purchases'],
    ]) {
      await user.click(screen.getByRole('button', { name: label }));
      expect(navigationMock.push).toHaveBeenLastCalledWith(href);
    }
  });

  it('renders only actionable alerts supported by current APIs', async () => {
    render(<HomePage />);

    expect(await screen.findByText('2 equipos requieren inspección')).toBeTruthy();
    expect(await screen.findByText('1 producto requiere reposición')).toBeTruthy();
    expect(
      screen.getByText('1 producto está en o debajo de su mínimo'),
    ).toBeTruthy();
    expect(
      screen.getByText('2 compras permiten registrar recepción'),
    ).toBeTruthy();

    expect(
      screen
        .getAllByRole('link', { name: 'Ver inventario' })[0]
        .getAttribute('href'),
    ).toBe('/inventory');
    expect(
      screen.getByRole('link', { name: 'Ver equipos' }).getAttribute('href'),
    ).toBe('/equipment');
    expect(
      screen.getByRole('link', { name: 'Ver compras' }).getAttribute('href'),
    ).toBe('/purchases');
  });

  it('keeps zero-value alerts quiet and shows one positive state', async () => {
    mockHomeSuccess({
      dashboard: {
        ...dashboardData,
        lowStock: [],
      },
      equipment: equipmentData.filter(
        (equipment) => equipment.condition !== 'INSPECTION_PENDING',
      ),
      purchases: [
        { id: 'purchase-draft', status: 'DRAFT' },
        { id: 'purchase-received', status: 'RECEIVED' },
      ],
    });

    render(<HomePage />);

    expect(
      await screen.findByText(
        'No hay operaciones que requieran atención inmediata.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Productos sin stock')).toBeNull();
    expect(screen.queryByText('Stock bajo')).toBeNull();
    expect(screen.queryByText('Inspecciones pendientes')).toBeNull();
    expect(screen.queryByText('Compras por recibir')).toBeNull();
  });

  it('shows coherent loading feedback while Home data is pending', () => {
    vi.mocked(api.get).mockImplementation(() => new Promise(() => undefined));

    render(<HomePage />);

    expect(screen.getByText('Cargando prioridades...')).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Inicio' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Nueva cotización' }),
    ).toBeNull();
  });

  it('keeps supported alerts usable when one source fails and retries locally', async () => {
    const user = userEvent.setup();
    let dashboardAttempts = 0;

  vi.mocked(api.get).mockImplementation(async (url) => {
    const endpoint = String(url);

    if (endpoint === '/auth/me') {
      return {
        data: {
          id: 'user-1',
          companyId: 'company-1',
          email: 'admin@test.test',
          firstName: 'Admin',
          lastName: 'Test',
          role: homeRole,
          companyTimezone: 'America/Hermosillo',
          companyName: 'Zaping QA Company A',
        },
      } as never;
    }

      if (endpoint === '/dashboard/recent-activity') {
        return { data: [] } as never;
      }

      if (endpoint === '/dashboard') {
        dashboardAttempts += 1;

        if (dashboardAttempts === 1) {
          throw new Error('Dashboard unavailable');
        }

        return { data: dashboardData } as never;
      }

      if (endpoint === '/equipment') {
        return { data: equipmentData } as never;
      }

      if (endpoint === '/purchases') {
        return { data: purchasesData } as never;
      }

      throw new Error(`Unexpected endpoint ${endpoint}`);
    });

    render(<HomePage />);

    expect(await screen.findByText('Inventario no disponible')).toBeTruthy();
    expect(
      await screen.findByText('2 equipos requieren inspección'),
    ).toBeTruthy();
    expect(
      await screen.findByText('2 compras permiten registrar recepción'),
    ).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: 'Reintentar inventario' }),
    );

    await waitFor(() => {
      expect(screen.queryByText('Inventario no disponible')).toBeNull();
    });
    expect(screen.getByText('Productos sin stock')).toBeTruthy();
    expect(dashboardAttempts).toBe(2);
  });

  it('uses responsive grids without introducing a fixed-width contract', async () => {
    render(<HomePage />);

    await screen.findByText('Productos sin stock');

    const quickActionsSection = screen
      .getByRole('heading', { level: 2, name: 'Acciones rápidas' })
      .closest('section');
    const attentionSection = screen
      .getByRole('heading', { level: 2, name: 'Requiere atención' })
      .closest('section');
    const quickActionsGrid = quickActionsSection?.querySelector('.grid');
    const attentionGrid = attentionSection?.querySelector('.grid');

    expect(quickActionsGrid?.classList.contains('sm:grid-cols-2')).toBe(true);
    expect(quickActionsGrid?.classList.contains('xl:grid-cols-4')).toBe(true);
    expect(attentionGrid?.classList.contains('md:grid-cols-2')).toBe(true);
    expect(
      attentionSection?.parentElement?.classList.contains(
        'xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]',
      ),
    ).toBe(true);
    expect(
      within(attentionSection as HTMLElement).getAllByRole('link').length,
    ).toBeGreaterThan(0);
  });
});
