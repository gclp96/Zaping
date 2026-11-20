import {
  cleanup,
  fireEvent,
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

import PurchasesPage from './page';

import type { Purchase } from './types';

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  search: '',
}));

vi.mock('@/services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('@/services/errors', () => ({
  getApiErrorStatus: (error: unknown) =>
    error && typeof error === 'object' && 'response' in error
      ? (error as { response?: { status?: number } }).response?.status
      : undefined,
  getApiErrorMessage: (
    _error: unknown,
    fallbackMessage: string,
  ) => fallbackMessage,
  isForbiddenError: (error: unknown) =>
    Boolean(
      error &&
        typeof error === 'object' &&
        'response' in error &&
        (error as { response?: { status?: number } }).response?.status === 403,
    ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => new URLSearchParams(routerMock.search),
}));

const receiptIdempotencyKey =
  '11111111-1111-4111-8111-111111111111';

const purchase: Purchase = {
  id: 'purchase-1',
  folio: 'OC-0001',
  status: 'CONFIRMED',
  receiptProgress: {
    orderedUnits: 10,
    receivedUnits: 4,
    pendingUnits: 6,
    orderedLines: 1,
    completedLines: 0,
  },
  subtotal: 1000,
  iva: 160,
  total: 1160,
  createdAt: '2026-07-23T18:00:00.000Z',
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
      quantity: 10,
      price: 100,
      subtotal: 1000,
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

const draftPurchase: Purchase = {
  ...purchase,
  status: 'DRAFT',
};

const confirmedFilterPurchase: Purchase = {
  ...purchase,
  id: 'purchase-5',
  folio: 'OC-0005',
};

const partialPurchase: Purchase = {
  ...purchase,
  id: 'purchase-2',
  folio: 'OC-0002',
  status: 'PARTIALLY_RECEIVED',
  supplier: {
    id: 'supplier-2',
    name: 'Clínica del Desierto',
    contactName: 'María Torres',
    email: 'compras@desierto.test',
    isActive: false,
  },
  items: [
    {
      ...purchase.items[0],
      id: 'purchase-item-2',
      productId: 'product-2',
      product: {
        id: 'product-2',
        sku: 'RX-200',
        name: 'Reactivo especializado',
        inventoryTracking: 'QUANTITY',
        lotTracking: 'OPTIONAL',
      },
    },
  ],
};

const receivedPurchase: Purchase = {
  ...purchase,
  id: 'purchase-3',
  folio: 'OC-0003',
  status: 'RECEIVED',
};

const cancelledPurchase: Purchase = {
  ...purchase,
  id: 'purchase-4',
  folio: 'OC-0004',
  status: 'CANCELLED',
};

function buildPurchaseList(count: number): Purchase[] {
  return Array.from({ length: count }, (_, index) => {
    const sequence = index + 1;
    const timestamp = new Date(
      Date.UTC(2026, 6, sequence, 18, 0, 0),
    ).toISOString();
    const isConfirmed = sequence % 2 === 0;

    return {
      ...purchase,
      id: `purchase-page-${sequence}`,
      folio: `OC-${String(sequence).padStart(4, '0')}`,
      subtotal: sequence * 100,
      iva: 0,
      total: sequence * 100,
      status: isConfirmed ? 'CONFIRMED' : 'DRAFT',
      createdAt: timestamp,
      supplier: isConfirmed
        ? {
            ...supplier,
            id: 'supplier-2',
            name: 'Proveedor alterno',
          }
        : {
            ...supplier,
            id: 'supplier-1',
          },
      items: [
        {
          ...purchase.items[0],
          id: `purchase-item-page-${sequence}`,
          price: sequence * 100,
          subtotal: sequence * 100,
        },
      ],
    };
  });
}


const supplier = {
  id: 'supplier-1',
  name: 'Proveedor médico',
  email: 'proveedor@example.com',
  contactName: 'Responsable de compras',
};

const product = {
  id: 'product-1',
  sku: 'MED-001',
  name: 'Producto médico',
  cost: 100,
  stock: 4,
  minStock: 2,
  price: 120,
  inventoryTracking: 'QUANTITY',
  lotTracking: 'OPTIONAL',
};

const previousReceipt = {
  id: 'receipt-1',
  purchaseId: 'purchase-1',
  folio: 'RC-0001',
  receivedAt: '2026-07-23T19:00:00.000Z',
  receivedBy: 'user-1',
  receivedByUser: {
    id: 'user-1',
    firstName: 'Leonardo',
    lastName: 'Garnica',
    email: 'admin@example.com',
  },
  notes: 'Primera recepción parcial',
  items: [
    {
      id: 'receipt-item-1',
      purchaseItemId: 'purchase-item-1',
      productId: 'product-1',
      quantityReceived: 4,
      lotNumber: 'LOTE-001',
      expirationDate: '2028-12-31T00:00:00.000Z',
      unitCost: 100,
      batchId: 'batch-1',
      product: {
        id: 'product-1',
        sku: 'MED-001',
        name: 'Producto médico',
      },
      batch: {
        id: 'batch-1',
        lotNumber: 'LOTE-001',
        expirationDate: '2028-12-31T00:00:00.000Z',
        initialQuantity: 4,
        availableQuantity: 4,
        unitCost: 100,
      },
    },
  ],
};

type ConfigureApiMocksOptions = {
  companyTimezone?: string;
  receiptAuthority?: 'LEGACY' | 'PHYSICAL';
  authMeError?: Error;
  role?: 'ADMIN' | 'MANAGER' | 'SALES' | 'WAREHOUSE';
};

function configureApiMocks(
  purchases: Purchase[] = [purchase],
  options: ConfigureApiMocksOptions = {},
) {
  vi.mocked(api.get).mockImplementation(
    async (url) => {
      const endpoint = String(url);

      if (endpoint === '/purchase-receipts/capabilities') return { data: { authority: options.receiptAuthority ?? 'LEGACY' } } as never;

    if (endpoint === '/auth/me') {
        if (options.authMeError) {
          throw options.authMeError;
        }

        return {
          data: {
            id: 'user-1',
            companyId: 'company-1',
            email: 'admin@test.test',
            firstName: 'Admin',
            lastName: 'Test',
            role: options.role ?? 'ADMIN',
            companyTimezone:
              options.companyTimezone ?? 'America/Hermosillo',
          },
        } as never;
      }

      if (endpoint === '/purchases') {
        return {
          data: purchases,
        } as never;
      }

      if (endpoint === '/suppliers') {
        return {
          data: [supplier],
        } as never;
      }

      if (endpoint === '/products') {
        return {
          data: [product],
        } as never;
      }

      if (
        endpoint ===
        '/purchases/purchase-1/inventory-movements'
      ) {
        return {
          data: [],
        } as never;
      }

      if (
        endpoint ===
        '/purchase-receipts/purchase/purchase-1'
      ) {
        return {
          data: [previousReceipt],
        } as never;
      }

      throw new Error(
        `Solicitud GET no configurada: ${endpoint}`,
      );
    },
  );
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

async function selectProduct(
  user: ReturnType<typeof userEvent.setup>,
  searchValue = 'MED-001',
) {
  const productSelect = screen.getByRole(
    'combobox',
    {
      name: 'Producto',
    },
  );

  await user.click(productSelect);

  await user.type(
    productSelect,
    searchValue,
  );

  await user.click(
    screen.getByRole('option', {
      name: new RegExp(searchValue, 'i'),
    }),
  );
}

function getReceiptSubmitButton() {
  const receiptHeading = screen.getByRole('heading', {
    name: /registrar recepci[oó]n.*OC-0001/i,
  });
  const receiptModal = receiptHeading.parentElement?.parentElement;

  if (!receiptModal) {
    throw new Error('No se encontró el modal de recepción.');
  }

  return within(receiptModal).getByRole('button', {
    name: /^registrar recepci[oó]n$/i,
  });
}

function getPurchaseRowByFolio(folio: string) {
  const folioLink = screen.getByRole('link', { name: folio });
  const row = folioLink.closest('tr');

  if (!row) {
    throw new Error(`No se encontró la fila de la compra ${folio}.`);
  }

  return row;
}

function getVisiblePurchaseFolios() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getByRole('link').textContent?.trim());
}

async function openActionsMenu(
  user: ReturnType<typeof userEvent.setup>,
  folio = purchase.folio,
) {
  await user.click(
    within(getPurchaseRowByFolio(folio)).getByRole('button', {
      name: `Acciones de compra ${folio}`,
    }),
  );

  return await screen.findByRole('menu', {
    name: `Acciones de compra ${folio}`,
  });
}

async function clickRowAction(
  user: ReturnType<typeof userEvent.setup>,
  actionName: RegExp | string,
  folio = purchase.folio,
) {
  const menu = await openActionsMenu(user, folio);

  await user.click(
    within(menu).getByRole('menuitem', {
      name: actionName,
    }),
  );
}

beforeEach(() => {
  clearAuthenticatedSessionCache();
  routerMock.search = '';
});

describe('PurchasesPage — compatibilidad de navegación legacy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureApiMocks();
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  it('redirige purchaseId legacy hacia la ruta canónica sin abrir modal ni cargar detalle', async () => {
    routerMock.search = 'purchaseId=purchase-1';

    render(<PurchasesPage />);

    expect(await screen.findByText(purchase.folio)).toBeTruthy();
    expect(routerMock.replace).toHaveBeenCalledWith('/purchases/purchase-1');
    expect(
      screen.getByRole('link', { name: 'OC-0001' }).getAttribute('href'),
    ).toBe('/purchases/purchase-1');
    expect(
      screen.queryByRole('heading', { name: 'Compra OC-0001' }),
    ).toBeNull();
    expect(
      vi.mocked(api.get).mock.calls.some(
        ([url]) =>
          String(url) === '/purchases/purchase-1/inventory-movements' ||
          String(url) === '/purchase-receipts/purchase/purchase-1',
      ),
    ).toBe(false);
  });

  it('ignora purchaseId vacío y mantiene la lista usable', async () => {
    routerMock.search = 'purchaseId=';

    render(<PurchasesPage />);

    expect(await screen.findByText(purchase.folio)).toBeTruthy();
    expect(routerMock.replace).not.toHaveBeenCalled();
    expect(
      screen.queryByRole('heading', { name: 'Compra OC-0001' }),
    ).toBeNull();
  });
});

describe('PurchasesPage — normalización de lista', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureApiMocks();
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  it('presenta contexto, contador filtrado y progreso accesible sin cambiar el enlace al detalle', async () => {
    const user = userEvent.setup();
    configureApiMocks([purchase, partialPurchase]);
    render(<PurchasesPage />);

    await screen.findByText(purchase.folio);
    expect(screen.getByRole('heading', { name: 'Compras', level: 1 })).toBeTruthy();
    expect(screen.getByText('2 de 2 órdenes')).toBeTruthy();
    const progress = screen.getByRole('progressbar', {
      name: `Unidades recibidas de ${purchase.folio}`,
    });
    expect(progress.getAttribute('max')).toBe('10');
    expect(progress.getAttribute('value')).toBe('4');
    expect(within(screen.getByRole('link', { name: purchase.folio }).closest('td')!)
      .getByText('Recepción: 4 de 10 uds.')).toBeTruthy();
    expect(screen.getByRole('link', { name: purchase.folio }).getAttribute('href'))
      .toBe('/purchases/purchase-1');

    await user.type(screen.getByRole('searchbox', { name: 'Buscar compras' }), 'OC-0002');
    expect(screen.getByText('1 de 2 órdenes')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByText('2 de 2 órdenes')).toBeTruthy();
  });

  it('permite abrir acciones con teclado y restaura el foco al cerrar con Escape', async () => {
    const user = userEvent.setup();
    render(<PurchasesPage />);
    const actions = await screen.findByRole('button', { name: 'Acciones de compra OC-0001' });
    actions.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menuitem', { name: 'Ver' })).toBe(document.activeElement);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(actions);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('busca por folio, proveedor, contacto, email, SKU y producto', async () => {
    const user = userEvent.setup();
    configureApiMocks([purchase, partialPurchase]);

    render(<PurchasesPage />);

    const initialFolio = await screen.findByText(purchase.folio);
    const initialRow = initialFolio.closest('tr');

    expect(initialRow).not.toBeNull();
    expect(
      within(initialRow as HTMLTableRowElement).getByText('$1,160.00'),
    ).toBeTruthy();

    const search = screen.getByRole('searchbox', {
      name: 'Buscar compras',
    });

    for (const term of [
      '  oc-0002  ',
      'CLÍNICA DEL DESIERTO',
      'maría torres',
      'compras@desierto.test',
      'rx-200',
      'REACTIVO ESPECIALIZADO',
    ]) {
      await user.clear(search);
      await user.type(search, term);
      expect(screen.getByText(partialPurchase.folio)).toBeTruthy();
      expect(screen.queryByText(purchase.folio)).toBeNull();
    }

    await user.clear(search);
    await user.type(search, 'sin coincidencias');
    expect(screen.getByText('No se encontraron compras')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByText(purchase.folio)).toBeTruthy();
  });

  it('renderiza las columnas reales y sus prioridades responsive', async () => {
    render(<PurchasesPage />);

    await screen.findByText(purchase.folio);

    expect(
      screen.getByRole('table', { name: 'Listado de compras' }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole('columnheader').map((header) =>
        header.textContent?.trim(),
      ),
    ).toEqual([
      'Folio',
      'Proveedor',
      'Fecha',
      'Partidas',
      'Recepción',
      'Total',
      'Estado',
      'Acciones',
    ]);
    expect(
      screen.getByRole('columnheader', { name: 'Folio' }).classList.contains(
        'hidden',
      ),
    ).toBe(false);
    expect(
      screen
        .getByRole('columnheader', { name: 'Proveedor' })
        .classList.contains('hidden'),
    ).toBe(false);
    expect(
      screen.getByRole('columnheader', { name: 'Fecha' }).classList.contains(
        'sm:table-cell',
      ),
    ).toBe(true);
    expect(
      screen
        .getByRole('columnheader', { name: 'Partidas' })
        .classList.contains('md:table-cell'),
    ).toBe(true);
    expect(
      screen
        .getByRole('columnheader', { name: 'Recepción' })
        .classList.contains('sm:table-cell'),
    ).toBe(true);
    expect(screen.getByText('$1,160.00')).toBeTruthy();
    expect(screen.getByText(/23 jul 2026/i)).toBeTruthy();
  });

  it('muestra el progreso agregado sin inferir cantidades desde el status', async () => {
    const confirmedNoReceipts = {
      ...purchase,
      receiptProgress: {
        orderedUnits: 10,
        receivedUnits: 0,
        pendingUnits: 10,
        orderedLines: 1,
        completedLines: 0,
      },
    };
    const partial = {
      ...partialPurchase,
      receiptProgress: {
        orderedUnits: 15,
        receivedUnits: 7,
        pendingUnits: 8,
        orderedLines: 3,
        completedLines: 1,
      },
    };
    const complete = {
      ...receivedPurchase,
      receiptProgress: {
        orderedUnits: 10,
        receivedUnits: 10,
        pendingUnits: 0,
        orderedLines: 1,
        completedLines: 1,
      },
    };

    configureApiMocks([
      confirmedNoReceipts,
      partial,
      complete,
      draftPurchase,
      cancelledPurchase,
    ]);

    render(<PurchasesPage />);

    await screen.findAllByText('OC-0001');

    expect(screen.getByText('0 / 1 partidas')).toBeTruthy();
    expect(screen.getByText('0 / 10 uds.')).toBeTruthy();
    expect(screen.getByText('1 / 3 partidas')).toBeTruthy();
    expect(screen.getByText('7 / 15 uds.')).toBeTruthy();
    expect(screen.getByText('1 / 1 partidas')).toBeTruthy();
    expect(screen.getByText('10 / 10 uds.')).toBeTruthy();
    expect(screen.getByText('Pendiente de aprobación')).toBeTruthy();
    expect(screen.getByText('No aplica')).toBeTruthy();
  });

  it('ordena por folio y total usando los valores reales de cada compra', async () => {
    const user = userEvent.setup();
    configureApiMocks([
      {
        ...purchase,
        id: 'purchase-sort-10',
        folio: 'OC-0010',
        total: 10,
        supplier: { ...supplier, name: 'Proveedor Zeta' },
      },
      {
        ...confirmedFilterPurchase,
        id: 'purchase-sort-2',
        folio: 'OC-0002',
        total: 200,
        supplier: { ...supplier, name: 'Proveedor Alfa' },
      },
      {
        ...partialPurchase,
        id: 'purchase-sort-1',
        folio: 'OC-0001',
        total: 100,
        supplier: { ...partialPurchase.supplier, name: 'Proveedor Medio' },
      },
    ]);

    render(<PurchasesPage />);
    await screen.findByText('OC-0010');

    const folioHeader = screen.getByRole('columnheader', {
      name: 'Folio',
    });
    await user.click(
      within(folioHeader).getByRole('button', { name: 'Folio' }),
    );

    expect(folioHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(
      screen.getAllByRole('row').slice(1).map((row) =>
        within(row).getByRole('link').textContent?.trim(),
      ),
    ).toEqual(['OC-0001', 'OC-0002', 'OC-0010']);

    await user.click(screen.getByRole('button', { name: 'Total' }));
    expect(
      screen.getAllByRole('row').slice(1).map((row) =>
        within(row).getByRole('link').textContent?.trim(),
      ),
    ).toEqual(['OC-0010', 'OC-0001', 'OC-0002']);
  });

  it('pagina 30 compras y reinicia página al cambiar filtro, tamaño y búsqueda', async () => {
    const user = userEvent.setup();
    configureApiMocks(buildPurchaseList(30));

    render(<PurchasesPage />);
    await screen.findByText('OC-0001');

    expect(screen.getByText('Mostrando 1-25 de 30')).toBeTruthy();
    expect(screen.queryByText('OC-0026')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Mostrando 26-30 de 30')).toBeTruthy();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Estado' }),
      'CONFIRMED',
    );
    expect(screen.getByText('Mostrando 1-15 de 15')).toBeTruthy();
    expect(screen.getByText('OC-0002')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByText('Mostrando 1-25 de 30')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filas por página' }),
      '10',
    );
    expect(screen.getByText('Mostrando 1-10 de 30')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar compras' }),
      'OC-0030',
    );
    expect(screen.getByText('Mostrando 1-1 de 1')).toBeTruthy();
    expect(screen.getByText('OC-0030')).toBeTruthy();
  });

  it('combina los cinco estados reales con el proveedor derivado y limpia filtros', async () => {
    const user = userEvent.setup();
    configureApiMocks([
      draftPurchase,
      confirmedFilterPurchase,
      partialPurchase,
      receivedPurchase,
      cancelledPurchase,
    ]);

    render(<PurchasesPage />);

    await screen.findByText(draftPurchase.folio);

    const status = screen.getByRole('combobox', { name: 'Estado' });
    const supplierFilter = screen.getByRole('combobox', {
      name: 'Proveedor',
    });

    for (const [value, label, folio, purchaseId] of [
      ['DRAFT', 'Borrador', draftPurchase.folio, draftPurchase.id],
      [
        'CONFIRMED',
        'Confirmada',
        confirmedFilterPurchase.folio,
        confirmedFilterPurchase.id,
      ],
      [
        'PARTIALLY_RECEIVED',
        'Parcialmente recibida',
        partialPurchase.folio,
        partialPurchase.id,
      ],
      ['RECEIVED', 'Recibida', receivedPurchase.folio, receivedPurchase.id],
      [
        'CANCELLED',
        'Cancelada',
        cancelledPurchase.folio,
        cancelledPurchase.id,
      ],
    ]) {
      expect(within(status).getByRole('option', { name: label })).toBeTruthy();
      await user.selectOptions(status, value);
      expect(
        screen.getByRole('link', { name: folio }).getAttribute('href'),
      ).toBe(`/purchases/${purchaseId}`);
      expect(
        screen.queryByRole('button', { name: 'Ver detalle' }),
      ).toBeNull();
    }

    expect(within(supplierFilter).getAllByRole('option')).toHaveLength(3);
    expect(
      within(supplierFilter).getByRole('option', {
        name: 'Todos los proveedores',
      }),
    ).toBeTruthy();

    await user.selectOptions(status, 'PARTIALLY_RECEIVED');
    await user.selectOptions(supplierFilter, 'supplier-2');
    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar compras' }),
      'reactivo',
    );

    expect(screen.getByText(partialPurchase.folio)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: partialPurchase.folio }).getAttribute(
        'href',
      ),
    ).toBe('/purchases/purchase-2');
    expect(
      screen.queryByRole('button', { name: 'Ver detalle' }),
    ).toBeNull();

    const search = screen.getByRole('searchbox', {
      name: 'Buscar compras',
    });
    await user.clear(search);
    await user.type(search, 'sin resultados');
    expect(screen.getByText('No se encontraron compras')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(screen.getByText(draftPurchase.folio)).toBeTruthy();
    expect(screen.getByText(confirmedFilterPurchase.folio)).toBeTruthy();
    expect(screen.getByText(partialPurchase.folio)).toBeTruthy();
    expect(screen.getByText(receivedPurchase.folio)).toBeTruthy();
    expect(screen.getByText(cancelledPurchase.folio)).toBeTruthy();
    expect(
      vi.mocked(api.get).mock.calls.filter(
        ([url]) => String(url) === '/suppliers',
      ),
    ).toHaveLength(1);
  });

  it('filtra fechas por día operativo de la empresa sin usar la zona horaria del navegador', async () => {
    const user = userEvent.setup();
    const hermosilloNightPurchase: Purchase = {
      ...purchase,
      id: 'purchase-tz-night',
      folio: 'OC-TZ-31',
      createdAt: '2026-09-01T02:00:00.000Z',
    };
    const hermosilloDayPurchase: Purchase = {
      ...partialPurchase,
      id: 'purchase-tz-day',
      folio: 'OC-TZ-01',
      createdAt: '2026-09-01T20:00:00.000Z',
    };

    configureApiMocks([
      hermosilloNightPurchase,
      hermosilloDayPurchase,
      receivedPurchase,
    ]);

    render(<PurchasesPage />);

    await screen.findByText('OC-TZ-31');
    expect(screen.getByText(/31 ago 2026/i)).toBeTruthy();
    expect(screen.getByText(/01 sep 2026/i)).toBeTruthy();

    await user.type(screen.getByLabelText('Desde'), '2026-08-31');
    await user.type(screen.getByLabelText('Hasta'), '2026-08-31');

    expect(screen.getByRole('link', { name: 'OC-TZ-31' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'OC-TZ-01' })).toBeNull();
    expect(screen.queryByRole('link', { name: receivedPurchase.folio })).toBeNull();

    await user.clear(screen.getByLabelText('Hasta'));
    await user.type(screen.getByLabelText('Hasta'), '2026-09-01');

    expect(screen.getByRole('link', { name: 'OC-TZ-31' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'OC-TZ-01' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: receivedPurchase.folio })).toBeNull();

    await user.clear(screen.getByLabelText('Desde'));

    expect(screen.getByRole('link', { name: receivedPurchase.folio })).toBeTruthy();
  });

  it('combina rango de fechas con búsqueda, estado, proveedor y reinicia paginación', async () => {
    const user = userEvent.setup();
    const paginatedPurchases = buildPurchaseList(30);

    configureApiMocks(paginatedPurchases);

    render(<PurchasesPage />);

    await screen.findByText('OC-0001');
    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Mostrando 26-30 de 30')).toBeTruthy();

    await user.type(screen.getByLabelText('Desde'), '2026-07-10');
    await user.type(screen.getByLabelText('Hasta'), '2026-07-12');

    expect(screen.getByText('Mostrando 1-3 de 3')).toBeTruthy();
    expect(getVisiblePurchaseFolios()).toEqual([
      'OC-0010',
      'OC-0011',
      'OC-0012',
    ]);

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Estado' }),
      'CONFIRMED',
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Proveedor' }),
      'supplier-2',
    );
    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar compras' }),
      'OC-0012',
    );

    expect(getVisiblePurchaseFolios()).toEqual(['OC-0012']);

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

    expect(screen.getByText('Mostrando 1-25 de 30')).toBeTruthy();
    expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe('');
  });

  it('mantiene otros filtros y no aplica el rango cuando Desde es posterior a Hasta', async () => {
    const user = userEvent.setup();

    configureApiMocks([purchase, partialPurchase, receivedPurchase]);

    render(<PurchasesPage />);

    await screen.findByText(purchase.folio);
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Estado' }),
      'CONFIRMED',
    );
    await user.type(screen.getByLabelText('Desde'), '2026-09-02');
    await user.type(screen.getByLabelText('Hasta'), '2026-09-01');

    expect(
      screen.getAllByText('La fecha Desde no puede ser posterior a Hasta.'),
    ).toHaveLength(1);
    expect((screen.getByLabelText('Desde') as HTMLInputElement).value).toBe(
      '2026-09-02',
    );
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).value).toBe(
      '2026-09-01',
    );
    expect(screen.getByRole('link', { name: purchase.folio })).toBeTruthy();
    expect(
      screen.queryByRole('link', { name: partialPurchase.folio }),
    ).toBeNull();
  });

  it('mantiene la lista usable y deshabilita fechas si auth/me falla o trae timezone inválido', async () => {
    configureApiMocks([purchase], {
      authMeError: new Error('Sesión no disponible'),
    });

    const { unmount } = render(<PurchasesPage />);

    await screen.findByText(purchase.folio);
    expect((screen.getByLabelText('Desde') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(
      screen.getByText('No fue posible habilitar el filtro por fecha.'),
    ).toBeTruthy();
    expect(screen.getByText('Fecha no disponible')).toBeTruthy();

    unmount();
    vi.clearAllMocks();
    configureApiMocks([purchase], {
      companyTimezone: 'Zona/Invalida',
    });

    render(<PurchasesPage />);

    await screen.findByText(purchase.folio);
    expect((screen.getByLabelText('Desde') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect((screen.getByLabelText('Hasta') as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(
      screen.getByText('No fue posible habilitar el filtro por fecha.'),
    ).toBeTruthy();
  });

  it('muestra el error de carga y permite reintentar con recuperación', async () => {
    const user = userEvent.setup();
    let purchaseRequests = 0;

    vi.mocked(api.get).mockImplementation(async (url) => {
      const endpoint = String(url);

      if (endpoint === '/purchase-receipts/capabilities') return { data: { authority: 'LEGACY' } } as never;

    if (endpoint === '/auth/me') {
        return {
          data: { companyTimezone: 'America/Hermosillo' },
        } as never;
      }

      if (endpoint === '/purchases') {
        purchaseRequests += 1;

        if (purchaseRequests === 1) {
          throw new Error('Sin conexión');
        }

        return { data: [purchase] } as never;
      }

      if (endpoint === '/suppliers') {
        return { data: [supplier] } as never;
      }

      if (endpoint === '/products') {
        return { data: [product] } as never;
      }

      throw new Error(`Solicitud GET no configurada: ${endpoint}`);
    });

    render(<PurchasesPage />);

    expect(
      await screen.findByText(
        'No fue posible cargar la información de compras.',
      ),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText(purchase.folio)).toBeTruthy();
    expect(purchaseRequests).toBe(2);
  });

  it('muestra un estado vacío útil cuando no hay compras', async () => {
    configureApiMocks([]);

    render(<PurchasesPage />);

    expect(
      await screen.findByText('No hay compras registradas'),
    ).toBeTruthy();
    expect(
      screen.getByText('Comienza creando tu primera orden de compra.'),
    ).toBeTruthy();
  });

  it('conserva visible una compra histórica de proveedor inactivo', async () => {
    configureApiMocks([partialPurchase]);

    render(<PurchasesPage />);

    const folio = await screen.findByText(partialPurchase.folio);
    const row = folio.closest('tr');

    expect(row).not.toBeNull();
    expect(
      within(row as HTMLTableRowElement).getByText(
        partialPurchase.supplier.name,
      ),
    ).toBeTruthy();
  });

  it.each([
    {
      action: 'Aprobar',
      dialog: 'Aprobar compra',
      endpoint: '/purchases/purchase-1/approve',
      error: 'No fue posible aprobar la compra.',
    },
    {
      action: 'Cancelar',
      dialog: 'Cancelar compra',
      endpoint: '/purchases/purchase-1/cancel',
      error: 'No fue posible cancelar la compra.',
    },
  ])(
    'muestra un error estructurado cuando falla $action',
    async ({ action, dialog, endpoint, error }) => {
      const user = userEvent.setup();
      configureApiMocks([draftPurchase]);
      vi.mocked(api.patch).mockRejectedValue(new Error('Error del servidor'));

      render(<PurchasesPage />);

      await screen.findByText(draftPurchase.folio);
      if (action === 'Cancelar') {
        await clickRowAction(user, /cancelar/i);
      } else {
        await user.click(screen.getByRole('button', { name: action }));
      }

      const dialogHeading = await screen.findByRole('heading', {
        name: dialog,
      });
      const dialogElement = dialogHeading.parentElement?.parentElement;

      expect(dialogElement).not.toBeNull();

      await user.click(
        within(dialogElement as HTMLElement).getByRole('button', {
          name: dialog === 'Aprobar compra' ? 'Aprobar' : 'Cancelar compra',
        }),
      );

      expect(await screen.findByText(error)).toBeTruthy();
      expect(api.patch).toHaveBeenCalledWith(endpoint);
      expect(screen.getAllByText(draftPurchase.folio).length).toBeGreaterThan(
        0,
      );
    },
  );

  it('muestra el proveedor y total antes de autorizar una aprobación', async () => {
    const user = userEvent.setup();
    configureApiMocks([draftPurchase]);
    render(<PurchasesPage />);

    await screen.findByText(draftPurchase.folio);
    await user.click(screen.getByRole('button', { name: 'Aprobar' }));
    const summary = screen.getByRole('group', { name: 'Resumen de aprobación' });
    expect(within(summary).getByText(/Proveedor médico/)).toBeTruthy();
    expect(within(summary).getByText(/\$1,160\.00/)).toBeTruthy();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('muestra un error estructurado cuando falla el PDF', async () => {
    const user = userEvent.setup();
    const defaultGet = vi.mocked(api.get).getMockImplementation();

    vi.mocked(api.get).mockImplementation(async (url) => {
      if (String(url) === '/purchases/purchase-1/pdf') {
        throw new Error('PDF no disponible');
      }

      return await defaultGet!(url);
    });

    render(<PurchasesPage />);

    await screen.findByText(purchase.folio);
    await clickRowAction(user, /descargar pdf/i);

    expect(
      await screen.findByText('No fue posible descargar el PDF.'),
    ).toBeTruthy();
  });
});

describe('PurchasesPage — recepciones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(
      globalThis.crypto,
      'randomUUID',
    ).mockReturnValue(receiptIdempotencyKey);

    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    configureApiMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
    cleanup();
  });

  it.each([
    ['DRAFT', false],
    ['CONFIRMED', true],
    ['PARTIALLY_RECEIVED', true],
    ['RECEIVED', false],
    ['CANCELLED', false],
  ] as const)(
    'muestra la acción directa sólo para el estado %s',
    async (status, canReceive) => {
      const user = userEvent.setup();
      configureApiMocks([
        {
          ...purchase,
          status,
        },
      ]);

      render(<PurchasesPage />);
      await screen.findByText('OC-0001');

      const receiveButton = screen.queryByRole('button', {
        name: 'Recibir',
      });

      if (canReceive) {
        expect(receiveButton).not.toBeNull();
        expect(
          (receiveButton as HTMLButtonElement).disabled,
        ).toBe(false);
      } else {
        expect(receiveButton).toBeNull();
      }

      if (canReceive) {
        await user.click(receiveButton as HTMLButtonElement);
        expect(
          await screen.findByRole('heading', {
            name: /registrar recepción.*OC-0001/i,
          }),
        ).toBeTruthy();
      }
    },
  );

  it.each(['ADMIN', 'MANAGER', 'WAREHOUSE', 'SALES'] as const)(
    'conserva el acceso a Recibir para el rol %s',
    async (role) => {
      clearAuthenticatedSessionCache();
      configureApiMocks([purchase], { role });
      render(<PurchasesPage />);
      if (role === 'SALES') {
        await screen.findByRole('heading', { name: 'Sin permisos' });
        expect(screen.queryByText('OC-0001')).toBeNull();
      } else {
        await screen.findByText('OC-0001');
      }

      const button = screen.queryByRole('button', { name: 'Recibir' });
      if (role === 'SALES') {
        expect(button).toBeNull();
      } else {
        expect(button).not.toBeNull();
        const descriptionId = button!.getAttribute('aria-describedby');
        expect(document.getElementById(descriptionId!)?.textContent)
          .toBe('Registrar recepción de la compra OC-0001');
      }
      expect(api.post).not.toHaveBeenCalled();
    },
  );

  it('prepara la recepción directa sin abrir el detalle de compra', async () => {
    const user = userEvent.setup();

    render(<PurchasesPage />);
    await screen.findByText('OC-0001');

    await user.click(
      screen.getByRole('button', {
        name: 'Recibir',
      }),
    );

    expect(
      await screen.findByRole('heading', {
        name: /registrar recepción.*OC-0001/i,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', {
        name: 'Compra OC-0001',
      }),
    ).toBeNull();
    expect(api.get).toHaveBeenCalledWith(
      '/purchases/purchase-1/inventory-movements',
    );
    expect(api.get).toHaveBeenCalledWith(
      '/purchase-receipts/purchase/purchase-1',
    );
  });

  it('prepara la recepción directa para una compra parcialmente recibida', async () => {
    const user = userEvent.setup();
    const partial = {
      ...purchase,
      id: 'purchase-2',
      folio: 'OC-0002',
      status: 'PARTIALLY_RECEIVED' as const,
    };
    configureApiMocks([partial]);
    const defaultGet = vi.mocked(api.get).getMockImplementation();

    vi.mocked(api.get).mockImplementation(async (url) => {
      const endpoint = String(url);

      if (
        endpoint ===
        '/purchases/purchase-2/inventory-movements'
      ) {
        return { data: [] } as never;
      }

      if (
        endpoint ===
        '/purchase-receipts/purchase/purchase-2'
      ) {
        return { data: [] } as never;
      }

      return defaultGet!(url);
    });

    render(<PurchasesPage />);
    await screen.findByText('OC-0002');

    await user.click(
      screen.getByRole('button', {
        name: 'Recibir',
      }),
    );

    expect(
      await screen.findByRole('heading', {
        name: /registrar recepción.*OC-0002/i,
      }),
    ).toBeTruthy();
  });

  it('no abre la recepción directa mientras carga detalle e historial', async () => {
    const user = userEvent.setup();
    let resolveMovements: ((value: unknown) => void) | undefined;
    let resolveReceipts: ((value: unknown) => void) | undefined;
    const movementsPromise = new Promise((resolve) => {
      resolveMovements = resolve;
    });
    const receiptsPromise = new Promise((resolve) => {
      resolveReceipts = resolve;
    });
    const defaultGet = vi.mocked(api.get).getMockImplementation();

    vi.mocked(api.get).mockImplementation((url) => {
      const endpoint = String(url);

      if (
        endpoint ===
        '/purchases/purchase-1/inventory-movements'
      ) {
        return movementsPromise as never;
      }

      if (
        endpoint ===
        '/purchase-receipts/purchase/purchase-1'
      ) {
        return receiptsPromise as never;
      }

      return defaultGet!(url);
    });

    render(<PurchasesPage />);
    await screen.findByText('OC-0001');

    await user.click(
      screen.getByRole('button', {
        name: 'Recibir',
      }),
    );

    expect(
      screen.getByRole('button', { name: 'Preparando...' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', {
        name: /registrar recepción.*OC-0001/i,
      }),
    ).toBeNull();

    resolveMovements?.({ data: [] });
    resolveReceipts?.({ data: [previousReceipt] });

    expect(
      await screen.findByRole('heading', {
        name: /registrar recepción.*OC-0001/i,
      }),
    ).toBeTruthy();
  });

  it('bloquea intentos repetidos y acciones de otra fila durante la preparación', async () => {
    const user = userEvent.setup();
    let resolveMovements: ((value: unknown) => void) | undefined;
    let resolveReceipts: ((value: unknown) => void) | undefined;
    const movementsPromise = new Promise((resolve) => {
      resolveMovements = resolve;
    });
    const receiptsPromise = new Promise((resolve) => {
      resolveReceipts = resolve;
    });
    configureApiMocks([purchase, partialPurchase]);
    const defaultGet = vi.mocked(api.get).getMockImplementation();

    vi.mocked(api.get).mockImplementation((url) => {
      const endpoint = String(url);

      if (
        endpoint ===
        '/purchases/purchase-1/inventory-movements'
      ) {
        return movementsPromise as never;
      }

      if (
        endpoint ===
        '/purchase-receipts/purchase/purchase-1'
      ) {
        return receiptsPromise as never;
      }

      return defaultGet!(url);
    });

    render(<PurchasesPage />);
    await screen.findByText('OC-0001');
    await screen.findByText('OC-0002');

    const receiveButtons = screen.getAllByRole('button', {
      name: 'Recibir',
    });

    await user.click(receiveButtons[0]);

    await waitFor(() => {
      expect(
        (receiveButtons[0] as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(
        (receiveButtons[1] as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    await user.click(receiveButtons[1]);

    expect(api.get).not.toHaveBeenCalledWith(
      '/purchases/purchase-2/inventory-movements',
    );
    expect(api.get).not.toHaveBeenCalledWith(
      '/purchase-receipts/purchase/purchase-2',
    );

    resolveMovements?.({ data: [] });
    resolveReceipts?.({ data: [previousReceipt] });

    expect(
      await screen.findByRole('heading', {
        name: /registrar recepción.*OC-0001/i,
      }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', {
        name: /registrar recepción.*OC-0002/i,
      }),
    ).toBeNull();
  });

  it('bloquea la recepción directa si falla el historial y permite reintentar', async () => {
    const user = userEvent.setup();
    let receiptRequests = 0;
    const defaultGet = vi.mocked(api.get).getMockImplementation();

    vi.mocked(api.get).mockImplementation(async (url) => {
      const endpoint = String(url);

      if (
        endpoint ===
        '/purchase-receipts/purchase/purchase-1'
      ) {
        receiptRequests += 1;

        if (receiptRequests === 1) {
          throw new Error('Error temporal');
        }

        return { data: [previousReceipt] } as never;
      }

      return defaultGet!(url);
    });

    render(<PurchasesPage />);
    await screen.findByText('OC-0001');
    await user.click(
      screen.getByRole('button', {
        name: 'Recibir',
      }),
    );

    expect(
      await screen.findByText(
        'No pudimos verificar las recepciones anteriores. Vuelve a intentarlo antes de registrar una nueva recepción.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', {
        name: /registrar recepción.*OC-0001/i,
      }),
    ).toBeNull();

    await user.click(
      screen.getByRole('button', {
        name: 'Reintentar recepción',
      }),
    );

    expect(
      await screen.findByRole('heading', {
        name: /registrar recepción.*OC-0001/i,
      }),
    ).toBeTruthy();
    expect(receiptRequests).toBe(2);
  });

  it('no abre la recepción directa si falla la carga del detalle', async () => {
    const user = userEvent.setup();
    const defaultGet = vi.mocked(api.get).getMockImplementation();

    vi.mocked(api.get).mockImplementation(async (url) => {
      if (
        String(url) ===
        '/purchases/purchase-1/inventory-movements'
      ) {
        throw new Error('Error temporal');
      }

      return defaultGet!(url);
    });

    render(<PurchasesPage />);
    await screen.findByText('OC-0001');
    await user.click(
      screen.getByRole('button', {
        name: 'Recibir',
      }),
    );

    expect(
      await screen.findByText(
        'No pudimos preparar el detalle de la compra. Vuelve a intentarlo antes de registrar una nueva recepción.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', {
        name: /registrar recepción.*OC-0001/i,
      }),
    ).toBeNull();
  });

  it('deshabilita Registrar recepción mientras carga el historial', async () => {
    const user = userEvent.setup();
    let resolveReceipts: ((value: unknown) => void) | undefined;
    const receiptsPromise = new Promise((resolve) => {
      resolveReceipts = resolve;
    });
    const defaultGet = vi.mocked(api.get).getMockImplementation();

    vi.mocked(api.get).mockImplementation((url) => {
      if (
        String(url) ===
        '/purchase-receipts/purchase/purchase-1'
      ) {
        return receiptsPromise as never;
      }

      return defaultGet!(url);
    });

    render(<PurchasesPage />);
    await screen.findByText('OC-0001');

    const receiveButton = screen.getByRole('button', {
      name: 'Recibir',
    });

    await user.click(receiveButton);

    expect((receiveButton as HTMLButtonElement).disabled).toBe(true);
    expect(
      await screen.findByRole('button', { name: 'Preparando...' }),
    ).toBeTruthy();

    resolveReceipts?.({ data: [previousReceipt] });

    expect(
      await screen.findByRole('heading', {
        name: /registrar recepción.*OC-0001/i,
      }),
    ).toBeTruthy();
  });

  it('bloquea la recepción si falla el historial y permite reintentar', async () => {
    const user = userEvent.setup();
    let receiptRequests = 0;
    const defaultGet = vi.mocked(api.get).getMockImplementation();

    vi.mocked(api.get).mockImplementation(async (url) => {
      if (
        String(url) ===
        '/purchase-receipts/purchase/purchase-1'
      ) {
        receiptRequests += 1;

        if (receiptRequests === 1) {
          throw new Error('Error temporal');
        }

        return { data: [previousReceipt] } as never;
      }

      return defaultGet!(url);
    });

    render(<PurchasesPage />);
    await screen.findByText('OC-0001');

    const receiveButton = screen.getByRole('button', {
      name: 'Recibir',
    });
    await user.click(receiveButton);

    expect(
      await screen.findByText(
        'No pudimos verificar las recepciones anteriores. Vuelve a intentarlo antes de registrar una nueva recepción.',
      ),
    ).toBeTruthy();

    await user.click(
      screen.getByRole('button', {
        name: 'Reintentar recepción',
      }),
    );

    await waitFor(() => {
      expect(receiptRequests).toBe(2);
    });

    expect(
      await screen.findByRole('heading', {
        name: /registrar recepción.*OC-0001/i,
      }),
    ).toBeTruthy();
  });

it('calcula la cantidad recibida y pendiente al abrir el formulario', async () => {
  const user = userEvent.setup();

  render(<PurchasesPage />);

  expect(
    await screen.findByText('OC-0001'),
  ).toBeTruthy();

  await user.click(
    screen.getByRole('button', {
      name: /recibir/i,
    }),
  );

  expect(
    await screen.findByRole('heading', {
      name: /registrar recepci[oó]n.*OC-0001/i,
    }),
  ).toBeTruthy();

  const receiptDesktop = screen.getByTestId('receipt-desktop-items');
  const productSku = within(receiptDesktop).getByText('MED-001');
  const productRow = productSku.closest('tr');

  expect(productRow).not.toBeNull();

  const row = within(
    productRow as HTMLTableRowElement,
  );

  expect(row.getByText('10')).toBeTruthy();
  expect(row.getByText('4')).toBeTruthy();
  expect(row.getByText('6')).toBeTruthy();

  const quantityInput = within(receiptDesktop).getByRole(
    'spinbutton',
    {
      name: /cantidad recibida de producto médico/i,
    },
  );

  expect(quantityInput.getAttribute('min')).toBe('1');
  expect(quantityInput.getAttribute('max')).toBe('6');
});

  it('muestra progreso por partida en cero cuando no hay recepciones', async () => {
    const user = userEvent.setup();
    const noReceiptPurchase = {
      ...purchase,
      receiptProgress: {
        orderedUnits: 10,
        receivedUnits: 0,
        pendingUnits: 10,
        orderedLines: 1,
        completedLines: 0,
      },
    };

    configureApiMocks([noReceiptPurchase]);
    const defaultGet = vi.mocked(api.get).getMockImplementation();

  vi.mocked(api.get).mockImplementation(async (url) => {
    if (
      String(url) ===
      '/purchase-receipts/purchase/purchase-1'
    ) {
      return { data: [] } as never;
    }

    return defaultGet!(url);
  });

  render(<PurchasesPage />);
  await screen.findByText('OC-0001');

  await user.click(
    screen.getByRole('button', {
      name: 'Recibir',
    }),
  );

  await screen.findByRole('heading', {
    name: /registrar recepci[oó]n.*OC-0001/i,
  });

  const receiptDesktop = screen.getByTestId('receipt-desktop-items');
  const itemTable = within(receiptDesktop).getByText('Producto').closest('table');

  expect(itemTable).not.toBeNull();

  const itemRow = within(itemTable as HTMLTableElement).getAllByRole('row')[1];
  const itemCells = within(itemRow).getAllByRole('cell');

  expect(itemCells[1].textContent).toBe('10');
  expect(itemCells[2].textContent).toBe('0');
  expect(itemCells[3].textContent).toBe('10');
});

it('mantiene el progreso por purchaseItemId con múltiples recepciones y productos repetidos', async () => {
  const user = userEvent.setup();
  const multiLinePurchase = {
    ...purchase,
    items: [
      purchase.items[0],
      {
        ...purchase.items[0],
        id: 'purchase-item-2',
        quantity: 5,
        subtotal: 500,
      },
    ],
  };
  const secondReceipt = {
    ...previousReceipt,
    id: 'receipt-2',
    items: [
      {
        ...previousReceipt.items[0],
        id: 'receipt-item-2',
        quantityReceived: 1,
      },
      {
        ...previousReceipt.items[0],
        id: 'receipt-item-3',
        purchaseItemId: 'purchase-item-2',
        quantityReceived: 5,
      },
    ],
  };
  configureApiMocks([multiLinePurchase]);
  const defaultGet = vi.mocked(api.get).getMockImplementation();

  vi.mocked(api.get).mockImplementation(async (url) => {
    if (
      String(url) ===
      '/purchase-receipts/purchase/purchase-1'
    ) {
      return { data: [previousReceipt, secondReceipt] } as never;
    }

    return defaultGet!(url);
  });

  render(<PurchasesPage />);
  await screen.findByText('OC-0001');

  await user.click(
    screen.getByRole('button', {
      name: 'Recibir',
    }),
  );

  await screen.findByRole('heading', {
    name: /registrar recepci[oó]n.*OC-0001/i,
  });

  const receiptDesktop = screen.getByTestId('receipt-desktop-items');
  const itemTable = within(receiptDesktop).getByText('Producto').closest('table');
  expect(itemTable).not.toBeNull();

  const itemRows = within(itemTable as HTMLTableElement)
    .getAllByRole('row')
    .slice(1);
  expect(itemRows).toHaveLength(1);

  const firstItemCells = within(itemRows[0]).getAllByRole('cell');

  expect(firstItemCells[1].textContent).toBe('10');
  expect(firstItemCells[2].textContent).toBe('5');
  expect(firstItemCells[3].textContent).toBe('5');
});

it('muestra un error cuando no se captura ninguna cantidad', async () => {
  const user = userEvent.setup();

  render(<PurchasesPage />);

  await screen.findByText('OC-0001');

  await user.click(
    screen.getByRole('button', {
      name: /recibir/i,
    }),
  );

  await screen.findByRole('heading', {
    name: /registrar recepci[oó]n.*OC-0001/i,
  });

  await user.click(
    getReceiptSubmitButton(),
  );

  const alert = (await screen.findAllByRole('alert')).at(-1)!;

  expect(alert.textContent).toContain(
    'Captura la cantidad recibida de al menos un producto.',
  );

  expect(api.post).not.toHaveBeenCalled();
});

it('rechaza una cantidad mayor que la pendiente', async () => {
  const user = userEvent.setup();

  render(<PurchasesPage />);

  await screen.findByText('OC-0001');

  await user.click(
    screen.getByRole('button', {
      name: /recibir/i,
    }),
  );

  await screen.findByRole('heading', {
    name: /registrar recepci[oó]n.*OC-0001/i,
  });

  const receiptDesktop = screen.getByTestId('receipt-desktop-items');
  const quantityInput = within(receiptDesktop).getByRole(
    'spinbutton',
    {
      name: /cantidad recibida de producto médico/i,
    },
  );

  await user.type(quantityInput, '7');

  await user.click(
    getReceiptSubmitButton(),
  );

  const alert = (await screen.findAllByRole('alert')).at(-1)!;

  expect(alert.textContent).toContain(
    'La cantidad de Producto médico debe ser un entero entre 1 y 6.',
  );

  expect(api.post).not.toHaveBeenCalled();
});

it('rechaza una fecha de caducidad sin número de lote', async () => {
  const user = userEvent.setup();

  render(<PurchasesPage />);

  await screen.findByText('OC-0001');

  await user.click(
    screen.getByRole('button', {
      name: /recibir/i,
    }),
  );

  await screen.findByRole('heading', {
    name: /registrar recepci[oó]n.*OC-0001/i,
  });

  const receiptDesktop = screen.getByTestId('receipt-desktop-items');
  const quantityInput = within(receiptDesktop).getByRole(
    'spinbutton',
    {
      name: /cantidad recibida de producto médico/i,
    },
  );

  const expirationInput = within(receiptDesktop).getByLabelText(
    /caducidad de producto médico/i,
  );

  await user.type(quantityInput, '2');
  await user.type(expirationInput, '2028-12-31');

  await user.click(
    getReceiptSubmitButton(),
  );

  const alert = (await screen.findAllByRole('alert')).at(-1)!;

  expect(alert.textContent).toContain(
    'Captura el número de lote de Producto médico para registrar su caducidad.',
  );

  expect(api.post).not.toHaveBeenCalled();
});

it('envía correctamente la recepción al backend', async () => {
  const user = userEvent.setup();

  vi.mocked(api.post).mockResolvedValue({
    data: {
      id: 'receipt-123',
      folio: 'REC-000123',
    },
  } as never);

  render(<PurchasesPage />);

  await screen.findByText('OC-0001');

  await user.click(
    screen.getByRole('button', {
      name: /recibir/i,
    }),
  );

  await screen.findByRole('heading', {
    name: /registrar recepci[oó]n.*OC-0001/i,
  });

  const receiptDesktop = screen.getByTestId('receipt-desktop-items');
  const quantityInput = within(receiptDesktop).getByRole(
    'spinbutton',
    {
      name: /cantidad recibida de producto médico/i,
    },
  );

  const lotInput = within(receiptDesktop).getByLabelText(
    /lote de producto médico/i,
  );

  const expirationInput = within(receiptDesktop).getByLabelText(
    /caducidad de producto médico/i,
  );

  const notesInput = screen.getByLabelText(/notas/i);

  await user.type(quantityInput, '2');
  await user.type(lotInput, 'LOTE-002');
  await user.type(expirationInput, '2029-06-30');
  await user.type(
    notesInput,
    'Recepción registrada desde pruebas',
  );

  await user.click(
    getReceiptSubmitButton(),
  );

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  expect(api.post).toHaveBeenCalledWith(
    '/purchase-receipts',
    {
      purchaseId: 'purchase-1',
      notes: 'Recepción registrada desde pruebas',
      items: [
        {
          purchaseItemId: 'purchase-item-1',
          quantityReceived: 2,
          lotNumber: 'LOTE-002',
          expirationDate: '2029-06-30',
        },
      ],
    },
    {
      headers: {
        'Idempotency-Key':
          receiptIdempotencyKey,
      },
    },
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Recepción registrada correctamente',
    }),
  ).toBeTruthy();
  expect(screen.getByText('REC-000123')).toBeTruthy();
  const successHeading = screen.getByRole('heading', {
    name: 'Recepción registrada correctamente',
  });
  const successModal = successHeading.parentElement?.parentElement;

  expect(successModal).not.toBeNull();
  expect(
    within(successModal as HTMLElement).queryByRole('button', {
      name: /^registrar recepción$/i,
    }),
  ).toBeNull();
  expect(api.post).toHaveBeenCalledTimes(1);

  await user.click(
    screen.getByRole('button', {
      name: 'Ver recepción',
    }),
  );

  expect(routerMock.push).toHaveBeenCalledWith(
    '/purchase-receipts/receipt-123',
  );
});

it('refresca compra e historial, cierra el éxito y abre un intento fresco', async () => {
  const user = userEvent.setup();

  const partialPurchase = {
    ...purchase,
    status: 'PARTIALLY_RECEIVED',
  };
  const createdReceipt = {
    ...previousReceipt,
    id: 'receipt-2',
    folio: 'REC-000002',
    items: [
      {
        ...previousReceipt.items[0],
        id: 'receipt-item-2',
        quantityReceived: 2,
      },
    ],
  };
  let receiptCreated = false;

  vi.mocked(api.get).mockImplementation(async (url) => {
    const endpoint = String(url);

    if (endpoint === '/purchase-receipts/capabilities') return { data: { authority: 'LEGACY' } } as never;

    if (endpoint === '/auth/me') {
      return {
        data: {
          id: 'user-1',
          companyId: 'company-1',
          email: 'admin@test.test',
          firstName: 'Admin',
          lastName: 'Test',
          role: 'ADMIN',
          companyTimezone: 'America/Hermosillo',
        },
      } as never;
    }

    if (endpoint === '/purchases') {
      return {
        data: [receiptCreated ? partialPurchase : purchase],
      } as never;
    }

    if (endpoint === '/suppliers') {
      return { data: [supplier] } as never;
    }

    if (endpoint === '/products') {
      return { data: [product] } as never;
    }

    if (
      endpoint === '/purchases/purchase-1/inventory-movements'
    ) {
      return { data: [] } as never;
    }

    if (
      endpoint === '/purchase-receipts/purchase/purchase-1'
    ) {
      return {
        data: receiptCreated
          ? [previousReceipt, createdReceipt]
          : [previousReceipt],
      } as never;
    }

    throw new Error(`Solicitud GET no configurada: ${endpoint}`);
  });

  vi.mocked(api.post).mockImplementation(async () => {
    receiptCreated = true;

    return {
      data: {
        id: 'receipt-2',
        folio: 'REC-000002',
      },
    } as never;
  });

  render(<PurchasesPage />);

  await screen.findByText('OC-0001');

  await user.click(
    screen.getByRole('button', {
      name: /recibir/i,
    }),
  );

  await screen.findByRole('heading', {
    name: /registrar recepci[oó]n.*OC-0001/i,
  });

  const receiptDesktop = screen.getByTestId('receipt-desktop-items');
  const quantityInput = within(receiptDesktop).getByRole(
    'spinbutton',
    {
      name: /cantidad recibida de producto médico/i,
    },
  );

  await user.type(quantityInput, '2');

  await user.click(
    getReceiptSubmitButton(),
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Recepción registrada correctamente',
    }),
  ).toBeTruthy();
  expect(
    screen.getByLabelText(
      'Estado de la compra: Parcialmente recibida',
    ),
  ).toBeTruthy();

  const purchasesRequests = vi
    .mocked(api.get)
    .mock.calls.filter(
      ([url]) => String(url) === '/purchases',
    );

  expect(purchasesRequests).toHaveLength(2);

  await user.click(screen.getByRole('button', { name: 'Cerrar' }));

  expect(
    screen.queryByRole('heading', {
      name: 'Recepción registrada correctamente',
    }),
  ).toBeNull();
  expect(screen.getByRole('heading', { name: 'Compras' })).toBeTruthy();

  await user.click(
    screen.getByRole('button', {
      name: /recibir/i,
    }),
  );

  const freshReceiptDesktop = screen.getByTestId('receipt-desktop-items');
  const freshQuantity = within(freshReceiptDesktop).getByRole('spinbutton', {
    name: 'Cantidad recibida de Producto médico',
  });

  expect((freshQuantity as HTMLInputElement).value).toBe('');
  expect(freshQuantity.getAttribute('max')).toBe('4');
  expect((screen.getByLabelText('Notas') as HTMLTextAreaElement).value).toBe(
    '',
  );
});

it('mantiene el handoff cuando la recepción completa la compra', async () => {
  const user = userEvent.setup();
  const receivedPurchase = {
    ...purchase,
    status: 'RECEIVED',
  };
  let purchaseRequests = 0;
  const defaultGet = vi.mocked(api.get).getMockImplementation();

  vi.mocked(api.get).mockImplementation(async (url) => {
    if (String(url) === '/purchases') {
      purchaseRequests += 1;

      return {
        data: [purchaseRequests > 1 ? receivedPurchase : purchase],
      } as never;
    }

    return await defaultGet!(url);
  });
  vi.mocked(api.post).mockResolvedValue({
    data: {
      id: 'receipt-full',
      folio: 'REC-FULL-001',
    },
  } as never);

  render(<PurchasesPage />);

  await screen.findByText('OC-0001');

  await user.click(
    screen.getByRole('button', {
      name: /recibir/i,
    }),
  );
  await waitFor(() => expect(getReceiptSubmitButton().hasAttribute('disabled')).toBe(false));
  const receiptDesktop = screen.getByTestId('receipt-desktop-items');
  await user.type(
    within(receiptDesktop).getByRole('spinbutton', {
      name: 'Cantidad recibida de Producto médico',
    }),
    '6',
  );
  await user.click(
    getReceiptSubmitButton(),
  );

  expect(
    await screen.findByRole('heading', {
      name: 'Recepción registrada correctamente',
    }),
  ).toBeTruthy();
  expect(screen.getByText('REC-FULL-001')).toBeTruthy();
  expect(
    screen.getByLabelText('Estado de la compra: Recibida'),
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Ver recepción' }),
  ).toBeTruthy();
});

it('muestra un error cuando el backend no puede registrar la recepción', async () => {
  const user = userEvent.setup();

  vi.mocked(api.post).mockRejectedValue(
    new Error('Error del servidor'),
  );

  render(<PurchasesPage />);

  await screen.findByText('OC-0001');

  await user.click(
    screen.getByRole('button', {
      name: /recibir/i,
    }),
  );

  const receiptHeading = await screen.findByRole(
    'heading',
    {
      name: /registrar recepci[oó]n.*OC-0001/i,
    },
  );

  const receiptModal =
    receiptHeading.parentElement?.parentElement;

  expect(receiptModal).not.toBeNull();

  const receiptScope = within(
    receiptModal as HTMLElement,
  );

  const receiptDesktop = receiptScope.getByTestId(
    'receipt-desktop-items',
  );

  await user.type(
    within(receiptDesktop).getByRole('spinbutton', {
      name: /cantidad recibida de producto médico/i,
    }),
    '2',
  );

  await user.click(
    receiptScope.getByRole('button', {
      name: /^registrar recepci[oó]n$/i,
    }),
  );

  const alert = await receiptScope.findByRole('alert');

  expect(alert.textContent).toContain(
    'No fue posible registrar la recepción.',
  );

  expect(api.post).toHaveBeenCalledTimes(1);

  expect(
    screen.queryByRole('heading', {
      name: /registrar recepci[oó]n.*OC-0001/i,
    }),
  ).not.toBeNull();

  const purchasesRequests = vi
    .mocked(api.get)
    .mock.calls.filter(
      ([url]) => String(url) === '/purchases',
    );

  expect(purchasesRequests).toHaveLength(1);
});

});

describe('PurchasesPage — formulario de compra', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    configureApiMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  it('crea una compra con el proveedor y producto seleccionados', async () => {
    const user = userEvent.setup();

    vi.mocked(api.post).mockResolvedValue({
      data: {
        id: 'purchase-2',
        folio: 'OC-0002',
      },
    } as never);

    render(<PurchasesPage />);

    await screen.findByText('OC-0001');

    await user.click(
      screen.getByRole('button', {
        name: /nueva compra/i,
      }),
    );

    const formHeading = await screen.findByRole('heading', {
      name: /nueva compra/i,
    });
    const formModal = formHeading.parentElement?.parentElement;

    expect(formModal).not.toBeNull();

    const supplierSelect =
      within(formModal as HTMLElement).getByRole('combobox', {
        name: /^proveedor$/i,
      });

    const quantityInput = within(formModal as HTMLElement).getByRole(
      'spinbutton',
      {
        name: /^cantidad$/i,
      },
    );

    await user.selectOptions(
      supplierSelect,
      'supplier-1',
    );

    await selectProduct(user);

    await user.clear(quantityInput);
    await user.type(quantityInput, '3');

    await user.click(
      screen.getByRole('button', {
        name: /agregar producto/i,
      }),
    );

    expect(
      screen.getAllByText('Producto médico').length,
    ).toBeGreaterThan(0);

    await user.click(
      screen.getByRole('button', {
        name: /crear compra/i,
      }),
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/purchases',
        {
          supplierId: 'supplier-1',
          items: [
            {
              productId: 'product-1',
              quantity: 3,
            },
          ],
        },
      );
    });
  });

  it('edita una compra en borrador y actualiza su cantidad', async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockImplementation(
      async (url) => {
        const endpoint = String(url);

        if (endpoint === '/purchase-receipts/capabilities') return { data: { authority: 'LEGACY' } } as never;

    if (endpoint === '/auth/me') {
          return {
            data: {
              id: 'user-1',
              companyId: 'company-1',
              email: 'admin@test.test',
              firstName: 'Admin',
              lastName: 'Test',
              role: 'ADMIN',
              companyTimezone: 'America/Hermosillo',
            },
          } as never;
        }

        if (endpoint === '/purchases') {
          return {
            data: [draftPurchase],
          } as never;
        }

        if (endpoint === '/suppliers') {
          return {
            data: [supplier],
          } as never;
        }

        if (endpoint === '/products') {
          return {
            data: [product],
          } as never;
        }

        throw new Error(
          `Solicitud GET no configurada: ${endpoint}`,
        );
      },
    );

    vi.mocked(api.patch).mockResolvedValue({
      data: {
        ...draftPurchase,
        items: [
          {
            ...draftPurchase.items[0],
            quantity: 5,
            subtotal: 500,
          },
        ],
      },
    } as never);

    render(<PurchasesPage />);

    await screen.findByText('OC-0001');

    await clickRowAction(user, /^editar$/i);

    expect(
      await screen.findByRole('heading', {
        name: /editar compra/i,
      }),
    ).toBeTruthy();

    const itemsTable = screen.getByTestId(
      'purchase-form-items-table',
    );
    const quantityInput = within(itemsTable).getByRole(
      'spinbutton',
      {
        name: /cantidad de producto médico/i,
      },
    );

    expect(
      (quantityInput as HTMLInputElement).value,
    ).toBe('10');

    await user.clear(quantityInput);
    await user.type(quantityInput, '5');

    await user.click(
      screen.getByRole('button', {
        name: /guardar cambios/i,
      }),
    );

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        '/purchases/purchase-1',
        {
          supplierId: 'supplier-1',
          items: [
            {
              productId: 'product-1',
              quantity: 5,
            },
          ],
        },
      );
    });

    const purchasesRequests = vi
      .mocked(api.get)
      .mock.calls.filter(
        ([url]) => String(url) === '/purchases',
      );

    expect(purchasesRequests).toHaveLength(2);
  });

  it('rechaza una cantidad inválida al agregar un producto', async () => {
  const user = userEvent.setup();

  render(<PurchasesPage />);

  await screen.findByText('OC-0001');

  await user.click(
    screen.getByRole('button', {
      name: /nueva compra/i,
    }),
  );

  const modalHeading =
    await screen.findByRole('heading', {
      name: /nueva compra/i,
    });

  const modal =
    modalHeading.parentElement?.parentElement;

  expect(modal).not.toBeNull();

  const modalScope = within(
    modal as HTMLElement,
  );

  const quantityInput =
    modalScope.getByRole('spinbutton', {
      name: /^cantidad$/i,
    });

  await selectProduct(user);

  fireEvent.change(quantityInput, {
    target: {
      value: '0',
    },
  });

  expect(
    (quantityInput as HTMLInputElement).value,
  ).toBe('0');

  await user.click(
    modalScope.getByRole('button', {
      name: /agregar producto/i,
    }),
  );

  const alert =
    await modalScope.findByRole('alert');

  expect(alert.textContent).toContain(
    'La cantidad debe ser un número entero mayor o igual a uno.',
  );

  expect(api.post).not.toHaveBeenCalled();

  expect(
    screen.queryByRole('spinbutton', {
      name: /cantidad de producto médico/i,
    }),
  ).toBeNull();
});
});

 describe('PurchasesPage — acciones de compra', () => {
  beforeEach(() => {
    clearAuthenticatedSessionCache();
    vi.clearAllMocks();

    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    configureApiMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  it.each([
    {
      purchaseForStatus: draftPurchase,
      primaryAction: /^aprobar$/i,
      hiddenPrimaryAction: /recibir/i,
      menuActions: [/^ver$/i, /^editar$/i, /descargar pdf/i, /cancelar/i],
      omittedMenuActions: [/ver detalle/i],
    },
    {
      purchaseForStatus: purchase,
      primaryAction: /recibir/i,
      hiddenPrimaryAction: /^aprobar$/i,
      menuActions: [/^ver$/i, /descargar pdf/i],
      omittedMenuActions: [/^editar$/i, /cancelar/i, /ver detalle/i],
    },
    {
      purchaseForStatus: partialPurchase,
      primaryAction: /recibir/i,
      hiddenPrimaryAction: /^aprobar$/i,
      menuActions: [/^ver$/i, /descargar pdf/i],
      omittedMenuActions: [/^editar$/i, /cancelar/i, /ver detalle/i],
    },
    {
      purchaseForStatus: receivedPurchase,
      primaryAction: null,
      hiddenPrimaryAction: /recibir|aprobar/i,
      menuActions: [/^ver$/i, /descargar pdf/i],
      omittedMenuActions: [/^editar$/i, /cancelar/i, /ver detalle/i],
    },
    {
      purchaseForStatus: cancelledPurchase,
      primaryAction: null,
      hiddenPrimaryAction: /recibir|aprobar/i,
      menuActions: [/^ver$/i, /descargar pdf/i],
      omittedMenuActions: [/^editar$/i, /cancelar/i, /ver detalle/i],
    },
  ])(
    'renderiza la matriz de acciones para $purchaseForStatus.status',
    async ({
      purchaseForStatus,
      primaryAction,
      hiddenPrimaryAction,
      menuActions,
      omittedMenuActions,
    }) => {
      const user = userEvent.setup();
      configureApiMocks([purchaseForStatus]);

      render(<PurchasesPage />);

      await screen.findByText(purchaseForStatus.folio);
      const row = getPurchaseRowByFolio(purchaseForStatus.folio);

      expect(
        within(row)
          .getByRole('link', { name: purchaseForStatus.folio })
          .getAttribute('href'),
      ).toBe(`/purchases/${purchaseForStatus.id}`);

      if (primaryAction) {
        expect(
          within(row).getByRole('button', {
            name: primaryAction,
          }),
        ).toBeTruthy();
      }

      expect(
        within(row).queryByRole('button', {
          name: hiddenPrimaryAction,
        }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: /ver detalle/i }),
      ).toBeNull();

      const menu = await openActionsMenu(user, purchaseForStatus.folio);

      for (const action of menuActions) {
        expect(
          within(menu).getByRole('menuitem', {
            name: action,
          }),
        ).toBeTruthy();
      }

      for (const action of omittedMenuActions) {
        expect(
          within(menu).queryByRole('menuitem', {
            name: action,
          }),
        ).toBeNull();
      }

      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(
          screen.queryByRole('menu', {
            name: `Acciones de compra ${purchaseForStatus.folio}`,
          }),
        ).toBeNull();
      });
    },
  );

  it('muestra Editar como acción primaria para WAREHOUSE y conserva Ver/PDF en el menú del borrador', async () => {
    const user = userEvent.setup();
    clearAuthenticatedSessionCache();
    configureApiMocks([draftPurchase], { role: 'WAREHOUSE' });

    render(<PurchasesPage />);

    await screen.findByText(draftPurchase.folio);
    const row = getPurchaseRowByFolio(draftPurchase.folio);

    expect(
      within(row).getByRole('button', { name: /^editar$/i }),
    ).toBeTruthy();
    expect(
      within(row).queryByRole('button', { name: /^aprobar$/i }),
    ).toBeNull();
    expect(
      within(row).queryByRole('button', { name: /recibir/i }),
    ).toBeNull();

    const menu = await openActionsMenu(user, draftPurchase.folio);

    expect(within(menu).getByRole('menuitem', { name: /^ver$/i })).toBeTruthy();
    expect(
      within(menu).getByRole('menuitem', { name: /descargar pdf/i }),
    ).toBeTruthy();
    expect(
      within(menu).queryByRole('menuitem', { name: /^editar$/i }),
    ).toBeNull();
    expect(
      within(menu).queryByRole('menuitem', { name: /^cancelar$/i }),
    ).toBeNull();
  });

  it('abre el detalle completo desde Ver sin ejecutar mutaciones', async () => {
    const user = userEvent.setup();
    render(<PurchasesPage />);
    await screen.findByRole('link', { name: 'OC-0001' });
    await clickRowAction(user, /^ver$/i);
    expect(routerMock.push).toHaveBeenCalledWith('/purchases/purchase-1');
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('aprueba una compra en borrador y recarga las compras', async () => {
    const user = userEvent.setup();

    vi.mocked(api.get).mockImplementation(
      async (url) => {
        const endpoint = String(url);

        if (endpoint === '/purchase-receipts/capabilities') return { data: { authority: 'LEGACY' } } as never;

    if (endpoint === '/auth/me') {
          return {
            data: {
              id: 'user-1',
              companyId: 'company-1',
              email: 'admin@test.test',
              firstName: 'Admin',
              lastName: 'Test',
              role: 'ADMIN',
              companyTimezone: 'America/Hermosillo',
            },
          } as never;
        }

        if (endpoint === '/purchases') {
          return {
            data: [draftPurchase],
          } as never;
        }

        if (endpoint === '/suppliers') {
          return {
            data: [supplier],
          } as never;
        }

        if (endpoint === '/products') {
          return {
            data: [product],
          } as never;
        }

        throw new Error(
          `Solicitud GET no configurada: ${endpoint}`,
        );
      },
    );

    vi.mocked(api.patch).mockResolvedValue({
      data: {
        ...draftPurchase,
        status: 'CONFIRMED',
      },
    } as never);

    render(<PurchasesPage />);

    await screen.findByText('OC-0001');

    await user.click(
      screen.getByRole('button', {
        name: /^aprobar$/i,
      }),
    );

    const dialogTitle = await screen.findByRole(
      'heading',
      {
        name: /aprobar compra/i,
      },
    );

    const dialog =
      dialogTitle.parentElement?.parentElement;

    expect(dialog).not.toBeNull();

    await user.click(
      within(dialog as HTMLElement).getByRole(
        'button',
        {
          name: /^aprobar$/i,
        },
      ),
    );

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        '/purchases/purchase-1/approve',
      );
    });

    const purchasesRequests = vi
      .mocked(api.get)
      .mock.calls.filter(
        ([url]) => String(url) === '/purchases',
      );

    expect(purchasesRequests).toHaveLength(2);

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: /aprobar compra/i,
        }),
      ).toBeNull();
    });
  });

  it('cancela una compra en borrador y recarga las compras', async () => {
  const user = userEvent.setup();

  vi.mocked(api.get).mockImplementation(
    async (url) => {
      const endpoint = String(url);

      if (endpoint === '/purchase-receipts/capabilities') return { data: { authority: 'LEGACY' } } as never;

    if (endpoint === '/auth/me') {
        return {
          data: {
            id: 'user-1',
            companyId: 'company-1',
            email: 'admin@test.test',
            firstName: 'Admin',
            lastName: 'Test',
            role: 'ADMIN',
            companyTimezone: 'America/Hermosillo',
          },
        } as never;
      }

      if (endpoint === '/purchases') {
        return {
          data: [draftPurchase],
        } as never;
      }

      if (endpoint === '/suppliers') {
        return {
          data: [supplier],
        } as never;
      }

      if (endpoint === '/products') {
        return {
          data: [product],
        } as never;
      }

      throw new Error(
        `Solicitud GET no configurada: ${endpoint}`,
      );
    },
  );

  vi.mocked(api.patch).mockResolvedValue({
    data: {
      ...draftPurchase,
      status: 'CANCELLED',
    },
  } as never);

  render(<PurchasesPage />);

  await screen.findByText('OC-0001');

  await clickRowAction(user, /cancelar/i);

  const dialogTitle = await screen.findByRole(
    'heading',
    {
      name: /cancelar compra/i,
    },
  );

  const dialog =
    dialogTitle.parentElement?.parentElement;

  expect(dialog).not.toBeNull();

  await user.click(
    within(dialog as HTMLElement).getByRole(
      'button',
      {
        name: /cancelar compra/i,
      },
    ),
  );

  await waitFor(() => {
    expect(api.patch).toHaveBeenCalledWith(
      '/purchases/purchase-1/cancel',
    );
  });

  const purchasesRequests = vi
    .mocked(api.get)
    .mock.calls.filter(
      ([url]) => String(url) === '/purchases',
    );

  expect(purchasesRequests).toHaveLength(2);

  await waitFor(() => {
    expect(
      screen.queryByRole('heading', {
        name: /cancelar compra/i,
      }),
    ).toBeNull();
  });
});

  it('descarga el PDF de una compra', async () => {
  const user = userEvent.setup();

  const pdfBlob = new Blob(
    ['contenido del PDF'],
    {
      type: 'application/pdf',
    },
  );

  const createObjectURLSpy = vi
    .spyOn(window.URL, 'createObjectURL')
    .mockReturnValue('blob:purchase-pdf');

  const revokeObjectURLSpy = vi
    .spyOn(window.URL, 'revokeObjectURL')
    .mockImplementation(() => undefined);

  const linkClickSpy = vi
    .spyOn(
      HTMLAnchorElement.prototype,
      'click',
    )
    .mockImplementation(() => undefined);

  vi.mocked(api.get).mockImplementation(
    async (url) => {
      const endpoint = String(url);

      if (endpoint === '/purchases') {
        return {
          data: [purchase],
        } as never;
      }

      if (endpoint === '/suppliers') {
        return {
          data: [supplier],
        } as never;
      }

      if (endpoint === '/products') {
        return {
          data: [product],
        } as never;
      }

      if (
        endpoint ===
        '/purchases/purchase-1/pdf'
      ) {
        return {
          data: pdfBlob,
        } as never;
      }

      throw new Error(
        `Solicitud GET no configurada: ${endpoint}`,
      );
    },
  );

  render(<PurchasesPage />);

  await screen.findByText('OC-0001');

  await clickRowAction(user, /descargar pdf/i);

  await waitFor(() => {
    expect(api.get).toHaveBeenCalledWith(
      '/purchases/purchase-1/pdf',
      {
        responseType: 'blob',
      },
    );
  });

  expect(
    createObjectURLSpy,
  ).toHaveBeenCalledWith(pdfBlob);

  expect(linkClickSpy).toHaveBeenCalledTimes(1);

  expect(
    revokeObjectURLSpy,
  ).toHaveBeenCalledWith(
    'blob:purchase-pdf',
  );

  createObjectURLSpy.mockRestore();
  revokeObjectURLSpy.mockRestore();
  linkClickSpy.mockRestore();
});
});


describe('OX-PUR-05 — integración PHYSICAL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthenticatedSessionCache();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(receiptIdempotencyKey);
    routerMock.search = '';
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); clearAuthenticatedSessionCache(); });

it.each(['desktop', 'mobile'])('PHYSICAL REQUIRED envía fecha sin lote desde %s, sin perder documento ni key', async (layout) => {
  const user = userEvent.setup();
  const physicalPurchase = { ...purchase, items: [{ ...purchase.items[0], product: { ...purchase.items[0].product, lotTracking: 'REQUIRED' as const } }] };
  configureApiMocks([physicalPurchase], { receiptAuthority: 'PHYSICAL' });
  const originalGet = vi.mocked(api.get).getMockImplementation()!;
  vi.mocked(api.get).mockImplementation((url, config) => String(url) === '/purchases/purchase-1'
    ? Promise.resolve({ data: physicalPurchase }) as never : originalGet(url, config));
  vi.mocked(api.post).mockResolvedValue({ data: { id: 'receipt-physical', folio: 'REC-PHYSICAL' } } as never);
  render(<PurchasesPage />);
  await screen.findByText('OC-0001');
  await user.click(screen.getByRole('button', { name: /recibir/i }));
  await screen.findByText(/lote y caducidad son opcionales e independientes/i);
  const editor = within(screen.getByTestId('receipt-' + layout + '-items'));
  await user.type(editor.getByLabelText('Cantidad recibida de Producto médico'), '2');
  fireEvent.change(editor.getByLabelText('Caducidad de Producto médico'), { target: { value: '2029-06-30' } });
  await user.selectOptions(screen.getByLabelText('Documento del proveedor (opcional)'), 'REMISION');
  await user.type(screen.getByLabelText('Número del documento'), 'REM-5');
  await user.click(getReceiptSubmitButton());
  await screen.findByRole('heading', { name: 'Recepción registrada correctamente' });
  expect(api.post).toHaveBeenCalledExactlyOnceWith('/purchase-receipts', {
    purchaseId: 'purchase-1', notes: undefined, supplierDocumentType: 'REMISION', supplierDocumentNumber: 'REM-5',
    items: [{ purchaseItemId: 'purchase-item-1', quantityReceived: 2, lotNumber: undefined, expirationDate: '2029-06-30' }],
  }, { headers: { 'Idempotency-Key': receiptIdempotencyKey } });
});

});


describe('PUR-UX-01B — lista visual de Compras con flag reversible', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthenticatedSessionCache();
    configureApiMocks([purchase, partialPurchase]);
    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    consoleErrorSpy.mockRestore();
    clearAuthenticatedSessionCache();
  });

  it('mantiene el listado clásico cuando la bandera no está activada', async () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'false');
    render(<PurchasesPage />);

    await screen.findByRole('link', { name: 'OC-0001' });

    expect(screen.getByRole('searchbox', { name: 'Buscar compras' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Historial de compras' })).toBeNull();
    expect(screen.getByText('Administra órdenes de compra y da seguimiento a sus recepciones.')).toBeTruthy();
  });

  it('muestra la estructura del workspace conservando filtros, folios accionables y permisos', async () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    const user = userEvent.setup();
    render(<PurchasesPage />);

    await screen.findByRole('button', { name: 'Abrir detalle de compra OC-0001' });

    const toolbar = screen.getByRole('group', { name: 'Controles de tabla' });
    expect(within(toolbar).getByRole('heading', { name: 'Historial de compras', level: 2 })).toBeTruthy();
    expect(within(toolbar).getByText('2 de 2 órdenes')).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: 'Limpiar filtros' })).toBeTruthy();
    expect(screen.getAllByText('2 de 2 órdenes')).toHaveLength(1);
    expect(screen.getByText('Registra órdenes de compra y da seguimiento a recepciones parciales o completas.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir detalle de compra OC-0001' }).getAttribute('aria-haspopup')).toBe('dialog');
    expect(screen.getByText('2 de 2 órdenes')).toBeTruthy();

    const search = screen.getByRole('searchbox', {
      name: 'Buscar por folio, proveedor o producto',
    });
    expect(screen.queryByText('También puedes buscar por contacto, email o SKU.')).toBeNull();
    await user.type(search, 'RX-200');
    expect(screen.getByText('1 de 2 órdenes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir detalle de compra OC-0002' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Abrir detalle de compra OC-0001' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByText('2 de 2 órdenes')).toBeTruthy();
    expect(vi.mocked(api.post)).not.toHaveBeenCalled();
    expect(vi.mocked(api.patch)).not.toHaveBeenCalled();
  });

  it('conserva las opciones reales de estado sin inventar almacenes del mockup', async () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    const user = userEvent.setup();
    render(<PurchasesPage />);
    await screen.findByRole('button', { name: 'Abrir detalle de compra OC-0001' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Estado' }), 'PARTIALLY_RECEIVED');
    expect(screen.getByRole('button', { name: 'Abrir detalle de compra OC-0002' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Abrir detalle de compra OC-0001' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Almacén destino' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Nueva compra' })).toBeTruthy();
  });
});


describe('PUR-UX-01C — integración del panel contextual desde el listado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthenticatedSessionCache();
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'true');
    configureApiMocks([purchase, partialPurchase]);
    const previousGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) => {
      if (String(url) === '/purchases/purchase-1') {
        return Promise.resolve({ data: purchase }) as never;
      }
      return previousGet(url, config);
    });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    consoleErrorSpy.mockRestore();
    clearAuthenticatedSessionCache();
  });

  it('abre el panel de compra y restaura el foco y el listado con Escape', async () => {
    const user = userEvent.setup();
    render(<PurchasesPage />);
    const openButton = await screen.findByRole('button', { name: 'Abrir detalle de compra OC-0001' });
    await user.click(openButton);

    expect(await screen.findByRole('dialog', { name: 'Compra OC-0001' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver detalle completo' }).getAttribute('href'))
      .toBe('/purchases/purchase-1');
    expect(openButton.getAttribute('aria-expanded')).toBe('true');
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Compra OC-0001' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Abrir detalle de compra OC-0001' })).toBeTruthy();
    expect(openButton.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(openButton);
  });

  it('abre el folio por Enter, conserva los filtros y restaura foco después de cerrar con X', async () => {
    const user = userEvent.setup();
    render(<PurchasesPage />);
    await screen.findByRole('button', { name: 'Abrir detalle de compra OC-0001' });
    const search = screen.getByRole('searchbox', { name: 'Buscar por folio, proveedor o producto' });
    await user.type(search, 'OC-0001');
    const folio = screen.getByRole('button', { name: 'Abrir detalle de compra OC-0001' });
    folio.focus();
    await user.keyboard('{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Compra OC-0001' });
    expect(dialog.getAttribute('data-modal-layout')).toBe('side-panel');
    expect(within(dialog).getByRole('link', { name: 'Ver detalle completo' }).getAttribute('href'))
      .toBe('/purchases/purchase-1');

    await user.click(within(dialog).getByRole('button', { name: 'Cerrar modal' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Compra OC-0001' })).toBeNull());
    expect(search).toHaveProperty('value', 'OC-0001');
    expect(screen.getByText('1 de 2 órdenes')).toBeTruthy();
    expect(document.activeElement).toBe(folio);
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('recarga el detalle al reabrir el mismo folio sin duplicar mutaciones', async () => {
    const user = userEvent.setup();
    render(<PurchasesPage />);
    const folio = await screen.findByRole('button', { name: 'Abrir detalle de compra OC-0001' });
    await user.click(folio);
    await screen.findByRole('dialog', { name: 'Compra OC-0001' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Compra OC-0001' })).toBeNull());
    await user.click(folio);
    expect(await screen.findByRole('dialog', { name: 'Compra OC-0001' })).toBeTruthy();
    await waitFor(() => {
      const calls = vi.mocked(api.get).mock.calls.filter(([url]) => String(url) === '/purchases/purchase-1');
      expect(calls).toHaveLength(2);
    });
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('muestra el error de descarga PDF dentro del panel y permite cerrarlo', async () => {
    const user = userEvent.setup();
    render(<PurchasesPage />);
    await user.click(await screen.findByRole('button', { name: 'Abrir detalle de compra OC-0001' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compra OC-0001' });
    await user.click(within(dialog).getByRole('button', { name: 'Descargar PDF' }));
    expect(await within(dialog).findByText('No fue posible descargar el PDF.')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Cerrar mensaje' }));
    await waitFor(() => expect(within(dialog).queryByText('No fue posible descargar el PDF.')).toBeNull());
  });

  it.each(['ADMIN', 'MANAGER'] as const)('ofrece aprobar/editar/cancelar un DRAFT en panel para rol %s', async (role) => {
    clearAuthenticatedSessionCache();
    configureApiMocks([draftPurchase], { role });
    const previousGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) =>
      String(url) === '/purchases/purchase-1'
        ? Promise.resolve({ data: draftPurchase }) as never
        : previousGet(url, config),
    );
    const user = userEvent.setup();
    render(<PurchasesPage />);
    await user.click(await screen.findByRole('button', { name: 'Abrir detalle de compra OC-0001' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compra OC-0001' });
    await within(dialog).findByText('Producto médico');
    expect(within(dialog).getByRole('button', { name: 'Aprobar' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Cancelar' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Registrar recepción' })).toBeNull();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('no eleva permisos de WAREHOUSE: edición sin aprobar/cancelar DRAFT', async () => {
    clearAuthenticatedSessionCache();
    configureApiMocks([draftPurchase], { role: 'WAREHOUSE' });
    const previousGet = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((url, config) =>
      String(url) === '/purchases/purchase-1'
        ? Promise.resolve({ data: draftPurchase }) as never
        : previousGet(url, config),
    );
    const user = userEvent.setup();
    render(<PurchasesPage />);
    await user.click(await screen.findByRole('button', { name: 'Abrir detalle de compra OC-0001' }));
    const dialog = await screen.findByRole('dialog', { name: 'Compra OC-0001' });
    await within(dialog).findByText('Producto médico');
    expect(within(dialog).getByRole('button', { name: 'Editar' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Aprobar' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('no renderiza listado ni panel para rol SALES', async () => {
    clearAuthenticatedSessionCache();
    configureApiMocks([purchase], { role: 'SALES' });
    render(<PurchasesPage />);
    expect(await screen.findByRole('heading', { name: 'Sin permisos' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Abrir detalle de compra OC-0001' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: /Compra OC-/ })).toBeNull();
  });

  it('no renderiza controles de vista rápida con el flag desactivado', async () => {
    vi.stubEnv('NEXT_PUBLIC_ZAPING_PURCHASES_WORKSPACE', 'false');
    render(<PurchasesPage />);
    await screen.findByRole('link', { name: 'OC-0001' });
    expect(screen.queryByRole('button', { name: 'Abrir detalle de compra OC-0001' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: /Compra OC-/ })).toBeNull();
  });
});
