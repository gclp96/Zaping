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

import QuotesPage from './page';

import type {
  Customer,
  Product,
  Quote,
} from './types';

const routerMock = vi.hoisted(() => ({
  push: vi.fn(),
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
}));

const customer: Customer = {
  id: 'customer-1',
  name: 'Hospital de prueba',
  type: 'Hospital',
  contactName: 'Responsable de compras',
  email: 'hospital@example.com',
  phone: '6621234567',
  isActive: true,
};

const product: Product = {
  id: 'product-1',
  sku: 'MED-001',
  name: 'Producto médico',
  cost: 300,
  price: 500,
  stock: 20,
  minStock: 5,
  isActive: true,
};

const draftQuote: Quote = {
  id: 'quote-1',
  companyId: 'company-1',
  customerId: customer.id,

  folio: 'COT-0001',

  subtotal: 1000,
  iva: 160,
  total: 1160,

  status: 'DRAFT',
  convertedToSale: false,

  createdAt: '2026-08-13T18:00:00.000Z',
  updatedAt: '2026-08-13T18:00:00.000Z',

  customer,

  items: [
    {
      id: 'quote-item-1',
      productId: product.id,
      quantity: 2,
      price: 500,
      subtotal: 1000,

      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
      },
    },
  ],
};

const confirmedQuote: Quote = {
  ...draftQuote,
  status: 'CONFIRMED',
};

const convertedQuote: Quote = {
  ...confirmedQuote,
  convertedToSale: true,
};

const alternateConfirmedQuote: Quote = {
  ...confirmedQuote,
  id: 'quote-2',
  folio: 'COT-0002',
  customerId: 'customer-2',
  customer: {
    ...customer,
    id: 'customer-2',
    name: 'Clínica del Desierto',
    email: 'compras@desierto.test',
  },
  items: [
    {
      ...draftQuote.items[0],
      id: 'quote-item-2',
      product: {
        id: 'product-2',
        sku: 'RX-200',
        name: 'Reactivo especializado',
      },
    },
  ],
};

const cancelledQuote: Quote = {
  ...draftQuote,
  id: 'quote-3',
  folio: 'COT-0003',
  status: 'CANCELLED',
};

function buildQuoteList(count: number): Quote[] {
  return Array.from({ length: count }, (_, index) => {
    const sequence = index + 1;
    const total = sequence * 100;

    return {
      ...draftQuote,
      id: `quote-page-${sequence}`,
      folio: `COT-${String(sequence).padStart(4, '0')}`,
      subtotal: total,
      iva: 0,
      total,
      status: sequence % 2 === 0 ? 'CONFIRMED' : 'DRAFT',
      createdAt: new Date(
        Date.UTC(2026, 7, sequence, 18, 0, 0),
      ).toISOString(),
      updatedAt: new Date(
        Date.UTC(2026, 7, sequence, 18, 0, 0),
      ).toISOString(),
      customer: {
        ...customer,
        id: `customer-page-${sequence}`,
        name: `Cliente ${String(sequence).padStart(3, '0')}`,
        email: `cliente${sequence}@example.com`,
      },
      items: [
        {
          ...draftQuote.items[0],
          id: `quote-item-page-${sequence}`,
          price: total,
          subtotal: total,
        },
      ],
    };
  });
}

function configureApiMocks(
  quotes: Quote[] = [draftQuote],
) {
  vi.mocked(api.get).mockImplementation(
    async (url) => {
      const endpoint = String(url);

      if (endpoint === '/quotes') {
        return {
          data: quotes,
        } as never;
      }

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

      if (endpoint === '/customers') {
        return {
          data: [customer],
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
}

function getDetailModal(
  heading: HTMLElement,
): HTMLElement {
  const modal =
    heading.parentElement?.parentElement;

  if (!modal) {
    throw new Error(
      'No fue posible localizar el modal de detalle',
    );
  }

  return modal;
}

async function submitQuoteConversion(
  user: ReturnType<typeof userEvent.setup>,
) {
  await user.click(
    screen.getByRole('button', { name: /ver detalle/i }),
  );
  const detailHeading = await screen.findByRole('heading', {
    name: /cotización cot-0001/i,
  });
  const detailModal = getDetailModal(detailHeading);

  await user.click(
    within(detailModal).getByRole('button', {
      name: /^convertir a venta$/i,
    }),
  );

  const dialogHeading = await screen.findByRole('heading', {
    name: /convertir cotización a venta/i,
  });
  const dialog = dialogHeading.parentElement?.parentElement;

  if (!dialog) {
    throw new Error('No fue posible localizar el diálogo de conversión');
  }

  await user.click(
    within(dialog).getByRole('button', {
      name: /^convertir a venta$/i,
    }),
  );
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

describe('QuotesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAuthenticatedSessionCache();

    consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    configureApiMocks();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();

    cleanup();
  });

  it('carga cotizaciones, clientes y productos al iniciar', async () => {
    render(<QuotesPage />);

    expect(
      await screen.findByText('COT-0001'),
    ).toBeTruthy();

    expect(
      screen.getByRole('table', { name: 'Listado de cotizaciones' }),
    ).toBeTruthy();
    expect(
      screen.getAllByRole('columnheader').map((header) =>
        header.textContent?.trim(),
      ),
    ).toEqual([
      'Folio',
      'Cliente',
      'Fecha',
      'Partidas',
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
      screen.getByRole('columnheader', { name: 'Fecha' }).classList.contains(
        'sm:table-cell',
      ),
    ).toBe(true);
    expect(
      screen.getByRole('columnheader', { name: 'Partidas' }).classList.contains(
        'md:table-cell',
      ),
    ).toBe(true);

    expect(
      screen.getByText('Hospital de prueba'),
    ).toBeTruthy();

    expect(
      screen.getByLabelText(
        'Estado de la cotización: Borrador',
      ),
    ).toBeTruthy();

    expect(
      screen.getByText('$1,160.00'),
    ).toBeTruthy();
    expect(
      screen.getByText(
        new Intl.DateTimeFormat('es-MX', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        }).format(new Date(draftQuote.createdAt)),
      ),
    ).toBeTruthy();

    expect(api.get).toHaveBeenCalledWith(
      '/quotes',
    );

    expect(api.get).toHaveBeenCalledWith(
      '/customers',
    );

    expect(api.get).toHaveBeenCalledWith(
      '/products',
    );
  });

  it('ordena por folio y total usando el valor real de cada cotización', async () => {
    const user = userEvent.setup();
    configureApiMocks([
      {
        ...draftQuote,
        id: 'quote-sort-10',
        folio: 'COT-0010',
        total: 10,
        customer: { ...customer, name: 'Cliente Zeta' },
      },
      {
        ...confirmedQuote,
        id: 'quote-sort-2',
        folio: 'COT-0002',
        total: 200,
        customer: { ...customer, name: 'Cliente Alfa' },
      },
      {
        ...cancelledQuote,
        id: 'quote-sort-1',
        folio: 'COT-0001',
        total: 100,
        customer: { ...customer, name: 'Cliente Medio' },
      },
    ]);

    render(<QuotesPage />);
    await screen.findByText('COT-0010');

    const folioHeader = screen.getByRole('columnheader', {
      name: 'Folio',
    });
    await user.click(
      within(folioHeader).getByRole('button', { name: 'Folio' }),
    );

    expect(folioHeader.getAttribute('aria-sort')).toBe('ascending');
    expect(
      screen.getAllByRole('row').slice(1).map((row) =>
        within(row).getAllByRole('cell')[0].textContent?.trim(),
      ),
    ).toEqual(['COT-0001', 'COT-0002', 'COT-0010']);

    await user.click(screen.getByRole('button', { name: 'Total' }));
    expect(
      screen.getAllByRole('row').slice(1).map((row) =>
        within(row).getAllByRole('cell')[0].textContent?.trim(),
      ),
    ).toEqual(['COT-0010', 'COT-0001', 'COT-0002']);
  });

  it('pagina 30 cotizaciones y reinicia al cambiar filtro, tamaño y búsqueda', async () => {
    const user = userEvent.setup();
    configureApiMocks(buildQuoteList(30));

    render(<QuotesPage />);
    await screen.findByText('COT-0001');

    expect(screen.getByText('Mostrando 1-25 de 30')).toBeTruthy();
    expect(screen.queryByText('COT-0026')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Mostrando 26-30 de 30')).toBeTruthy();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Estado' }),
      'CONFIRMED',
    );
    expect(screen.getByText('Mostrando 1-15 de 15')).toBeTruthy();
    expect(screen.getByText('COT-0002')).toBeTruthy();

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
      screen.getByRole('searchbox', { name: 'Buscar cotizaciones' }),
      'COT-0030',
    );
    expect(screen.getByText('Mostrando 1-1 de 1')).toBeTruthy();
    expect(screen.getByText('COT-0030')).toBeTruthy();
  });

  it('busca por folio, cliente, email y producto, y muestra vacío contextual', async () => {
    const user = userEvent.setup();
    configureApiMocks([draftQuote, alternateConfirmedQuote]);

    render(<QuotesPage />);

    await screen.findByText(draftQuote.folio);
    const search = screen.getByRole('searchbox', {
      name: 'Buscar cotizaciones',
    });

    for (const term of [
      '  cot-0002  ',
      'CLÍNICA DEL DESIERTO',
      'compras@desierto.test',
      'rx-200',
      'REACTIVO ESPECIALIZADO',
    ]) {
      await user.clear(search);
      await user.type(search, term);
      expect(screen.getByText(alternateConfirmedQuote.folio)).toBeTruthy();
      expect(screen.queryByText(draftQuote.folio)).toBeNull();
    }

    await user.clear(search);
    await user.type(search, 'sin coincidencias');
    expect(screen.getByText('No se encontraron cotizaciones')).toBeTruthy();
    expect(
      screen.getByText(
        'No hay cotizaciones que coincidan con la búsqueda y el estado seleccionados.',
      ),
    ).toBeTruthy();
  });

  it('filtra los estados reales y combina estado con búsqueda', async () => {
    const user = userEvent.setup();
    configureApiMocks([
      draftQuote,
      alternateConfirmedQuote,
      cancelledQuote,
    ]);

    render(<QuotesPage />);

    await screen.findByText(draftQuote.folio);
    const status = screen.getByRole('combobox', { name: 'Estado' });

    expect(screen.getByRole('option', { name: 'Todos' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Borrador' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Aprobada' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Cancelada' })).toBeTruthy();

    await user.selectOptions(status, 'CONFIRMED');
    expect(screen.getByText(alternateConfirmedQuote.folio)).toBeTruthy();
    expect(screen.queryByText(draftQuote.folio)).toBeNull();
    expect(screen.queryByText(cancelledQuote.folio)).toBeNull();

    await user.type(
      screen.getByRole('searchbox', { name: 'Buscar cotizaciones' }),
      'Hospital de prueba',
    );
    expect(screen.getByText('No se encontraron cotizaciones')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByText(draftQuote.folio)).toBeTruthy();
    expect(screen.getByText(alternateConfirmedQuote.folio)).toBeTruthy();
    expect(screen.getByText(cancelledQuote.folio)).toBeTruthy();
  });

  it('muestra un estado vacío útil cuando no existen cotizaciones', async () => {
    configureApiMocks([]);

    render(<QuotesPage />);

    expect(
      await screen.findByText('No hay cotizaciones registradas'),
    ).toBeTruthy();
    expect(
      screen.getByText('Comienza creando tu primera cotización.'),
    ).toBeTruthy();
  });

  it('registra un cliente desde la cotización y lo selecciona automáticamente', async () => {
  const user = userEvent.setup();

  const newCustomer = {
    id: 'customer-2',
    name: 'Clínica nueva',
    type: 'Clínica',
    email: 'compras@clinicanueva.com',
    phone: '6627654321',
    contactName: null,
    address: null,
    notes: null,
    isActive: true,
  };

  vi.mocked(api.post).mockResolvedValue({
    data: newCustomer,
  } as never);

  render(<QuotesPage />);

  await screen.findByText('COT-0001');

  await user.click(
    await screen.findByRole('button', {
      name: /nueva cotización/i,
    }),
  );

  const quoteHeading =
    await screen.findByRole('heading', {
      name: /nueva cotización/i,
    });

  const quoteModal =
    quoteHeading.parentElement?.parentElement;

  expect(quoteModal).not.toBeNull();

  const quoteScope = within(
    quoteModal as HTMLElement,
  );

  await user.click(
    quoteScope.getByRole('combobox', {
      name: 'Cliente',
    }),
  );

  await user.click(
    quoteScope.getByRole('button', {
      name: /registrar nuevo cliente/i,
    }),
  );

  const customerHeading =
    await screen.findByRole('heading', {
      name: /nuevo cliente/i,
    });

  const customerModal =
    customerHeading.parentElement?.parentElement;

  expect(customerModal).not.toBeNull();

  const customerScope = within(
    customerModal as HTMLElement,
  );

  await user.type(
    customerScope.getByLabelText(/^nombre/i),
    'Clínica nueva',
  );

  await user.selectOptions(
    customerScope.getByRole('combobox', { name: 'Tipo' }),
    'CLINIC',
  );

  await user.type(
    customerScope.getByLabelText(/^email/i),
    'compras@clinicanueva.com',
  );

  await user.type(
    customerScope.getByLabelText(/^teléfono/i),
    '6627654321',
  );

  await user.click(
    customerScope.getByRole('button', {
      name: /registrar cliente/i,
    }),
  );

  await waitFor(() => {
    expect(api.post).toHaveBeenCalledWith(
      '/customers',
      {
        name: 'Clínica nueva',
        legalName: null,
        type: 'CLINIC',
        email: 'compras@clinicanueva.com',
        phone: '6627654321',
        contactName: undefined,
        address: undefined,
        postalCode: null,
        neighborhood: null,
        municipality: null,
        city: null,
        state: null,
        countryCode: 'MX',
        notes: undefined,
      },
    );
  });

  await waitFor(() => {
    expect(
      screen.queryByRole('heading', {
        name: /^nuevo cliente$/i,
      }),
    ).toBeNull();
  });

  expect(
    within(
      quoteModal as HTMLElement,
    ).getAllByText('Clínica nueva').length,
  ).toBeGreaterThan(0);

  expect(
    within(
      quoteModal as HTMLElement,
    ).getAllByText('compras@clinicanueva.com').length,
  ).toBeGreaterThan(0);

  expect(
    screen.getByRole('heading', {
      name: /nueva cotización/i,
    }),
  ).toBeTruthy();
});

  it('muestra aprobar y cancelar para una cotización en borrador', async () => {
    render(<QuotesPage />);

    await screen.findByText('COT-0001');

    expect(
      screen.getByRole('button', {
        name: /^aprobar$/i,
      }),
    ).toBeTruthy();

    expect(
      screen.getByRole('button', {
        name: /^cancelar$/i,
      }),
    ).toBeTruthy();

    expect(
      screen.queryByRole('button', {
        name: /^convertir a venta$/i,
      }),
    ).toBeNull();
  });

  it('permite convertir desde el detalle únicamente una cotización confirmada no convertida', async () => {
    const user = userEvent.setup();

    configureApiMocks([confirmedQuote]);

    render(<QuotesPage />);

    await screen.findByText('COT-0001');

    expect(
      screen.queryByRole('button', {
        name: /^aprobar$/i,
      }),
    ).toBeNull();

    expect(
      screen.queryByRole('button', {
        name: /^cancelar$/i,
      }),
    ).toBeNull();

    await user.click(
      screen.getByRole('button', {
        name: /ver detalle/i,
      }),
    );

    const heading = await screen.findByRole(
      'heading',
      {
        name: /cotización cot-0001/i,
      },
    );

    const detailModal =
      getDetailModal(heading);

    expect(
      within(detailModal).getByText(
        /^No convertida$/i,
      ),
    ).toBeTruthy();

    expect(
      within(detailModal).getByRole(
        'button',
        {
          name: /^convertir a venta$/i,
        },
      ),
    ).toBeTruthy();
  });

  it('no permite convertir nuevamente una cotización ya convertida', async () => {
    const user = userEvent.setup();

    configureApiMocks([convertedQuote]);

    render(<QuotesPage />);

    await screen.findByText('COT-0001');

    await user.click(
      screen.getByRole('button', {
        name: /ver detalle/i,
      }),
    );

    const heading = await screen.findByRole(
      'heading',
      {
        name: /cotización cot-0001/i,
      },
    );

    const detailModal =
      getDetailModal(heading);

    expect(
      within(detailModal).getByText(
        /^Convertida a venta$/i,
      ),
    ).toBeTruthy();

    expect(
      within(detailModal).queryByRole(
        'button',
        {
          name: /^convertir a venta$/i,
        },
      ),
    ).toBeNull();

    expect(
      within(detailModal).queryByRole('button', { name: 'Ver venta' }),
    ).toBeNull();
  });

  it('convierte una cotización confirmada y recarga su estado', async () => {
    const user = userEvent.setup();

    let quoteRequestCount = 0;

    vi.mocked(api.get).mockImplementation(
      async (url) => {
        const endpoint = String(url);

        if (endpoint === '/quotes') {
          quoteRequestCount += 1;

          return {
            data: [
              quoteRequestCount === 1
                ? confirmedQuote
                : convertedQuote,
            ],
          } as never;
        }

        if (endpoint === '/customers') {
          return {
            data: [customer],
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

    vi.mocked(api.post).mockResolvedValue({
      data: {
        id: 'sale-123',
        folio: 'V-000123',
      },
    } as never);

    render(<QuotesPage />);

    await screen.findByText('COT-0001');

    await submitQuoteConversion(user);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/sales/from-quote/quote-1',
      );
    });

    await waitFor(() => {
      expect(quoteRequestCount).toBe(2);
    });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole('heading', {
        name: 'Venta creada correctamente',
      }),
    ).toBeTruthy();
    expect(screen.getByText('V-000123')).toBeTruthy();
    expect(
      screen.getByText('La cotización fue convertida en una venta.'),
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Cerrar' }));

    expect(
      screen.queryByRole('heading', {
        name: 'Venta creada correctamente',
      }),
    ).toBeNull();
    expect(screen.getByText('COT-0001')).toBeTruthy();

    await user.click(
      screen.getByRole('button', {
        name: /ver detalle/i,
      }),
    );

    const updatedDetailHeading =
      await screen.findByRole('heading', {
        name: /cotización cot-0001/i,
      });

    const updatedDetailModal =
      getDetailModal(updatedDetailHeading);

    expect(
      within(updatedDetailModal).getByText(
        /^Convertida a venta$/i,
      ),
    ).toBeTruthy();

    expect(
      within(updatedDetailModal).queryByRole(
        'button',
        {
          name: /^convertir a venta$/i,
        },
      ),
    ).toBeNull();
  });

  it('navega a la venta creada usando el deep-link aprobado', async () => {
    const user = userEvent.setup();
    let quoteRequestCount = 0;

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
            role: 'ADMIN',
            companyTimezone: 'America/Hermosillo',
          },
        } as never;
      }

      if (endpoint === '/quotes') {
        quoteRequestCount += 1;
        return {
          data: [quoteRequestCount === 1 ? confirmedQuote : convertedQuote],
        } as never;
      }

      if (endpoint === '/customers') {
        return { data: [customer] } as never;
      }

      if (endpoint === '/products') {
        return { data: [product] } as never;
      }

      throw new Error(`Solicitud GET no configurada: ${endpoint}`);
    });
    vi.mocked(api.post).mockResolvedValue({
      data: { id: 'sale-123', folio: 'V-000123' },
    } as never);

    render(<QuotesPage />);

    await screen.findByText('COT-0001');
    await submitQuoteConversion(user);
    await screen.findByText('V-000123');
    await user.click(screen.getByRole('button', { name: 'Ver venta' }));

    expect(routerMock.push).toHaveBeenCalledWith(
      '/sales?saleId=sale-123',
    );
    expect(
      screen.queryByRole('heading', {
        name: 'Venta creada correctamente',
      }),
    ).toBeNull();
  });

  it('muestra el error de conversión sin navegar ni mostrar éxito', async () => {
    const user = userEvent.setup();
    configureApiMocks([confirmedQuote]);
    vi.mocked(api.post).mockRejectedValue(new Error('Stock insuficiente'));

    render(<QuotesPage />);

    await screen.findByText('COT-0001');
    await submitQuoteConversion(user);

    expect(
      await screen.findByText(
        'No fue posible convertir la cotización en venta.',
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', {
        name: 'Venta creada correctamente',
      }),
    ).toBeNull();
    expect(routerMock.push).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(
      (
        screen.getByRole('button', {
          name: 'Convertir a venta',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it('permite buscar y seleccionar un cliente al crear una cotización', async () => {
  const user = userEvent.setup();

  render(<QuotesPage />);

  await screen.findByText('COT-0001');

  await user.click(
    screen.getByRole('button', {
      name: /nueva cotización/i,
    }),
  );

  const quoteHeading =
    await screen.findByRole('heading', {
      name: /nueva cotización/i,
    });

  const quoteModal =
    quoteHeading.parentElement?.parentElement;

  expect(quoteModal).not.toBeNull();

  const quoteScope = within(
    quoteModal as HTMLElement,
  );

  const customerSearch =
    quoteScope.getByRole('combobox', {
      name: 'Cliente',
    });

  await user.click(customerSearch);

  await user.type(
    customerSearch,
    'Hospital de prueba',
  );

  await user.click(
    quoteScope.getByRole('option', {
      name: /Hospital de prueba/i,
    }),
  );

  expect(
    quoteScope.getByText(
      'Hospital de prueba',
    ),
  ).toBeTruthy();

  expect(
    quoteScope.getByText(
      'hospital@example.com',
    ),
  ).toBeTruthy();
});

  it('muestra el error de carga y permite reintentar', async () => {
    const user = userEvent.setup();

    let firstQuotesRequest = true;

    vi.mocked(api.get).mockImplementation(
      async (url) => {
        const endpoint = String(url);

        if (endpoint === '/quotes') {
          if (firstQuotesRequest) {
            firstQuotesRequest = false;

            throw new Error(
              'Error cargando cotizaciones',
            );
          }

          return {
            data: [draftQuote],
          } as never;
        }

        if (endpoint === '/customers') {
          return {
            data: [customer],
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

    render(<QuotesPage />);

    const alert =
      await screen.findByRole('alert');

    expect(alert.textContent).toContain(
      'No fue posible cargar la información de cotizaciones.',
    );

    await user.click(
      within(alert).getByRole('button', {
        name: /reintentar/i,
      }),
    );

    expect(
      await screen.findByText('COT-0001'),
    ).toBeTruthy();

    expect(
      screen.queryByText(
        'No fue posible cargar la información de cotizaciones.',
      ),
    ).toBeNull();
  });
});
