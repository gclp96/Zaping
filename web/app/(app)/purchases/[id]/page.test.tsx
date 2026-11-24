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

import type {
  InventoryMovement,
  Product,
  Purchase,
  PurchaseReceipt,
  Supplier,
} from '../types';
import Purchase360Page from './page';

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  id: 'purchase-1',
}));

vi.mock('@/services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
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

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: routerMock.id }),
  useRouter: () => ({
    push: routerMock.push,
  }),
}));

const purchase: Purchase = {
  id: 'purchase-1',
  folio: 'OC-0001',
  status: 'CONFIRMED',
  receiptProgress: {
    orderedUnits: 10,
    receivedUnits: 4,
    pendingUnits: 6,
    orderedLines: 2,
    completedLines: 1,
  },
  subtotal: 1000,
  iva: 160,
  total: 1160,
  createdAt: '2026-08-29T18:00:00.000Z',
  supplier: {
    id: 'supplier-1',
    name: 'Proveedor médico',
    email: 'proveedor@example.com',
    contactName: 'Responsable de compras',
  },
  items: [
    {
      id: 'purchase-item-1',
      productId: 'product-1',
      quantity: 6,
      price: 100,
      subtotal: 600,
      product: {
        id: 'product-1',
        sku: 'MED-001',
        name: 'Producto médico',
        inventoryTracking: 'QUANTITY',
        lotTracking: 'OPTIONAL',
      },
    },
    {
      id: 'purchase-item-2',
      productId: 'product-1',
      quantity: 4,
      price: 100,
      subtotal: 400,
      product: {
        id: 'product-1',
        sku: 'MED-001',
        name: 'Producto médico',
        inventoryTracking: 'QUANTITY',
        lotTracking: 'OPTIONAL',
      },
    },
  ],
};

const receipt: PurchaseReceipt = {
  id: 'receipt-1',
  purchaseId: 'purchase-1',
  folio: 'RC-0001',
  receivedAt: '2026-08-29T19:00:00.000Z',
  receivedBy: 'user-1',
  receivedByUser: {
    id: 'user-1',
    firstName: 'Ana',
    lastName: 'Ramos',
    email: 'ana@example.com',
  },
  notes: 'Recepción parcial',
  items: [
    {
      id: 'receipt-item-1',
      purchaseItemId: 'purchase-item-1',
      productId: 'product-1',
      quantityReceived: 6,
      lotNumber: 'LOT-1',
      expirationDate: '2028-12-31T00:00:00.000Z',
      unitCost: 100,
      batchId: 'batch-1',
      product: {
        id: 'product-1',
        sku: 'MED-001',
        name: 'Producto médico',
      },
      batch: null,
    },
    {
      id: 'receipt-item-2',
      purchaseItemId: 'purchase-item-2',
      productId: 'product-1',
      quantityReceived: 1,
      lotNumber: 'LOT-2',
      expirationDate: null,
      unitCost: 100,
      batchId: 'batch-2',
      product: {
        id: 'product-1',
        sku: 'MED-001',
        name: 'Producto médico',
      },
      batch: null,
    },
  ],
};

const movement: InventoryMovement = {
  id: 'movement-1',
  productId: 'product-1',
  movementType: 'IN',
  quantity: 7,
  balance: 20,
  unitCost: 100,
  referenceType: 'PURCHASE_RECEIPT',
  referenceId: 'receipt-1',
  notes: null,
  createdAt: '2026-08-29T19:00:01.000Z',
  product: {
    id: 'product-1',
    sku: 'MED-001',
    name: 'Producto médico',
  },
};

const supplier: Supplier = {
  id: 'supplier-1',
  name: 'Proveedor médico',
  email: 'proveedor@example.com',
  contactName: 'Responsable de compras',
};

const product: Product = {
  id: 'product-1',
  sku: 'MED-001',
  name: 'Producto médico',
  cost: 100,
  stock: 20,
  minStock: 2,
  price: 140,
  inventoryTracking: 'QUANTITY',
  lotTracking: 'OPTIONAL',
};

function setupApi({
  purchaseResponse = purchase,
  receiptsResponse = [receipt],
  movementsResponse = [movement],
  role = 'ADMIN',
  auditResponse = [],
}: {
  purchaseResponse?: Purchase;
  receiptsResponse?: PurchaseReceipt[];
  movementsResponse?: InventoryMovement[];
  auditResponse?: object[];
  role?: 'ADMIN' | 'MANAGER' | 'SALES' | 'WAREHOUSE';
} = {}) {
  vi.mocked(api.get).mockImplementation((endpoint: string) => {
    if (endpoint === '/purchase-receipts/capabilities') return Promise.resolve({ data: { authority: 'LEGACY' } }) as never;

    if (endpoint === '/auth/me') {
      return Promise.resolve({
        data: {
          id: 'user-1',
          companyId: 'company-1',
          email: 'admin@test.test',
          firstName: 'Admin',
          lastName: 'Test',
          role,
          companyTimezone: 'America/Hermosillo',
        },
      }) as never;
    }

    if (endpoint === '/purchases/purchase-1') {
      return Promise.resolve({ data: purchaseResponse }) as never;
    }

    if (endpoint === '/purchase-receipts/purchase/purchase-1') {
      return Promise.resolve({ data: receiptsResponse }) as never;
    }

    if (endpoint === '/purchases/purchase-1/cost-audit') {
      return Promise.resolve({ data: auditResponse }) as never;
    }

    if (endpoint === '/purchases/purchase-1/inventory-movements') {
      return Promise.resolve({ data: movementsResponse }) as never;
    }

    if (endpoint === '/suppliers') {
      return Promise.resolve({ data: [supplier] }) as never;
    }

    if (endpoint === '/products') {
      return Promise.resolve({ data: [product] }) as never;
    }

    if (endpoint === '/purchases/purchase-1/pdf') {
      return Promise.resolve({ data: new Blob(['pdf']) }) as never;
    }

    throw new Error(`Unexpected endpoint ${endpoint}`);
  });
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let linkClickSpy: ReturnType<typeof vi.spyOn>;
const createObjectURLMock = vi.fn();
const revokeObjectURLMock = vi.fn();

describe('Purchase360Page', () => {
  beforeEach(() => {
    clearAuthenticatedSessionCache();
    vi.clearAllMocks();
    routerMock.id = 'purchase-1';
    setupApi();
    vi.mocked(api.patch).mockResolvedValue({ data: {} } as never);
    vi.mocked(api.post).mockResolvedValue({
      data: {
        id: 'receipt-created',
        folio: 'RC-0002',
      },
    } as never);

    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURLMock.mockReturnValue('blob:purchase-pdf'),
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURLMock,
    });

    linkClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    consoleErrorSpy.mockRestore();
    linkClickSpy.mockRestore();
  });

  it('muestra los valores de auditoría, el responsable histórico y su rol', async () => {
    setupApi({ auditResponse: [{
      id: 'event-1',
      productDisplayName: 'Producto histórico',
      actorDisplayName: 'Ana Compras',
      actorRole: 'WAREHOUSE',
      createdAt: '2026-11-23T18:00:00Z',
      reason: 'Precio acordado con el proveedor',
      previousGrossUnitCost: '100',
      newGrossUnitCost: '85.5555',
      previousDiscountPercent: '0',
      newDiscountPercent: '10',
      previousNetUnitCost: '100',
      newNetUnitCost: '77',
    }] });
    render(<Purchase360Page />);

    expect(await screen.findByText('Ana Compras')).toBeTruthy();
    const history = screen.getByRole('region', { name: 'Historial de costos y descuentos' });
    expect(within(history).getByText('Almacén')).toBeTruthy();
    expect(screen.getByText('Producto histórico')).toBeTruthy();
    expect(screen.getByText('Precio acordado con el proveedor')).toBeTruthy();
    expect(screen.getByText('$100.00 → $85.5555')).toBeTruthy();
    expect(screen.getByText('0% → 10%')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/purchases/purchase-1/cost-audit');
  });

  it('loads the purchase directly from the route and renders the main hierarchy', async () => {
    render(<Purchase360Page />);

    expect(screen.getByText('Cargando compra...')).toBeTruthy();
    expect(
      await screen.findByRole('heading', { name: 'Compra OC-0001' }),
    ).toBeTruthy();

    expect(api.get).toHaveBeenCalledWith('/purchases/purchase-1');
    expect(api.get).toHaveBeenCalledWith(
      '/purchase-receipts/purchase/purchase-1',
    );
    expect(api.get).toHaveBeenCalledWith(
      '/purchases/purchase-1/inventory-movements',
    );

    expect(screen.getByText('Proveedor médico')).toBeTruthy();
    expect(screen.getByLabelText('Estado de la compra: Confirmada')).toBeTruthy();
    expect(screen.getByText('1 / 2 partidas')).toBeTruthy();
    expect(screen.getByText('4 / 10 uds. · 6 pendientes')).toBeTruthy();
    expect(screen.getAllByText('$1,160.00').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Partidas' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Recepciones' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Trazabilidad' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Volver a compras' }).getAttribute('href'),
    ).toBe('/purchases');
  });

  it('calculates item progress by purchaseItemId, not by productId', async () => {
    render(<Purchase360Page />);

    await screen.findByRole('heading', { name: 'Compra OC-0001' });

    const rows = screen.getAllByRole('row');
    const firstItemRow = rows.find((row) =>
      within(row).queryByText('purchase-item-1'),
    );

    expect(firstItemRow).toBeUndefined();
    expect(screen.getAllByText('MED-001').length).toBeGreaterThan(1);
    expect(screen.getByText('LOT-1')).toBeTruthy();
    expect(screen.getByText('LOT-2')).toBeTruthy();
    expect(screen.getAllByText('6').length).toBeGreaterThan(0);
    expect(screen.getAllByText('3').length).toBeGreaterThan(0);
  });

  it('preserves financial values and semantic section hierarchy', async () => {
    render(<Purchase360Page />);
    await screen.findByRole('heading', { name: 'Compra OC-0001', level: 1 });
    expect(screen.getAllByRole('heading', { level: 2 }).map((el) => el.textContent))
      .toEqual(['Resumen', 'Partidas', 'Resumen financiero', 'Historial de costos y descuentos', 'Recepciones', 'Trazabilidad']);
    const financial = screen.getByRole('heading', { name: 'Resumen financiero' }).closest('section')!;
    expect(within(financial).getByText('$1,000.00')).toBeTruthy();
    expect(within(financial).getByText('$160.00')).toBeTruthy();
    expect(within(financial).getByText('$1,160.00')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Partidas de la compra OC-0001' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Partidas desplazables' }).getAttribute('tabindex')).toBe('0');
  });

  it('withholds aggregate progress during history loading and recovers after an error and retry', async () => {
    const baseGet = vi.mocked(api.get).getMockImplementation()!;
    let rejectHistory!: (reason: Error) => void;
    const pendingHistory = new Promise((_, reject) => { rejectHistory = reject; });
    let historyCalls = 0;
    vi.mocked(api.get).mockImplementation((endpoint: string) => {
      if (endpoint === '/purchase-receipts/purchase/purchase-1') {
        historyCalls += 1;
        return historyCalls === 1 ? pendingHistory as never : Promise.resolve({ data: [receipt] }) as never;
      }
      return baseGet(endpoint);
    });
    const user = userEvent.setup();
    render(<Purchase360Page />);
    await screen.findByRole('heading', { name: 'Compra OC-0001' });
    expect(await screen.findByText('Verificando recepciones...')).toBeTruthy();
    expect(screen.queryByText('4 / 10 uds. · 6 pendientes')).toBeNull();
    expect(screen.getByRole('button', { name: 'Registrar recepción' })).toHaveProperty('disabled', true);
    rejectHistory(new Error('History unavailable'));
    expect(await screen.findByText('Recepción sin verificar')).toBeTruthy();
    expect(screen.queryByText('1 / 2 partidas')).toBeNull();
    expect(screen.queryByText('4 / 10 uds. · 6 pendientes')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reintentar recepciones' }));
    expect(await screen.findByText('4 / 10 uds. · 6 pendientes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registrar recepción' })).toHaveProperty('disabled', false);
  });

  it('shows neutral item progress while receipt history is unavailable', async () => {
    vi.mocked(api.get).mockImplementation((endpoint: string) => {
      if (endpoint === '/auth/me') {
        return Promise.resolve({
          data: {
            id: 'user-1',
            companyId: 'company-1',
            email: 'admin@test.test',
            firstName: 'Admin',
            lastName: 'Test',
            role: 'ADMIN',
            companyTimezone: 'America/Hermosillo',
          },
        }) as never;
      }

      if (endpoint === '/purchases/purchase-1') {
        return Promise.resolve({ data: purchase }) as never;
      }

      if (endpoint === '/purchase-receipts/purchase/purchase-1') {
        return Promise.reject(new Error('Receipts unavailable')) as never;
      }

      if (endpoint === '/purchases/purchase-1/cost-audit') {
        return Promise.resolve({ data: [] }) as never;
      }

      if (endpoint === '/purchases/purchase-1/inventory-movements') {
        return Promise.resolve({ data: [movement] }) as never;
      }

      throw new Error(`Unexpected endpoint ${endpoint}`);
    });

    render(<Purchase360Page />);

    await screen.findByRole('heading', { name: 'Compra OC-0001' });

    expect(screen.getByText('Receipts unavailable')).toBeTruthy();
    expect(screen.getByText('Verifica las recepciones antes de registrar una nueva.')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Registrar recepción' }),
    ).toHaveProperty('disabled', true);
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Recepción sin verificar')).toBeTruthy();
    expect(screen.queryByText('4 / 10 uds. · 6 pendientes')).toBeNull();
  });

  it('isolates related resource errors and supports local retries', async () => {
    vi.mocked(api.get).mockImplementation((endpoint: string) => {
      if (endpoint === '/auth/me') {
        return Promise.resolve({
          data: {
            id: 'user-1',
            companyId: 'company-1',
            email: 'admin@test.test',
            firstName: 'Admin',
            lastName: 'Test',
            role: 'ADMIN',
            companyTimezone: 'America/Hermosillo',
          },
        }) as never;
      }

      if (endpoint === '/purchases/purchase-1') {
        return Promise.resolve({ data: purchase }) as never;
      }

      if (endpoint === '/purchase-receipts/purchase/purchase-1') {
        return Promise.resolve({ data: [] }) as never;
      }

      if (endpoint === '/purchases/purchase-1/cost-audit') {
        return Promise.resolve({ data: [] }) as never;
      }

      if (endpoint === '/purchases/purchase-1/inventory-movements') {
        const movementCalls = vi
          .mocked(api.get)
          .mock.calls.filter(
            ([calledEndpoint]) =>
              calledEndpoint ===
              '/purchases/purchase-1/inventory-movements',
          ).length;

        return movementCalls === 1
          ? (Promise.reject(new Error('Movements unavailable')) as never)
          : (Promise.resolve({ data: [movement] }) as never);
      }

      throw new Error(`Unexpected endpoint ${endpoint}`);
    });

    const user = userEvent.setup();
    render(<Purchase360Page />);

    expect(
      await screen.findByRole('heading', { name: 'Compra OC-0001' }),
    ).toBeTruthy();
    expect(screen.getByText('Movements unavailable')).toBeTruthy();
    expect(
      screen.getByText('Esta compra todavía no tiene recepciones registradas.'),
    ).toBeTruthy();

    await user.click(
      screen.getByRole('button', { name: 'Reintentar movimientos' }),
    );

    expect(await screen.findByText('IN')).toBeTruthy();
    expect(screen.queryByText('Movements unavailable')).toBeNull();
  });

  it('shows not found and base error states without hiding navigation', async () => {
    vi.mocked(api.get).mockImplementation((endpoint: string) => {
      if (endpoint === '/auth/me') {
        return Promise.resolve({
          data: {
            id: 'user-1',
            companyId: 'company-1',
            email: 'admin@test.test',
            firstName: 'Admin',
            lastName: 'Test',
            role: 'ADMIN',
            companyTimezone: 'America/Hermosillo',
          },
        }) as never;
      }

      return Promise.reject({
        isAxiosError: true,
        response: {
          status: 404,
        },
      }) as never;
    });

    render(<Purchase360Page />);

    expect(await screen.findByText('Compra no encontrada')).toBeTruthy();
    expect(
      screen.getAllByRole('link', { name: 'Volver a compras' }).length,
    ).toBeGreaterThan(0);

    cleanup();
    vi.clearAllMocks();
    vi.mocked(api.get).mockRejectedValueOnce(new Error('API unavailable'));

    render(<Purchase360Page />);

    expect(await screen.findByText('API unavailable')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });

  it('renders the action matrix by status', async () => {
    const statuses: Array<[Purchase['status'], string[]]> = [
      ['DRAFT', ['Aprobar', 'Editar', 'Cancelar', 'Descargar PDF']],
      ['CONFIRMED', ['Registrar recepción', 'Descargar PDF']],
      ['PARTIALLY_RECEIVED', ['Registrar recepción', 'Descargar PDF']],
      ['RECEIVED', ['Descargar PDF']],
      ['CANCELLED', ['Descargar PDF']],
    ];

    for (const [status, visibleActions] of statuses) {
      cleanup();
      setupApi({
        purchaseResponse: {
          ...purchase,
          status,
        },
      });

      render(<Purchase360Page />);
      await screen.findByRole('heading', { name: 'Compra OC-0001' });

      for (const action of visibleActions) {
        expect(screen.getByRole('button', { name: action })).toBeTruthy();
      }

      if (status !== 'DRAFT') {
        expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
      }

      if (status !== 'CONFIRMED' && status !== 'PARTIALLY_RECEIVED') {
        expect(
          screen.queryByRole('button', { name: 'Registrar recepción' }),
        ).toBeNull();
      }
    }
  });

  it('hides approval and cancellation for WAREHOUSE while retaining edit and read actions', async () => {
    clearAuthenticatedSessionCache();
    setupApi({
      purchaseResponse: {
        ...purchase,
        status: 'DRAFT',
      },
      role: 'WAREHOUSE',
    });

    render(<Purchase360Page />);
    await screen.findByRole('heading', { name: 'Compra OC-0001' });

    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Descargar PDF' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
  });

  it('refreshes the purchase after approving or cancelling', async () => {
    const user = userEvent.setup();
    setupApi({
      purchaseResponse: {
        ...purchase,
        status: 'DRAFT',
      },
    });

    render(<Purchase360Page />);
    await screen.findByRole('heading', { name: 'Compra OC-0001' });

    await user.click(screen.getByRole('button', { name: 'Aprobar' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Aprobar',
      }),
    );

    expect(api.patch).toHaveBeenCalledWith('/purchases/purchase-1/approve');
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith('/purchases/purchase-1'),
    );

    cleanup();
    vi.clearAllMocks();
    setupApi({
      purchaseResponse: {
        ...purchase,
        status: 'DRAFT',
      },
    });
    vi.mocked(api.patch).mockResolvedValue({ data: {} } as never);

    render(<Purchase360Page />);
    await screen.findByRole('heading', { name: 'Compra OC-0001' });

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar compra' }));

    expect(api.patch).toHaveBeenCalledWith('/purchases/purchase-1/cancel');
  });

  it('opens edit and receipt flows while preserving their existing contracts', async () => {
    const user = userEvent.setup();
    setupApi({
      purchaseResponse: {
        ...purchase,
        status: 'DRAFT',
      },
    });

    const { unmount } = render(<Purchase360Page />);
    await screen.findByRole('heading', { name: 'Compra OC-0001' });

    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(api.get).toHaveBeenCalledWith('/suppliers');
    expect(api.get).toHaveBeenCalledWith('/products');
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Editar compra' })).toBeTruthy();

    unmount();
    cleanup();
    setupApi();

    render(<Purchase360Page />);
    await screen.findByRole('heading', { name: 'Compra OC-0001' });

    await user.click(screen.getByRole('button', { name: 'Registrar recepción' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Registrar recepción · OC-0001',
      }),
    ).toBeTruthy();
    expect(screen.getByText('Máximo pendiente: 3.')).toBeTruthy();
  });

  it('preserves PDF download behavior', async () => {
    const user = userEvent.setup();
    render(<Purchase360Page />);

    await screen.findByRole('heading', { name: 'Compra OC-0001' });
    await user.click(screen.getByRole('button', { name: 'Descargar PDF' }));

    expect(api.get).toHaveBeenCalledWith('/purchases/purchase-1/pdf', {
      responseType: 'blob',
    });
    expect(createObjectURLMock).toHaveBeenCalled();
    expect(linkClickSpy).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:purchase-pdf');
  });
});
