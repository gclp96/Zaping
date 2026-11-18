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

import CustomersPage from './page';

vi.mock('@/services/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
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

const clinicCustomer = {
  id: 'customer-clinic',
  name: 'Clínica Norte',
  type: 'Clínica',
  email: 'contacto@norte.test',
  phone: '6621001000',
  address: 'Hermosillo Centro',
  contactName: 'Ana López',
  notes: 'Cuenta clínica',
};

const hospitalCustomer = {
  id: 'customer-hospital',
  name: 'Hospital del Sur',
  type: 'Hospital',
  email: 'compras@sur.test',
  phone: '6442002000',
  address: 'Ciudad Obregón',
  contactName: 'Luis Pérez',
  notes: null,
};

const customers = [clinicCustomer, hospitalCustomer];

function buildCustomer(index: number) {
  return {
    ...clinicCustomer,
    id: `customer-${index}`,
    name: `Cliente ${String(index).padStart(2, '0')}`,
    email: `cliente${index}@test.test`,
    phone: `662100${String(index).padStart(4, '0')}`,
    address: `Dirección ${index}`,
  };
}

function configureApiMocks(customerData = customers) {
  vi.mocked(api.get).mockImplementation(async (url) =>
    String(url) === '/auth/me'
      ? ({
          data: {
            id: 'user-1',
            companyId: 'company-1',
            email: 'admin@test.test',
            firstName: 'Admin',
            lastName: 'Test',
            role: 'ADMIN',
            companyTimezone: 'America/Hermosillo',
          },
        } as never)
      : ({ data: customerData } as never),
  );
  vi.mocked(api.post).mockResolvedValue({ data: clinicCustomer } as never);
  vi.mocked(api.patch).mockResolvedValue({ data: clinicCustomer } as never);
  vi.mocked(api.delete).mockResolvedValue({ data: {} } as never);
}

async function renderCustomersPage() {
  render(<CustomersPage />);
  await screen.findByText(clinicCustomer.name);
}

async function chooseCustomerAction(
  user: ReturnType<typeof userEvent.setup>,
  customerName: string,
  actionName: 'Editar' | 'Desactivar',
) {
  const row = screen
    .getByText(customerName)
    .closest('tr');

  if (!row) {
    throw new Error(`No se encontró la fila de ${customerName}`);
  }

  await user.click(
    within(row).getByRole('button', {
      name: `Acciones del cliente ${customerName}`,
    }),
  );
  await user.click(
    screen.getByRole('menuitem', {
      name:
        actionName === 'Desactivar'
          ? 'Acción destructiva: Desactivar'
          : actionName,
    }),
  );
}

function renderedCustomerNames() {
  return screen.getAllByRole('row').slice(1).map((row) => {
    const firstCell = within(row).getAllByRole('cell')[0];
    return firstCell.querySelector('p')?.textContent?.trim();
  });
}

async function completeCustomerForm(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.type(screen.getByRole('textbox', { name: 'Nombre' }), name);
  await user.type(screen.getByRole('textbox', { name: 'Tipo' }), 'Clínica');
  await user.type(
    screen.getByRole('textbox', { name: 'Email' }),
    'nuevo@cliente.test',
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Teléfono' }),
    '6623334444',
  );
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

describe('CustomersPage', () => {
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

  it('carga las columnas útiles y busca por nombre, email y teléfono', async () => {
    const user = userEvent.setup();
    render(<CustomersPage />);

    expect(screen.getByText('Cargando clientes...')).toBeTruthy();
    expect(await screen.findByText(clinicCustomer.name)).toBeTruthy();
    expect(screen.getByText(clinicCustomer.type)).toBeTruthy();
    expect(screen.getByText(clinicCustomer.email)).toBeTruthy();
    expect(screen.getByText(clinicCustomer.phone)).toBeTruthy();
    expect(screen.getByText(clinicCustomer.address)).toBeTruthy();

    const search = screen.getByRole('searchbox', { name: 'Buscar clientes' });

    await user.type(search, '  clínica norte  ');
    expect(screen.getByText(clinicCustomer.name)).toBeTruthy();
    expect(screen.queryByText(hospitalCustomer.name)).toBeNull();

    await user.clear(search);
    await user.type(search, hospitalCustomer.email.toUpperCase());
    expect(screen.getByText(hospitalCustomer.name)).toBeTruthy();
    expect(screen.queryByText(clinicCustomer.name)).toBeNull();

    await user.clear(search);
    await user.type(search, clinicCustomer.phone);
    expect(screen.getByText(clinicCustomer.name)).toBeTruthy();

    await user.clear(search);
    await user.type(search, 'sin coincidencias');
    expect(screen.getByText('Sin clientes coincidentes')).toBeTruthy();
    expect(
      screen.getByText('No encontramos clientes con esa búsqueda.'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }));
    expect(screen.getByText(clinicCustomer.name)).toBeTruthy();
  });

  it('busca también por tipo y contacto, sin exigir acentos', async () => {
    const user = userEvent.setup();
    await renderCustomersPage();

    const search = screen.getByRole('searchbox', { name: 'Buscar clientes' });
    await user.type(search, 'clinica');
    expect(screen.getByText(clinicCustomer.name)).toBeTruthy();
    expect(screen.queryByText(hospitalCustomer.name)).toBeNull();

    await user.clear(search);
    await user.type(search, 'luis perez');
    expect(screen.getByText(hospitalCustomer.name)).toBeTruthy();
    expect(screen.queryByText(clinicCustomer.name)).toBeNull();

    await user.clear(search);
    await user.type(search, 'obregon');
    expect(screen.getByText(hospitalCustomer.name)).toBeTruthy();
  });

  it('muestra datos vacíos con indicadores discretos y simplifica la paginación', async () => {
    const customerWithoutDetails = {
      ...clinicCustomer,
      id: 'empty-customer',
      name: 'Cliente sin datos',
      type: '',
      email: '',
      phone: '',
      address: '',
      contactName: '',
    };
    configureApiMocks([customerWithoutDetails]);

    render(<CustomersPage />);
    await screen.findByText('Cliente sin datos');

    expect(screen.getByText('Clientes activos')).toBeTruthy();
    expect(screen.getByText('1 cliente')).toBeTruthy();
    expect(screen.getByLabelText('Tipo sin registrar').textContent).toBe('—');
    expect(screen.getByLabelText('Correo sin registrar').textContent).toBe('—');
    expect(screen.getByLabelText('Teléfono sin registrar').textContent).toBe('—');
    expect(screen.getByLabelText('Dirección sin registrar').textContent).toBe('—');
    expect(screen.getByText('Mostrando 1-1 de 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Página siguiente' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Filas por página' })).toBeNull();
  });

  it('destaca el nombre y muestra el contacto sin duplicar columnas', async () => {
    await renderCustomersPage();
    const row = screen.getByText(clinicCustomer.name).closest('tr');

    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Contacto: Ana López')).toBeTruthy();
    expect(within(row as HTMLElement).getByText('Clínica')).toBeTruthy();
    expect(within(row as HTMLElement).getByText(clinicCustomer.email)).toBeTruthy();
  });

  it('ordena columnas claras con el ciclo ascendente, descendente y neutral', async () => {
    const user = userEvent.setup();
    const sortingCustomers = [
      { ...clinicCustomer, id: 'customer-z', name: 'Cliente Z' },
      { ...hospitalCustomer, id: 'customer-a', name: 'Cliente A' },
      { ...clinicCustomer, id: 'customer-m', name: 'Cliente M' },
    ];
    configureApiMocks(sortingCustomers);

    render(<CustomersPage />);
    await screen.findByText('Cliente Z');

    const nameHeader = screen.getByRole('button', { name: 'Cliente' });

    await user.click(nameHeader);
    expect(renderedCustomerNames()).toEqual([
      'Cliente A',
      'Cliente M',
      'Cliente Z',
    ]);

    await user.click(nameHeader);
    expect(renderedCustomerNames()).toEqual([
      'Cliente Z',
      'Cliente M',
      'Cliente A',
    ]);

    await user.click(nameHeader);
    expect(renderedCustomerNames()).toEqual([
      'Cliente Z',
      'Cliente A',
      'Cliente M',
    ]);

    await user.click(screen.getByRole('button', { name: 'Tipo' }));
    expect(renderedCustomerNames()).toEqual([
      'Cliente Z',
      'Cliente M',
      'Cliente A',
    ]);
  });

  it('pagina con 25 filas por defecto, permite cambiar tamaño y reinicia la búsqueda', async () => {
    const user = userEvent.setup();
    const manyCustomers = Array.from({ length: 30 }, (_, index) =>
      buildCustomer(index),
    );
    configureApiMocks(manyCustomers);

    render(<CustomersPage />);
    await screen.findByText('Cliente 00');

    expect(screen.getByText('Mostrando 1-25 de 30')).toBeTruthy();
    expect(screen.queryByText('Cliente 29')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Cliente 29')).toBeTruthy();
    expect(screen.getByText('Mostrando 26-30 de 30')).toBeTruthy();

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Filas por página' }),
      '10',
    );
    expect(screen.getByText('Mostrando 1-10 de 30')).toBeTruthy();
    expect(screen.getByText('Cliente 00')).toBeTruthy();
    expect(screen.queryByText('Cliente 29')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Cliente 10')).toBeTruthy();

    const search = screen.getByRole('searchbox', { name: 'Buscar clientes' });
    await user.type(search, 'Cliente 29');
    expect(screen.getByText('Mostrando 1-1 de 1')).toBeTruthy();
    expect(screen.getByText('Cliente 29')).toBeTruthy();
  });

  it('muestra un error de carga y permite reintentar', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get)
      .mockRejectedValueOnce(new Error('Clientes no disponibles'))
      .mockResolvedValueOnce({ data: customers } as never);

    render(<CustomersPage />);

    expect(await screen.findByText('Clientes no disponibles')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText(clinicCustomer.name)).toBeTruthy();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('presenta un estado vacío útil', async () => {
    configureApiMocks([]);

    render(<CustomersPage />);

    expect(await screen.findByText('Sin clientes activos')).toBeTruthy();
    expect(
      screen.getByText(
        'Registra un cliente para comenzar a usarlo en cotizaciones y ventas.',
      ),
    ).toBeTruthy();
  });

  it('crea un cliente sin lifecycle, refresca la lista y cierra el formulario', async () => {
    const user = userEvent.setup();
    const newCustomer = {
      ...clinicCustomer,
      id: 'customer-new',
      name: 'Cliente Nuevo',
      email: 'nuevo@cliente.test',
      phone: '6623334444',
      address: null,
      contactName: null,
      notes: null,
    };
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: customers } as never)
      .mockResolvedValue({ data: [...customers, newCustomer] } as never);
    vi.mocked(api.post).mockResolvedValue({ data: newCustomer } as never);

    await renderCustomersPage();
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }));
    await completeCustomerForm(user, newCustomer.name);
    await user.click(
      screen.getByRole('button', { name: 'Registrar cliente' }),
    );

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/customers', {
        name: newCustomer.name,
        type: 'Clínica',
        email: newCustomer.email,
        phone: newCustomer.phone,
        contactName: undefined,
        address: undefined,
        notes: undefined,
      });
    });
    expect(await screen.findByText(newCustomer.name)).toBeTruthy();
    expect(
      screen.queryByRole('heading', { name: 'Nuevo cliente' }),
    ).toBeNull();
  });

  it('mantiene abierto el formulario y muestra el error de creación', async () => {
    const user = userEvent.setup();
    vi.mocked(api.post).mockRejectedValue(new Error('Cliente duplicado'));

    await renderCustomersPage();
    await user.click(screen.getByRole('button', { name: 'Nuevo cliente' }));
    await completeCustomerForm(user, 'Cliente Duplicado');
    await user.click(
      screen.getByRole('button', { name: 'Registrar cliente' }),
    );

    expect(await screen.findByText('Cliente duplicado')).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Nuevo cliente' }),
    ).toBeTruthy();
  });

  it('edita con el payload existente y sin campos de lifecycle', async () => {
    const user = userEvent.setup();
    const updatedCustomer = {
      ...clinicCustomer,
      name: 'Clínica Norte Actualizada',
    };
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: customers } as never)
      .mockResolvedValue({ data: [updatedCustomer, hospitalCustomer] } as never);
    vi.mocked(api.patch).mockResolvedValue({ data: updatedCustomer } as never);

    await renderCustomersPage();
    await chooseCustomerAction(user, clinicCustomer.name, 'Editar');
    const nameInput = screen.getByRole('textbox', { name: 'Nombre' });
    await user.clear(nameInput);
    await user.type(nameInput, updatedCustomer.name);
    await user.click(
      screen.getByRole('button', { name: 'Guardar cambios' }),
    );

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith(
        `/customers/${clinicCustomer.id}`,
        {
          name: updatedCustomer.name,
          type: clinicCustomer.type,
          email: clinicCustomer.email,
          phone: clinicCustomer.phone,
          contactName: clinicCustomer.contactName,
          address: clinicCustomer.address,
          notes: clinicCustomer.notes,
        },
      );
    });
    expect(await screen.findByText(updatedCustomer.name)).toBeTruthy();
  });

  it('desactiva con lenguaje no destructivo y refresca la lista activa', async () => {
    const user = userEvent.setup();
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: customers } as never)
      .mockResolvedValueOnce({ data: [hospitalCustomer] } as never);

    await renderCustomersPage();
    await chooseCustomerAction(user, clinicCustomer.name, 'Desactivar');

    expect(
      screen.getByRole('heading', { name: 'Desactivar cliente' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /El cliente dejará de aparecer en las operaciones nuevas\. Su historial se conservará\./,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/eliminar/i)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(api.delete).toHaveBeenCalledWith(
      `/customers/${clinicCustomer.id}`,
    );
    await waitFor(() => {
      expect(screen.queryByText(clinicCustomer.name)).toBeNull();
    });
    expect(screen.getByText(hospitalCustomer.name)).toBeTruthy();
  });

  it('conserva el cliente y permite reintentar cuando falla la desactivación', async () => {
    const user = userEvent.setup();
    vi.mocked(api.delete).mockRejectedValue(
      new Error('No fue posible desactivar este cliente'),
    );

    await renderCustomersPage();
    await chooseCustomerAction(user, clinicCustomer.name, 'Desactivar');
    await user.click(screen.getByRole('button', { name: 'Desactivar' }));

    expect(
      await screen.findByText('No fue posible desactivar este cliente'),
    ).toBeTruthy();
    expect(screen.getAllByText(clinicCustomer.name).length).toBeGreaterThan(0);
    expect(api.delete).toHaveBeenCalledTimes(1);
  });
});
